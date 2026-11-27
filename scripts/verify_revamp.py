#!/usr/bin/env python3
"""
scripts/verify_revamp.py — Deterministic Art Validator for GRAPHICS_REVAMP.md.
Exits non-zero on ANY failure.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from PIL import Image

from palette import MASTER_RGB_SET, luminance

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "public" / "assets"
BG_DIR = ASSETS_DIR / "bg"
MAPS_DIR = ASSETS_DIR / "maps"
SPRITES_DIR = ASSETS_DIR / "sprites"
PREVIEW_OUT = ROOT / "docs" / "art-refs" / "preview_verification.png"

REQUIRED_BGS = {
    "bg_title_lanka.png": (320, 180),
    "bg_sky.png": (320, 180),
    "bg_far_spires.png": (320, 180),
    "bg_mid_palace.png": (320, 180),
}

REQUIRED_ASEPRITE = {
    "hanuman": {
        "path": SPRITES_DIR,
        "tags": ["idle", "run", "jump", "fall", "wall_slide", "tail_whip", "hurt"],
        "is_character": True,
        "grounded_tags": {"idle", "run", "tail_whip"},
    },
    "rakshasa_guard": {
        "path": SPRITES_DIR,
        "tags": ["idle", "patrol", "aim", "shoot", "knockback"],
        "is_character": True,
        "grounded_tags": {"idle", "patrol"},
    },
    "props_lanka": {
        "path": SPRITES_DIR,
        "tags": ["torana_arch", "sacred_shrine", "brass_diya", "wall_sconce"],
        "is_character": False,
        "grounded_tags": set(),
    },
    "fx_fire": {
        "path": SPRITES_DIR,
        "tags": ["fire_tile_loop", "ember_spark", "arrow", "sacred_warn"],
        "is_character": False,
        "grounded_tags": set(),
    },
}


def check_palette_and_alpha(img: Image.Image, label: str, binary_alpha: bool = True) -> list[str]:
    errors: list[str] = []
    rgba = img.convert("RGBA")
    px = rgba.load()
    bad_colors: set[tuple[int, int, int]] = set()
    bad_alpha: set[int] = set()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = px[x, y]
            if binary_alpha and a not in (0, 255):
                bad_alpha.add(a)
            if a > 0 and (r, g, b) not in MASTER_RGB_SET:
                bad_colors.add((r, g, b))
    if bad_alpha:
        errors.append(f"{label}: non-binary alpha values found: {sorted(bad_alpha)[:5]}")
    if bad_colors:
        errors.append(f"{label}: out-of-palette RGB values found: {list(bad_colors)[:5]}")
    return errors


def frame_diff_ratio(im_a: Image.Image, im_b: Image.Image) -> float:
    if im_a.size != im_b.size:
        return 1.0
    pa = im_a.load()
    pb = im_b.load()
    diff = 0
    opaque = 0
    for y in range(im_a.height):
        for x in range(im_a.width):
            ca = pa[x, y]
            cb = pb[x, y]
            if ca[3] > 0 or cb[3] > 0:
                opaque += 1
                if ca != cb:
                    diff += 1
    return diff / max(1, opaque)


def top_opaque_y(img: Image.Image, x: int) -> int:
    px = img.load()
    for y in range(img.height):
        if px[x, y][3] > 0:
            return y
    return img.height


def mean_opaque_luminance(img: Image.Image) -> float:
    px = img.load()
    total = 0.0
    count = 0
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 0:
                total += luminance((r, g, b))
                count += 1
    return total / max(1, count)


def max_region_luminance(img: Image.Image, x0: int, y0: int, x1: int, y1: int) -> float:
    px = img.load()
    mx = 0.0
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a > 0:
                mx = max(mx, luminance((r, g, b)))
    return mx


def validate_aseprite(name: str, spec: dict, errors: list[str]) -> tuple[Image.Image | None, dict | None]:
    base: Path = spec["path"]
    png_path = base / f"{name}.png"
    json_path = base / f"{name}.json"

    if not png_path.exists():
        errors.append(f"Missing {png_path}")
        return None, None
    if not json_path.exists():
        errors.append(f"Missing {json_path}")
        return None, None

    img = Image.open(png_path).convert("RGBA")
    with open(json_path, "r", encoding="utf-8") as fp:
        data = json.load(fp)

    meta = data.get("meta", {})
    size = meta.get("size", {})
    if size.get("w") != img.width or size.get("h") != img.height:
        errors.append(f"{name}: JSON size {size} != PNG ({img.width}x{img.height})")

    errors.extend(check_palette_and_alpha(img, name))

    frames = data.get("frames", {})
    frame_tags = meta.get("frameTags", [])
    tag_map = {t["name"]: t for t in frame_tags}

    for req_tag in spec["tags"]:
        if req_tag not in tag_map:
            errors.append(f"{name}: missing tag '{req_tag}'")

    num_frames = len(frames)
    frame_imgs: list[Image.Image] = []
    for i in range(num_frames):
        fkey = f"{name} {i}.aseprite"
        if fkey not in frames:
            errors.append(f"{name}: missing frame key '{fkey}'")
            continue
        r = frames[fkey]["frame"]
        crop = img.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        frame_imgs.append(crop)

    # Multi-frame consecutive diff check (>= 3% of opaque pixels)
    for t in frame_tags:
        f_idx, t_idx = t["from"], t["to"]
        if f_idx < 0 or t_idx >= num_frames or f_idx > t_idx:
            errors.append(f"{name}: invalid tag bounds {t}")
            continue
        for i in range(f_idx, t_idx):
            ratio = frame_diff_ratio(frame_imgs[i], frame_imgs[i + 1])
            if ratio < 0.03:
                errors.append(
                    f"{name} tag '{t['name']}' frames {i}->{i+1}: diff {ratio:.2%} < 3% (static duplicate)"
                )

    if spec["is_character"]:
        idx_to_tag = {}
        for t in frame_tags:
            for i in range(t["from"], t["to"] + 1):
                idx_to_tag[i] = t["name"]

        for i, crop in enumerate(frame_imgs):
            px = crop.load()
            colors = set()
            min_x, max_x = crop.width, -1
            min_y, max_y = crop.height, -1
            opaque = 0
            for y in range(crop.height):
                for x in range(crop.width):
                    r, g, b, a = px[x, y]
                    if a > 0:
                        opaque += 1
                        colors.add((r, g, b))
                        min_x = min(min_x, x)
                        max_x = max(max_x, x)
                        min_y = min(min_y, y)
                        max_y = max(max_y, y)

            tag_name = idx_to_tag.get(i, "")
            if len(colors) < 7:
                errors.append(f"{name} frame {i} ({tag_name}): only {len(colors)} colors (< 7)")

            bbox_area = max(1, (max_x - min_x + 1) * (max_y - min_y + 1))
            bbox_cov = opaque / bbox_area
            if bbox_cov < 0.18:
                errors.append(f"{name} frame {i} ({tag_name}): bbox coverage {bbox_cov:.2%} < 18%")

            if tag_name in spec["grounded_tags"] and max_y not in (crop.height - 1, crop.height - 2):
                errors.append(
                    f"{name} frame {i} ({tag_name}): lowest opaque pixel y={max_y}, expected {crop.height-2}..{crop.height-1}"
                )

    return img, data


def build_preview_verification(
    bgs: dict[str, Image.Image],
    tileset: Image.Image,
    props_img: Image.Image,
    props_data: dict,
    hanuman_img: Image.Image,
    hanuman_data: dict,
    guard_img: Image.Image,
    guard_data: dict,
    fx_img: Image.Image,
    fx_data: dict,
) -> None:
    """Composite a 320x180 gameplay mockup and upscale 3x (960x540) nearest-neighbor."""
    scene = Image.new("RGBA", (320, 180), (9, 11, 23, 255))
    scene.paste(bgs["bg_sky.png"], (0, 0), bgs["bg_sky.png"])
    scene.paste(bgs["bg_far_spires.png"], (0, 0), bgs["bg_far_spires.png"])
    scene.paste(bgs["bg_mid_palace.png"], (0, 0), bgs["bg_mid_palace.png"])

    def paste_tile(col: int, row: int, tx: int, ty: int) -> None:
        tile = tileset.crop((col * 16, row * 16, (col + 1) * 16, (row + 1) * 16))
        scene.paste(tile, (tx * 16, ty * 16), tile)

    # Rooftop left stone platform (tx 0..5, ty 8..11)
    for tx in range(6):
        paste_tile(0 if tx == 0 else (3 if tx == 5 else (1 if tx % 2 == 1 else 2)), 0, tx, 8)
        for ty in range(9, 12):
            paste_tile(4 if (tx + ty) % 2 == 0 else 5, 0, tx, ty)

    # Burning WOOD_ROOF bridge (tx 6..10, ty 8)
    for tx in range(6, 11):
        pos = 0 if tx == 6 else (2 if tx == 10 else 1)
        state = 6 if tx <= 8 else 3  # burning + igniting
        paste_tile(state + pos, 1, tx, 8)

    # Sacred zone right terrace (tx 11..14, ty 8..11)
    paste_tile(0, 3, 11, 8)
    paste_tile(2, 3, 12, 8)
    paste_tile(3, 3, 13, 8)
    paste_tile(1, 3, 14, 8)
    for tx in range(11, 15):
        for ty in range(9, 12):
            paste_tile(1 if tx in (11, 14) else 2, 3, tx, ty)

    # Banner hanging (tx 4..5, ty 6)
    paste_tile(0, 2, 4, 6)
    paste_tile(1, 2, 5, 6)

    # Torana arch & Sacred Shrine & Brass Diya
    def paste_frame(img: Image.Image, data: dict, fkey: str, dx: int, dy: int) -> None:
        r = data["frames"][fkey]["frame"]
        crop = img.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        scene.paste(crop, (dx, dy), crop)

    paste_frame(props_img, props_data, "props_lanka 8.aseprite", 16, 48)   # golden_shikhara behind left parapet
    paste_frame(props_img, props_data, "props_lanka 9.aseprite", 248, 80)  # golden_roof_dome behind right parapet
    paste_frame(props_img, props_data, "props_lanka 0.aseprite", 8, 64)    # torana_arch
    paste_frame(props_img, props_data, "props_lanka 1.aseprite", 200, 80)  # sacred_shrine
    paste_frame(props_img, props_data, "props_lanka 2.aseprite", 76, 96)   # brass_diya
    paste_tile(9, 0, 2, 7)
    paste_tile(9, 0, 3, 7)
    paste_tile(9, 0, 16, 7)
    paste_tile(9, 0, 17, 7)

    # Hanuman jumping with flame plume
    paste_frame(hanuman_img, hanuman_data, "hanuman 10.aseprite", 104, 82)
    # Rakshasa guard on stone
    paste_frame(guard_img, guard_data, "rakshasa_guard 2.aseprite", 256, 96)
    # Fire overlay on burning roof
    paste_frame(fx_img, fx_data, "fx_fire 0.aseprite", 96, 118)
    paste_frame(fx_img, fx_data, "fx_fire 1.aseprite", 112, 118)

    # Right stone tower
    for tx in range(15, 20):
        paste_tile(0 if tx == 15 else (3 if tx == 19 else 1), 0, tx, 8)
        for ty in range(9, 12):
            paste_tile(4 if (tx + ty) % 2 == 0 else 5, 0, tx, ty)

    PREVIEW_OUT.parent.mkdir(parents=True, exist_ok=True)
    upscaled = scene.resize((960, 540), Image.Resampling.NEAREST)
    upscaled.save(PREVIEW_OUT, optimize=True)


def main() -> int:
    errors: list[str] = []
    bgs: dict[str, Image.Image] = {}

    # 1-3. Backgrounds
    for fname, expected_size in REQUIRED_BGS.items():
        p = BG_DIR / fname
        if not p.exists():
            errors.append(f"Missing {p}")
            continue
        im = Image.open(p).convert("RGBA")
        if im.size != expected_size:
            errors.append(f"{fname}: size {im.size} != {expected_size}")
        errors.extend(check_palette_and_alpha(im, fname, binary_alpha=True))
        bgs[fname] = im

    # 6. Seamless parallax wrap
    for bg_name in ("bg_far_spires.png", "bg_mid_palace.png"):
        if bg_name in bgs:
            im = bgs[bg_name]
            hl = top_opaque_y(im, 0)
            hr = top_opaque_y(im, im.width - 1)
            if abs(hl - hr) > 2:
                errors.append(f"{bg_name}: parallax seam mismatch x=0 (y={hl}) vs x=319 (y={hr})")

    # 7. Contrast separation
    if "bg_far_spires.png" in bgs:
        lum = mean_opaque_luminance(bgs["bg_far_spires.png"])
        if lum >= 45:
            errors.append(f"bg_far_spires.png mean luminance {lum:.1f} >= 45")
    if "bg_mid_palace.png" in bgs:
        lum = mean_opaque_luminance(bgs["bg_mid_palace.png"])
        if lum >= 95:
            errors.append(f"bg_mid_palace.png mean luminance {lum:.1f} >= 95")

    # Tileset
    tileset_path = MAPS_DIR / "tileset_lanka.png"
    tileset_img: Image.Image | None = None
    if not tileset_path.exists():
        errors.append(f"Missing {tileset_path}")
    else:
        tileset_img = Image.open(tileset_path).convert("RGBA")
        if tileset_img.size != (256, 128):
            errors.append(f"tileset_lanka.png size {tileset_img.size} != (256, 128)")
        errors.extend(check_palette_and_alpha(tileset_img, "tileset_lanka.png"))
        stone_max_lum = max_region_luminance(tileset_img, 0, 0, 192, 6)
        if stone_max_lum <= 180:
            errors.append(f"STONE top edge max luminance {stone_max_lum:.1f} <= 180")

    # Aseprite sheets
    loaded: dict[str, tuple[Image.Image, dict]] = {}
    for name, spec in REQUIRED_ASEPRITE.items():
        im, data = validate_aseprite(name, spec, errors)
        if im is not None and data is not None:
            loaded[name] = (im, data)

    if "hanuman" in loaded:
        h_lum = max_region_luminance(loaded["hanuman"][0], 0, 0, loaded["hanuman"][0].width, 32)
        if h_lum <= 180:
            errors.append(f"Hanuman fire core luminance {h_lum:.1f} <= 180")

    # Total asset size < 500 KB (excluding old unreferenced root files once cleaned)
    total_bytes = sum(
        p.stat().st_size
        for sub in (BG_DIR, MAPS_DIR, SPRITES_DIR)
        for p in sub.rglob("*")
        if p.is_file()
    )
    if total_bytes >= 500 * 1024:
        errors.append(f"Asset bundle size {total_bytes} bytes >= 500 KB")

    # 8. Preview contact sheet
    if (
        len(bgs) == 4
        and tileset_img is not None
        and all(k in loaded for k in ("props_lanka", "hanuman", "rakshasa_guard", "fx_fire"))
    ):
        build_preview_verification(
            bgs,
            tileset_img,
            loaded["props_lanka"][0], loaded["props_lanka"][1],
            loaded["hanuman"][0], loaded["hanuman"][1],
            loaded["rakshasa_guard"][0], loaded["rakshasa_guard"][1],
            loaded["fx_fire"][0], loaded["fx_fire"][1],
        )
        print(f"Generated preview mockup: {PREVIEW_OUT}")

    if errors:
        print("REVAMP ART VERIFICATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"ALL REVAMP ART CHECKS PASSED! (Total new asset bundle: {total_bytes / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

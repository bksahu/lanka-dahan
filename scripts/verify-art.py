#!/usr/bin/env python3
"""
scripts/verify-art.py — Automated Art Validator for Lanka Dahan.
Exits non-zero on ANY failure:
1. Confirms every required PNG and JSON file exists in public/assets/.
2. Validates every Aseprite JSON matches its PNG dimensions, frameTags bounds, and required tags.
3. Anti-Placeholder Check per character sprite frame:
   - Non-transparent pixel coverage between 12% and 75%
   - At least 6 distinct palette colors per character frame
   - All opaque pixels belong strictly to the 24-color Master Palette
   - Feet alignment check: bottom 3 rows (y=29..31) contain opaque pixels on grounded animations
4. Generates debug/art-contact-sheet.png (4x nearest-neighbor upscale labeled by asset).
"""

import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "public" / "assets"
DEBUG_DIR = ROOT / "debug"
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

MASTER_PALETTE = {
    (11, 10, 20),     # OUTLINE
    (18, 20, 43),     # SKY_DARK
    (29, 34, 71),     # SKY_MID
    (45, 53, 97),     # SKY_LIGHT
    (110, 68, 28),    # GOLD_SHADOW
    (184, 121, 36),   # GOLD_MID
    (240, 184, 61),   # GOLD_BRIGHT
    (255, 241, 168),  # GOLD_SPEC
    (71, 35, 24),     # WOOD_DARK
    (125, 61, 34),    # WOOD_MID
    (105, 20, 38),    # CRIMSON_DARK
    (184, 35, 58),    # CRIMSON_BRIGHT
    (143, 59, 27),    # SKIN_SHADOW
    (212, 100, 42),   # SKIN_MID
    (242, 148, 75),   # SKIN_LIGHT
    (255, 122, 26),   # SAFFRON
    (242, 237, 225),  # CLOTH_WHITE
    (36, 28, 51),     # DEMON_SHADOW
    (74, 58, 94),     # DEMON_MID
    (117, 97, 138),   # DEMON_LIGHT
    (255, 251, 224),  # FIRE_CORE
    (255, 212, 59),   # FIRE_BRIGHT
    (215, 230, 240),  # SACRED_MARBLE
    (45, 153, 115),   # SACRED_EMERALD
}

REQUIRED_ASEPRITE = {
    "hanuman": {
        "tags": ["idle", "run", "jump", "fall", "wall_slide", "tail_whip", "hurt"],
        "is_character": True,
        "grounded_tags": {"idle", "run"},
        "skip_coverage_tags": set(),
    },
    "rakshasa_guard": {
        "tags": ["idle", "patrol", "attack", "hurt"],
        "is_character": True,
        "grounded_tags": {"idle", "patrol"},
        "skip_coverage_tags": set(),
    },
    "rakshasa_archer": {
        "tags": ["idle", "aim", "shoot", "hurt", "arrow"],
        "is_character": True,
        "grounded_tags": {"idle"},
        "skip_coverage_tags": {"arrow"},
    },
    "lanka_tiles": {
        "tags": ["stone", "wood_roof", "banner", "sacred", "decor"],
        "is_character": False,
        "grounded_tags": set(),
        "skip_coverage_tags": set(),
    },
    "fx_fire": {
        "tags": ["flame_loop", "ember", "whip_slash", "sacred_shield"],
        "is_character": False,
        "grounded_tags": set(),
        "skip_coverage_tags": set(),
    },
}

REQUIRED_BACKGROUNDS = ["bg_sky.png", "bg_mountains.png", "bg_palace_mid.png"]


def validate_palette(img: Image.Image, label: str) -> list[str]:
    errors = []
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    bad_colors = set()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if (r, g, b) not in MASTER_PALETTE:
                bad_colors.add((r, g, b, a))
    if bad_colors:
        errors.append(f"{label}: found {len(bad_colors)} non-palette colors, e.g. {list(bad_colors)[:3]}")
    return errors


def validate_aseprite(name: str, spec: dict) -> tuple[list[str], Image.Image | None]:
    errors: list[str] = []
    png_path = ASSETS_DIR / f"{name}.png"
    json_path = ASSETS_DIR / f"{name}.json"

    if not png_path.exists():
        return [f"Missing {png_path}"], None
    if not json_path.exists():
        return [f"Missing {json_path}"], None

    img = Image.open(png_path).convert("RGBA")
    with open(json_path, "r", encoding="utf-8") as fp:
        data = json.load(fp)

    meta = data.get("meta", {})
    size = meta.get("size", {})
    if size.get("w") != img.width or size.get("h") != img.height:
        errors.append(f"{name}: JSON size {size} != PNG size ({img.width}, {img.height})")

    errors.extend(validate_palette(img, name))

    frames = data.get("frames", {})
    frame_tags = meta.get("frameTags", [])
    tag_map = {t["name"]: t for t in frame_tags}

    for req_tag in spec["tags"]:
        if req_tag not in tag_map:
            errors.append(f"{name}: missing required frameTag '{req_tag}'")

    num_frames = len(frames)
    for t in frame_tags:
        f_idx, t_idx = t.get("from", -1), t.get("to", -1)
        if f_idx < 0 or t_idx >= num_frames or f_idx > t_idx:
            errors.append(f"{name}: invalid frameTag bounds {t}")

    # Build frame index -> tag name mapping
    idx_to_tag: dict[int, str] = {}
    for t in frame_tags:
        for i in range(t["from"], t["to"] + 1):
            idx_to_tag[i] = t["name"]

    if spec["is_character"]:
        for i in range(num_frames):
            fkey = f"{name} {i}.aseprite"
            if fkey not in frames:
                errors.append(f"{name}: missing frame key '{fkey}'")
                continue
            frect = frames[fkey]["frame"]
            fx, fy, fw, fh = frect["x"], frect["y"], frect["w"], frect["h"]
            crop = img.crop((fx, fy, fx + fw, fy + fh))
            tag_name = idx_to_tag.get(i, "")

            px = crop.load()
            opaque = 0
            colors = set()
            for y in range(fh):
                for x in range(fw):
                    r, g, b, a = px[x, y]
                    if a > 0:
                        opaque += 1
                        colors.add((r, g, b))

            total = fw * fh
            cov = opaque / total
            if tag_name not in spec["skip_coverage_tags"]:
                if not (0.12 <= cov <= 0.75):
                    errors.append(f"{name} frame {i} ({tag_name}): coverage {cov:.2%} not in [12%, 75%]")
                if len(colors) < 6:
                    errors.append(f"{name} frame {i} ({tag_name}): only {len(colors)} distinct colors (< 6)")

            if tag_name in spec["grounded_tags"]:
                feet_opaque = sum(
                    1
                    for y in range(fh - 3, fh)
                    for x in range(fw)
                    if px[x, y][3] > 0
                )
                if feet_opaque == 0:
                    errors.append(f"{name} frame {i} ({tag_name}): no opaque pixels in bottom 3 rows (y=29..31)")

    return errors, img


def generate_contact_sheet(images: list[tuple[str, Image.Image]]) -> None:
    scale = 4
    pad = 12
    label_h = 16
    max_w = max(img.width * scale for _, img in images) + pad * 2
    total_h = sum(img.height * scale + label_h + pad for _, img in images) + pad

    sheet = Image.new("RGBA", (max(max_w, 400), total_h), (18, 20, 43, 255))
    draw = ImageDraw.Draw(sheet)

    y = pad
    for name, img in images:
        draw.text((pad, y), f"{name} ({img.width}x{img.height})", fill=(240, 184, 61, 255))
        y += label_h
        upscaled = img.resize((img.width * scale, img.height * scale), Image.Resampling.NEAREST)
        sheet.paste(upscaled, (pad, y), upscaled)
        y += upscaled.height + pad

    out_path = DEBUG_DIR / "art-contact-sheet.png"
    sheet.save(out_path)
    print(f"Generated contact sheet: {out_path}")


def main() -> int:
    all_errors: list[str] = []
    sheet_images: list[tuple[str, Image.Image]] = []

    for name, spec in REQUIRED_ASEPRITE.items():
        errs, img = validate_aseprite(name, spec)
        all_errors.extend(errs)
        if img is not None:
            sheet_images.append((name, img))

    for bg in REQUIRED_BACKGROUNDS:
        p = ASSETS_DIR / bg
        if not p.exists():
            all_errors.append(f"Missing {p}")
            continue
        img = Image.open(p).convert("RGBA")
        if img.size != (320, 180):
            all_errors.append(f"{bg}: expected (320, 180), got {img.size}")
        all_errors.extend(validate_palette(img, bg))
        sheet_images.append((bg, img))

    if sheet_images:
        generate_contact_sheet(sheet_images)

    if all_errors:
        print("ART VERIFICATION FAILED:")
        for e in all_errors:
            print(f"  - {e}")
        return 1

    print("ALL ART VERIFICATION CHECKS PASSED!")
    return 0


if __name__ == "__main__":
    sys.exit(main())

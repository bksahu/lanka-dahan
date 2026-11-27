#!/usr/bin/env python3
"""
scripts/verify_revamp.py — Gate 1 Deterministic Linter & Dual Diagnostics.
Enforces strict schema, 32-color quantization, binary alpha, 4-way connected-component
integrity, cross-frame proportion lock, regional color invariants, ground lock,
animation motion delta, parallax seamlessness/luminance, and always generates:
  - docs/art-refs/preview_sprites_4x.png
  - docs/art-refs/preview_scene_4x.png
  - docs/art-refs/ascii_inspection.txt
Exits non-zero on ANY failure.
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw

from palette import MASTER_RGB, MASTER_RGB_SET, image_to_legend_lines, luminance

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "public" / "assets"
BG_DIR = ASSETS_DIR / "bg"
MAPS_DIR = ASSETS_DIR / "maps"
SPRITES_DIR = ASSETS_DIR / "sprites"
REFS_DIR = ROOT / "docs" / "art-refs"

PREVIEW_OUT = REFS_DIR / "preview_verification.png"
SPRITES_4X_OUT = REFS_DIR / "preview_sprites_4x.png"
SCENE_4X_OUT = REFS_DIR / "preview_scene_4x.png"
ASCII_OUT = REFS_DIR / "ascii_inspection.txt"

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
        "frame_size": (48, 32),
        "hitbox": (18, 10, 12, 22),  # centered bottom inside 48x32
    },
    "rakshasa_guard": {
        "path": SPRITES_DIR,
        "tags": ["idle", "patrol", "aim", "shoot", "knockback"],
        "is_character": True,
        "grounded_tags": {"idle", "patrol"},
        "frame_size": (32, 32),
        "hitbox": (6, 4, 20, 28),   # matches enemySim.ts getEnemyHitbox
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

SVARNA_GOLD_SET = {
    MASTER_RGB["GOLD_MID"],
    MASTER_RGB["GOLD_BRIGHT"],
    MASTER_RGB["GOLD_SPEC"],
}
CRIMSON_SET = {
    MASTER_RGB["CRIMSON_MID"],
    MASTER_RGB["CRIMSON_BRIGHT"],
}
ROYAL_BLUE_RGB = MASTER_RGB["SASH_BLUE"]
ACTIVE_FIRE_SET = {
    MASTER_RGB["FIRE_ORANGE"],
    MASTER_RGB["FIRE_GOLD"],
    MASTER_RGB["FIRE_CORE"],
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


def connected_components_4way(img: Image.Image) -> list[dict]:
    """Return 4-way BFS opaque components sorted largest-first."""
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    comps: list[dict] = []
    for y in range(h):
        for x in range(w):
            if visited[y][x] or px[x, y][3] == 0:
                continue
            q = deque([(x, y)])
            visited[y][x] = True
            pixels = []
            min_x = max_x = x
            min_y = max_y = y
            while q:
                cx, cy = q.popleft()
                pixels.append((cx, cy))
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and px[nx, ny][3] > 0:
                        visited[ny][nx] = True
                        q.append((nx, ny))
            comps.append({
                "area": len(pixels),
                "bbox": (min_x, min_y, max_x, max_y),
                "height": max_y - min_y + 1,
                "pixels": pixels,
            })
    comps.sort(key=lambda c: c["area"], reverse=True)
    return comps


def validate_aseprite(
    name: str, spec: dict, errors: list[str]
) -> tuple[Image.Image | None, dict | None, list[Image.Image]]:
    base: Path = spec["path"]
    png_path = base / f"{name}.png"
    json_path = base / f"{name}.json"

    if not png_path.exists():
        errors.append(f"Missing {png_path}")
        return None, None, []
    if not json_path.exists():
        errors.append(f"Missing {json_path}")
        return None, None, []

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
        if "frame_size" in spec and (r["w"], r["h"]) != spec["frame_size"]:
            errors.append(f"{name} frame {i}: size {(r['w'], r['h'])} != {spec['frame_size']}")
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

    if spec["is_character"] and frame_imgs:
        idx_to_tag: dict[int, str] = {}
        for t in frame_tags:
            for i in range(t["from"], t["to"] + 1):
                idx_to_tag[i] = t["name"]

        idle0_comps = connected_components_4way(frame_imgs[0])
        idle0_main_h = idle0_comps[0]["height"] if idle0_comps else 1
        idle0_main_area = idle0_comps[0]["area"] if idle0_comps else 1
        lock_tags = {"idle", "run", "jump", "fall", "wall_slide"}

        for i, crop in enumerate(frame_imgs):
            tag_name = idx_to_tag.get(i, "")
            px = crop.load()
            colors: set[tuple[int, int, int]] = set()
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

            # 2. Connected-component integrity (>1 component with area > 8px fails)
            comps = connected_components_4way(crop)
            large_comps = [c for c in comps if c["area"] > 8]
            if len(large_comps) != 1:
                areas = [c["area"] for c in large_comps]
                errors.append(
                    f"{name} frame {i} ({tag_name}): {len(large_comps)} large connected components (areas={areas}, expected 1)"
                )

            # 3. Cross-frame proportion lock for Hanuman
            if name == "hanuman" and tag_name in lock_tags and comps:
                main_h = comps[0]["height"]
                main_area = comps[0]["area"]
                h_dev = abs(main_h - idle0_main_h) / max(1, idle0_main_h)
                a_dev = abs(main_area - idle0_main_area) / max(1, idle0_main_area)
                if h_dev > 0.20:
                    errors.append(
                        f"hanuman frame {i} ({tag_name}): height {main_h} deviates {h_dev:.1%} > 20% from idle_0 ({idle0_main_h})"
                    )
                if a_dev > 0.25:
                    errors.append(
                        f"hanuman frame {i} ({tag_name}): area {main_area} deviates {a_dev:.1%} > 25% from idle_0 ({idle0_main_area})"
                    )

            # 4. Regional color invariants for Hanuman
            if name == "hanuman" and max_y >= min_y:
                bh = max_y - min_y + 1
                top_cutoff = min_y + int(bh * 0.45)
                low_cutoff = min_y + int(bh * 0.35)
                has_top_gold = False
                has_mid_crimson = False
                has_mid_blue = False
                has_fire = False
                for y in range(crop.height):
                    for x in range(crop.width):
                        r, g, b, a = px[x, y]
                        if a == 0:
                            continue
                        rgb = (r, g, b)
                        if y <= top_cutoff and rgb in SVARNA_GOLD_SET:
                            has_top_gold = True
                        if y >= low_cutoff:
                            if rgb in CRIMSON_SET:
                                has_mid_crimson = True
                            if rgb == ROYAL_BLUE_RGB:
                                has_mid_blue = True
                        if rgb in ACTIVE_FIRE_SET:
                            has_fire = True
                if not has_top_gold:
                    errors.append(f"hanuman frame {i} ({tag_name}): missing Svarna Gold in top 45%")
                if not has_mid_crimson or not has_mid_blue:
                    errors.append(
                        f"hanuman frame {i} ({tag_name}): missing lower Crimson ({has_mid_crimson}) or Royal Blue ({has_mid_blue})"
                    )
                if not has_fire:
                    errors.append(f"hanuman frame {i} ({tag_name}): missing active fire ramp colors")

    return img, data, frame_imgs


def render_sprites_4x(
    loaded: dict[str, tuple[Image.Image, dict, list[Image.Image]]],
    tileset: Image.Image | None,
) -> None:
    """Render 4x sprites + tileset diagnostic sheet with magenta baseline & cyan hitbox."""
    scale = 4
    rows_to_draw: list[tuple[str, list[tuple[str, Image.Image, tuple[int, int, int, int] | None]]]] = []

    for sheet_name in ("hanuman", "rakshasa_guard", "props_lanka", "fx_fire"):
        if sheet_name not in loaded:
            continue
        _, data, frame_imgs = loaded[sheet_name]
        idx_to_label: dict[int, str] = {}
        for t in data["meta"]["frameTags"]:
            for j, idx in enumerate(range(t["from"], t["to"] + 1)):
                idx_to_label[idx] = f"{t['name']}_{j}"
        hb = REQUIRED_ASEPRITE[sheet_name].get("hitbox")
        items = [(idx_to_label.get(i, str(i)), im, hb) for i, im in enumerate(frame_imgs)]
        rows_to_draw.append((sheet_name, items))

    if tileset is not None:
        tile_items = []
        for row in range(5):
            for col in range(12):
                crop = tileset.crop((col * 16, row * 16, (col + 1) * 16, (row + 1) * 16))
                if crop.getbbox() is not None:
                    tile_items.append((f"r{row}c{col}", crop, None))
        rows_to_draw.append(("tileset_lanka", tile_items))

    pad = 8
    header_h = 18
    row_layouts: list[tuple[str, int, list[tuple[str, Image.Image, tuple[int, int, int, int] | None]]]] = []
    max_w = 640
    total_h = pad
    for title, items in rows_to_draw:
        row_h = max((im.height * scale + 26 for _, im, _ in items), default=64)
        row_w = pad + sum(max(im.width * scale, 48) + pad for _, im, _ in items)
        # Wrap long rows cleanly at 1600px
        wrapped: list[list[tuple[str, Image.Image, tuple[int, int, int, int] | None]]] = [[]]
        cx = pad
        for item in items:
            cell_w = max(item[1].width * scale, 52) + pad
            if cx + cell_w > 1580 and wrapped[-1]:
                wrapped.append([])
                cx = pad
            wrapped[-1].append(item)
            cx += cell_w
            max_w = max(max_w, cx)
        for sub_idx, sub_items in enumerate(wrapped):
            sub_title = title if sub_idx == 0 else f"{title} (cont.)"
            sub_h = max((im.height * scale + 24 for _, im, _ in sub_items), default=64) + header_h
            row_layouts.append((sub_title, sub_h, sub_items))
            total_h += sub_h + pad

    sheet = Image.new("RGBA", (max_w, total_h), (18, 22, 46, 255))
    draw = ImageDraw.Draw(sheet)

    y_cur = pad
    for title, row_h, items in row_layouts:
        draw.text((pad, y_cur), title, fill=(255, 230, 128, 255))
        x_cur = pad
        frame_y = y_cur + header_h
        for label, im, hb in items:
            sw, sh = im.width * scale, im.height * scale
            cell_w = max(sw, 52)
            up = im.resize((sw, sh), Image.Resampling.NEAREST)
            draw.rectangle((x_cur - 1, frame_y - 1, x_cur + sw, frame_y + sh), outline=(46, 51, 99, 255))
            sheet.paste(up, (x_cur, frame_y), up)
            # 1px magenta ground baseline at bottom of cell (y = height - 1)
            base_y = frame_y + (im.height - 1) * scale + 3
            draw.line((x_cur, base_y, x_cur + sw - 1, base_y), fill=(255, 0, 255, 255), width=1)
            # 1px cyan hitbox overlay for characters
            if hb is not None:
                hx, hy, hw, hh = hb
                draw.rectangle(
                    (x_cur + hx * scale, frame_y + hy * scale, x_cur + (hx + hw) * scale - 1, frame_y + (hy + hh) * scale - 1),
                    outline=(0, 255, 255, 255),
                )
            draw.text((x_cur, frame_y + sh + 4), label[:11], fill=(216, 221, 232, 255))
            x_cur += cell_w + pad
        y_cur += row_h + pad

    SPRITES_4X_OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(SPRITES_4X_OUT, optimize=True)


def compose_scene_1x(
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
) -> Image.Image:
    """Compose faithful 320x180 scene reading Aseprite JSONs & tileset."""
    scene = Image.new("RGBA", (320, 180), (9, 11, 23, 255))
    scene.paste(bgs["bg_sky.png"], (0, 0), bgs["bg_sky.png"])
    scene.paste(bgs["bg_far_spires.png"], (0, 0), bgs["bg_far_spires.png"])
    scene.paste(bgs["bg_mid_palace.png"], (0, 0), bgs["bg_mid_palace.png"])

    def paste_tile(col: int, row: int, tx: int, ty: int) -> None:
        tile = tileset.crop((col * 16, row * 16, (col + 1) * 16, (row + 1) * 16))
        scene.paste(tile, (tx * 16, ty * 16), tile)

    for tx in range(6):
        paste_tile(0 if tx == 0 else (3 if tx == 5 else (1 if tx % 2 == 1 else 2)), 0, tx, 8)
        paste_tile(4, 0, tx, 9)
        for ty in range(10, 12):
            paste_tile(6 if tx == 0 else (7 if tx == 5 else 5), 0, tx, ty)

    for tx in range(6, 11):
        paste_tile(8, 0, tx, 9)
        paste_tile(8, 0, tx, 10)
        paste_tile(8, 0, tx, 11)
        pos = 0 if tx == 6 else (2 if tx == 10 else 1)
        state = 6 if tx <= 8 else 3
        paste_tile(state + pos, 1, tx, 8)

    paste_tile(0, 3, 11, 8)
    paste_tile(2, 3, 12, 8)
    paste_tile(3, 3, 13, 8)
    paste_tile(1, 3, 14, 8)
    for tx in range(11, 15):
        for ty in range(9, 12):
            paste_tile(1 if tx in (11, 14) else 2, 3, tx, ty)

    paste_tile(0, 2, 4, 6)
    paste_tile(1, 2, 5, 6)

    def paste_frame(img: Image.Image, data: dict, fkey: str, dx: int, dy: int) -> None:
        r = data["frames"][fkey]["frame"]
        crop = img.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        scene.paste(crop, (dx, dy), crop)

    paste_frame(props_img, props_data, "props_lanka 8.aseprite", 16, 64)
    paste_frame(props_img, props_data, "props_lanka 9.aseprite", 248, 96)
    paste_frame(props_img, props_data, "props_lanka 0.aseprite", 8, 64)
    paste_frame(props_img, props_data, "props_lanka 1.aseprite", 200, 80)
    paste_frame(props_img, props_data, "props_lanka 2.aseprite", 76, 96)
    paste_tile(9, 0, 2, 7)
    paste_tile(9, 0, 3, 7)
    paste_tile(9, 0, 16, 7)
    paste_tile(9, 0, 17, 7)

    paste_frame(hanuman_img, hanuman_data, "hanuman 10.aseprite", 104, 82)
    paste_frame(guard_img, guard_data, "rakshasa_guard 2.aseprite", 256, 96)
    paste_frame(fx_img, fx_data, "fx_fire 0.aseprite", 96, 118)
    paste_frame(fx_img, fx_data, "fx_fire 1.aseprite", 112, 118)

    for tx in range(15, 20):
        paste_tile(0 if tx == 15 else (3 if tx == 19 else (1 if tx % 2 == 1 else 2)), 0, tx, 8)
        paste_tile(4, 0, tx, 9)
        for ty in range(10, 12):
            paste_tile(6 if tx == 15 else (7 if tx == 19 else 5), 0, tx, ty)

    return scene


def write_ascii_inspection(
    loaded: dict[str, tuple[Image.Image, dict, list[Image.Image]]],
    tileset: Image.Image | None,
) -> None:
    sections: list[str] = [
        "LANKA DAHAN — 1:1 SYMBOL-GRID ASCII INSPECTION",
        "Legend: .=transparent K=#090B17 H/L/G/g/k=Gold S/s/d=Skin/Sandstone R/r/c=Crimson B=BlueSash F/O/Y/W=Fire M/P/m/p=Marble E/e/a=Ashoka 1/2/3/4=Indigo",
        "",
    ]

    if "hanuman" in loaded:
        _, _, frames = loaded["hanuman"]
        picks = [
            ("hanuman:idle_0 (frame 0)", 0),
            ("hanuman:run_0 (frame 4)", 4),
            ("hanuman:run_2 (frame 6)", 6),
            ("hanuman:jump_0 (frame 10)", 10),
            ("hanuman:tail_whip_1 (frame 17)", 17),
        ]
        for title, idx in picks:
            if idx < len(frames):
                sections.append(f"=== {title} ===")
                sections.extend(image_to_legend_lines(frames[idx]))
                sections.append("")

    if "rakshasa_guard" in loaded:
        _, _, frames = loaded["rakshasa_guard"]
        for title, idx in [("rakshasa_guard:idle_0 (frame 0)", 0), ("rakshasa_guard:shoot_0 (frame 8)", 8)]:
            if idx < len(frames):
                sections.append(f"=== {title} ===")
                sections.extend(image_to_legend_lines(frames[idx]))
                sections.append("")

    if tileset is not None:
        tile_picks = [
            ("STONE_0 (col 0, row 0)", 0, 0),
            ("WOOD_NONE_M (col 1, row 1)", 1, 1),
            ("WOOD_BURNING_M (col 7, row 1)", 7, 1),
            ("SACRED_0 (col 0, row 3)", 0, 3),
        ]
        for title, col, row in tile_picks:
            crop = tileset.crop((col * 16, row * 16, (col + 1) * 16, (row + 1) * 16))
            sections.append(f"=== {title} ===")
            sections.extend(image_to_legend_lines(crop))
            sections.append("")

    ASCII_OUT.parent.mkdir(parents=True, exist_ok=True)
    ASCII_OUT.write_text("\n".join(sections), encoding="utf-8")


def main() -> int:
    errors: list[str] = []
    bgs: dict[str, Image.Image] = {}

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

    for bg_name in ("bg_far_spires.png", "bg_mid_palace.png"):
        if bg_name in bgs:
            im = bgs[bg_name]
            hl = top_opaque_y(im, 0)
            hr = top_opaque_y(im, im.width - 1)
            if abs(hl - hr) > 2:
                errors.append(f"{bg_name}: parallax seam mismatch x=0 (y={hl}) vs x=319 (y={hr})")

    if "bg_far_spires.png" in bgs:
        lum = mean_opaque_luminance(bgs["bg_far_spires.png"])
        if lum >= 45:
            errors.append(f"bg_far_spires.png mean luminance {lum:.1f} >= 45")
    if "bg_mid_palace.png" in bgs:
        lum = mean_opaque_luminance(bgs["bg_mid_palace.png"])
        if lum >= 95:
            errors.append(f"bg_mid_palace.png mean luminance {lum:.1f} >= 95")

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

    loaded: dict[str, tuple[Image.Image, dict, list[Image.Image]]] = {}
    for name, spec in REQUIRED_ASEPRITE.items():
        im, data, frame_imgs = validate_aseprite(name, spec, errors)
        if im is not None and data is not None:
            loaded[name] = (im, data, frame_imgs)

    if "hanuman" in loaded:
        h_lum = max_region_luminance(loaded["hanuman"][0], 0, 0, loaded["hanuman"][0].width, 32)
        if h_lum <= 180:
            errors.append(f"Hanuman fire core luminance {h_lum:.1f} <= 180")

    total_bytes = sum(
        p.stat().st_size
        for sub in (BG_DIR, MAPS_DIR, SPRITES_DIR)
        for p in sub.rglob("*")
        if p.is_file()
    )
    if total_bytes >= 500 * 1024:
        errors.append(f"Asset bundle size {total_bytes} bytes >= 500 KB")

    # Always render dual diagnostics even on failure so defects can be inspected directly
    render_sprites_4x(loaded, tileset_img)
    write_ascii_inspection(loaded, tileset_img)

    if (
        len(bgs) == 4
        and tileset_img is not None
        and all(k in loaded for k in ("props_lanka", "hanuman", "rakshasa_guard", "fx_fire"))
    ):
        scene_1x = compose_scene_1x(
            bgs,
            tileset_img,
            loaded["props_lanka"][0], loaded["props_lanka"][1],
            loaded["hanuman"][0], loaded["hanuman"][1],
            loaded["rakshasa_guard"][0], loaded["rakshasa_guard"][1],
            loaded["fx_fire"][0], loaded["fx_fire"][1],
        )
        REFS_DIR.mkdir(parents=True, exist_ok=True)
        scene_1x.resize((960, 540), Image.Resampling.NEAREST).save(PREVIEW_OUT, optimize=True)
        scene_1x.resize((1280, 720), Image.Resampling.NEAREST).save(SCENE_4X_OUT, optimize=True)
        print(f"Generated diagnostics: {SPRITES_4X_OUT.name}, {SCENE_4X_OUT.name}, {ASCII_OUT.name}")

    if errors:
        print("REVAMP ART VERIFICATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"ALL REVAMP ART CHECKS PASSED! (Total new asset bundle: {total_bytes / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

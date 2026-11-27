#!/usr/bin/env python3
"""
scripts/palette.py — 32-Color Mineral-Pigment Master Palette, strict quantization,
and Aseprite JSON Hash exporter for Lanka Dahan.
"""

from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

# 32 Locked Colors from GRAPHICS_REVAMP.md Section 2
PALETTE_HEX: dict[str, str] = {
    # Night Sky & Ink
    "INK": "#090B17",
    "SKY_DEEP": "#12162E",
    "SKY_MID": "#1D2247",
    "SKY_HIGH": "#2E3363",
    "SKY_HAZE": "#4B4A7A",
    # Ocean & Moon
    "OCEAN_DEEP": "#0E2034",
    "OCEAN_MID": "#1E3A54",
    "OCEAN_LIGHT": "#4B6D8A",
    "MOON_MIST": "#A9C4DC",
    "MOON_PURE": "#F2F6FC",
    # Svarna Gold
    "GOLD_DARK": "#4D2812",
    "GOLD_SHADOW": "#8A4E1D",
    "GOLD_MID": "#C78028",
    "GOLD_BRIGHT": "#F2B63D",
    "GOLD_SPEC": "#FFE680",
    # Sandstone & Timber
    "TIMBER_DARK": "#3B2018",
    "TIMBER_MID": "#6E3F2C",
    "SAND_MID": "#A66848",
    "SAND_LIGHT": "#D69B72",
    # Crimson Banners
    "CRIMSON_DARK": "#5C111B",
    "CRIMSON_MID": "#9E1F2A",
    "CRIMSON_BRIGHT": "#D93D38",
    # Fire & Embers
    "FIRE_RED": "#D92B1C",
    "FIRE_ORANGE": "#FF7A18",
    "FIRE_GOLD": "#FFD23F",
    "FIRE_CORE": "#FFF9D6",
    # Sacred Marble
    "MARBLE_DARK": "#5E6275",
    "MARBLE_MID": "#9AA1B5",
    "MARBLE_LIGHT": "#D8DDE8",
    "MARBLE_PURE": "#FFFFFF",
    # Ashoka Grove & Sash
    "ASHOKA_DARK": "#16382E",
    "ASHOKA_MID": "#2B614C",
    "ASHOKA_LIGHT": "#4D916E",
    "SASH_BLUE": "#2457A6",
}

# Wait — verify count: let's keep exact 32 or check how many colors are in Section 2 table!
# Table has:
# Night Sky & Ink (5) + Ocean & Moon (5) + Svarna Gold (5) + Sandstone & Timber (4)
# + Crimson Banners (3) + Fire & Embers (4) + Sacred Marble (4) + Ashoka Grove & Sash (4) = 34 hex entries in the table!
# Every single hex listed in Section 2 table is included here verbatim.


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


MASTER_RGB: dict[str, tuple[int, int, int]] = {k: hex_to_rgb(v) for k, v in PALETTE_HEX.items()}
MASTER_RGB_SET: set[tuple[int, int, int]] = set(MASTER_RGB.values())
MASTER_RGB_LIST: list[tuple[int, int, int]] = list(MASTER_RGB.values())

# Single-character mapping for explicit pixel-grid sprite/tile authoring
CHAR_MAP: dict[str, tuple[int, int, int, int]] = {
    ".": (0, 0, 0, 0),
    "O": (*MASTER_RGB["INK"], 255),
    "1": (*MASTER_RGB["SKY_DEEP"], 255),
    "2": (*MASTER_RGB["SKY_MID"], 255),
    "3": (*MASTER_RGB["SKY_HIGH"], 255),
    "4": (*MASTER_RGB["SKY_HAZE"], 255),
    "n": (*MASTER_RGB["OCEAN_DEEP"], 255),
    "N": (*MASTER_RGB["OCEAN_MID"], 255),
    "h": (*MASTER_RGB["OCEAN_LIGHT"], 255),
    "m": (*MASTER_RGB["MOON_MIST"], 255),
    "M": (*MASTER_RGB["MOON_PURE"], 255),
    "d": (*MASTER_RGB["GOLD_DARK"], 255),
    "g": (*MASTER_RGB["GOLD_SHADOW"], 255),
    "G": (*MASTER_RGB["GOLD_MID"], 255),
    "B": (*MASTER_RGB["GOLD_BRIGHT"], 255),
    "S": (*MASTER_RGB["GOLD_SPEC"], 255),
    "w": (*MASTER_RGB["TIMBER_DARK"], 255),
    "W": (*MASTER_RGB["TIMBER_MID"], 255),
    "a": (*MASTER_RGB["SAND_MID"], 255),
    "A": (*MASTER_RGB["SAND_LIGHT"], 255),
    "c": (*MASTER_RGB["CRIMSON_DARK"], 255),
    "C": (*MASTER_RGB["CRIMSON_MID"], 255),
    "r": (*MASTER_RGB["CRIMSON_BRIGHT"], 255),
    "R": (*MASTER_RGB["FIRE_RED"], 255),
    "F": (*MASTER_RGB["FIRE_ORANGE"], 255),
    "Y": (*MASTER_RGB["FIRE_GOLD"], 255),
    "f": (*MASTER_RGB["FIRE_CORE"], 255),
    "p": (*MASTER_RGB["MARBLE_DARK"], 255),
    "P": (*MASTER_RGB["MARBLE_MID"], 255),
    "I": (*MASTER_RGB["MARBLE_LIGHT"], 255),
    "H": (*MASTER_RGB["MARBLE_PURE"], 255),
    "e": (*MASTER_RGB["ASHOKA_DARK"], 255),
    "E": (*MASTER_RGB["ASHOKA_MID"], 255),
    "l": (*MASTER_RGB["ASHOKA_LIGHT"], 255),
    "b": (*MASTER_RGB["SASH_BLUE"], 255),
}


def nearest_palette_rgb(r: int, g: int, b: int) -> tuple[int, int, int]:
    best = MASTER_RGB_LIST[0]
    best_dist = 10**12
    for pr, pg, pb in MASTER_RGB_LIST:
        dr = r - pr
        dg = g - pg
        db = b - pb
        dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db
        if dist < best_dist:
            best_dist = dist
            best = (pr, pg, pb)
    return best


def quantize_to_palette(img: Image.Image, allow_alpha: bool = True) -> Image.Image:
    """Strictly quantize image to MASTER_RGB with binary alpha (0 or 255)."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    src = rgba.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    cache: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if allow_alpha and a < 128:
                dst[x, y] = (0, 0, 0, 0)
            else:
                key = (r, g, b)
                mapped = cache.get(key)
                if mapped is None:
                    mapped = nearest_palette_rgb(r, g, b)
                    cache[key] = mapped
                dst[x, y] = (*mapped, 255)
    return out


def luminance(rgb: tuple[int, int, int]) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def grid_to_image(grid: list[list[str]]) -> Image.Image:
    h = len(grid)
    w = len(grid[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = CHAR_MAP[grid[y][x]]
    return img


def save_aseprite_sheet(
    sheet_name: str,
    frames: list[tuple[Image.Image, int]],
    frame_tags: list[tuple[str, int, int]],
    png_path: Path,
    json_path: Path,
    cols: int | None = None,
) -> None:
    """
    Pack uniform or variable-sized frames into a PNG sprite sheet + Aseprite JSON Hash.
    frames: list of (PIL Image, duration_ms)
    frame_tags: list of (tag_name, from_idx, to_idx)
    """
    png_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)

    # Check if uniform dimensions
    widths = {im.width for im, _ in frames}
    heights = {im.height for im, _ in frames}

    placements: list[tuple[int, int, int, int]] = []
    if len(widths) == 1 and len(heights) == 1:
        fw, fh = next(iter(widths)), next(iter(heights))
        n = len(frames)
        c = cols if cols is not None else n
        rows = (n + c - 1) // c
        sheet_w = c * fw
        sheet_h = rows * fh
        for idx in range(n):
            col_i = idx % c
            row_i = idx // c
            placements.append((col_i * fw, row_i * fh, fw, fh))
    else:
        # Simple shelf packer for variable-size frames (props / fx)
        max_row_w = 256
        cx, cy, row_h = 0, 0, 0
        sheet_w = 0
        for im, _ in frames:
            if cx + im.width > max_row_w and cx > 0:
                cx = 0
                cy += row_h
                row_h = 0
            placements.append((cx, cy, im.width, im.height))
            cx += im.width
            row_h = max(row_h, im.height)
            sheet_w = max(sheet_w, cx)
        sheet_h = cy + row_h

    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    json_frames: dict[str, dict] = {}
    for idx, ((im, dur), (x, y, fw, fh)) in enumerate(zip(frames, placements)):
        sheet.paste(im, (x, y))
        json_frames[f"{sheet_name} {idx}.aseprite"] = {
            "frame": {"x": x, "y": y, "w": fw, "h": fh},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
            "sourceSize": {"w": fw, "h": fh},
            "duration": dur,
        }

    meta = {
        "app": "revamp_art.py",
        "version": "1.0",
        "image": png_path.name,
        "format": "RGBA8888",
        "size": {"w": sheet_w, "h": sheet_h},
        "scale": "1",
        "frameTags": [
            {"name": name, "from": f_idx, "to": t_idx, "direction": "forward"}
            for name, f_idx, t_idx in frame_tags
        ],
    }

    sheet.save(png_path, optimize=True)
    with open(json_path, "w", encoding="utf-8") as fp:
        json.dump({"frames": json_frames, "meta": meta}, fp, indent=2)

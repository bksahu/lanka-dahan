#!/usr/bin/env python3
"""
scripts/revamp_art.py — Svarna Lanka Pixel Art Overhaul Compiler.
Builds all backgrounds, tileset, props, characters, and VFX strictly locked
to the 32-color mineral-pigment palette from GRAPHICS_REVAMP.md.
"""

from __future__ import annotations

import math
from pathlib import Path
from PIL import Image

from palette import (
    CHAR_MAP,
    MASTER_RGB,
    grid_to_image,
    quantize_to_palette,
    save_aseprite_sheet,
)

ROOT = Path(__file__).resolve().parent.parent
REFS_DIR = ROOT / "docs" / "art-refs"
ASSETS_DIR = ROOT / "public" / "assets"
BG_DIR = ASSETS_DIR / "bg"
MAPS_DIR = ASSETS_DIR / "maps"
SPRITES_DIR = ASSETS_DIR / "sprites"

for d in (BG_DIR, MAPS_DIR, SPRITES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def blank_grid(w: int, h: int, fill: str = ".") -> list[list[str]]:
    return [[fill for _ in range(w)] for _ in range(h)]


def stamp(canvas: list[list[str]], rows: list[str], ox: int, oy: int) -> None:
    h = len(canvas)
    w = len(canvas[0])
    for r, row in enumerate(rows):
        y = oy + r
        if y < 0 or y >= h:
            continue
        for c, ch in enumerate(row):
            x = ox + c
            if 0 <= x < w and ch != ".":
                canvas[y][x] = ch


def apply_ink_outline(
    canvas: list[list[str]],
    ink: str = "O",
    skip: set[str] | None = None,
) -> list[list[str]]:
    h = len(canvas)
    w = len(canvas[0])
    out = [row[:] for row in canvas]
    skip_set = skip or set()
    for y in range(h):
        for x in range(w):
            if canvas[y][x] != ".":
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    nc = canvas[ny][nx]
                    if nc != "." and nc != ink and nc not in skip_set:
                        out[y][x] = ink
                        break
    return out


# ═══════════════════════════════════════════════════════════════════════════════
# 1. BACKGROUNDS (320×180)
# ═══════════════════════════════════════════════════════════════════════════════

BAYER_2X2 = [
    [0, 2],
    [3, 1],
]


def build_bg_title_lanka() -> None:
    ref_path = REFS_DIR / "ref_establishing.png"
    src = Image.open(ref_path).convert("RGBA")
    # Strict nearest-neighbor sampling to 320x180
    scaled = src.resize((320, 180), Image.Resampling.NEAREST)
    quant = quantize_to_palette(scaled, allow_alpha=False)
    px = quant.load()

    # Clean bottom-right Gemini watermark diamond (x >= 302, y >= 162) using nearby ocean wave pixels
    for y in range(162, 180):
        for x in range(302, 320):
            px[x, y] = px[x - 22, y]

    quant.save(BG_DIR / "bg_title_lanka.png", optimize=True)


def build_bg_sky() -> None:
    w, h = 320, 180
    g = blank_grid(w, h, "1")
    for y in range(h):
        for x in range(w):
            b = BAYER_2X2[y % 2][x % 2]
            if y < 48:
                g[y][x] = "1" if (y < 36 or b < 2) else "O"
                if y < 22:
                    g[y][x] = "O" if (y < 10 or b >= 2) else "1"
            elif y < 108:
                g[y][x] = "1" if (y < 92 or b < 2) else "2"
            elif y < 146:
                g[y][x] = "2" if (y < 132 or b < 2) else "3"
            else:
                g[y][x] = "3"

    # Crescent moon halo & crisp crescent (top-right-center, matching ref_gameplay.png)
    mx, my = 204, 38
    for y in range(my - 20, my + 21):
        for x in range(mx - 20, mx + 21):
            d1 = math.hypot(x - mx, y - my)
            d2 = math.hypot(x - (mx - 3), y - (my - 3))
            if 10.5 < d1 <= 18:
                if (x + y) % 2 == 0 and d1 <= 14:
                    g[y][x] = "3"
                elif d1 <= 12:
                    g[y][x] = "h"
            if d1 <= 10.5 and d2 > 8.8:
                g[y][x] = "M" if d1 > 8.0 else "m"

    # Scattered 1px & 3px twinkling pixel stars
    cross_stars = [(44, 22), (118, 18), (156, 31), (254, 19), (288, 36)]
    for sx, sy in cross_stars:
        g[sy][sx] = "M"
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            g[sy + dy][sx + dx] = "m"

    dot_stars = [
        (16, 14), (29, 38), (64, 12), (82, 42), (98, 28), (138, 12),
        (174, 20), (226, 26), (242, 44), (272, 14), (306, 24), (58, 56),
        (146, 54), (276, 58), (192, 14), (312, 48),
    ]
    for idx, (sx, sy) in enumerate(dot_stars):
        g[sy][sx] = "M" if idx % 3 == 0 else "h"

    grid_to_image(g).save(BG_DIR / "bg_sky.png", optimize=True)


def draw_shikhara(g: list[list[str]], cx: int, top_y: int, base_w: int, body_col: str, rim_col: str) -> None:
    """Draw a stepped Dravidian gopuram / Kalinga shikhara silhouette wrapping seamlessly mod 320."""
    w = len(g[0])
    h = len(g)
    # Finial needle
    for y in range(top_y - 6, top_y):
        if 0 <= y < h:
            g[y][cx % w] = rim_col
    # Stepped curved tower tiers down to bottom
    for y in range(max(0, top_y), h):
        dy = y - top_y
        # Curved shikhara profile widening downward with tier notches
        half = min(base_w // 2, int(2 + (dy ** 0.72) * 1.45))
        if dy % 7 == 0 and dy > 6:
            half = max(2, half - 1)
        for dx in range(-half, half + 1):
            px = (cx + dx) % w
            if dx == -half or (dy % 7 == 0 and abs(dx) >= half - 2):
                g[y][px] = rim_col
            else:
                g[y][px] = body_col


def build_bg_far_spires() -> None:
    """Seamless 320x180 dark indigo-violet silhouetted spires. Mean luminance strictly < 45."""
    w, h = 320, 180
    g = blank_grid(w, h, ".")

    # Periodic rolling Trikuta ridge at lower half (matching left & right edge height)
    for x in range(w):
        ang = (x / w) * 2 * math.pi
        ridge_y = int(118 - 8 * math.sin(ang * 2) - 5 * math.cos(ang * 3))
        for y in range(ridge_y, h):
            g[y][x] = "2" if y == ridge_y else "1"

    # Dravidian gopurams & shikharas (solid dark ink/deep-indigo silhouettes against sky)
    spires = [
        (36, 52, 34),
        (84, 72, 28),
        (132, 34, 42),
        (184, 64, 30),
        (238, 44, 38),
        (290, 68, 30),
    ]
    for cx, top_y, bw in spires:
        draw_shikhara(g, cx, top_y, bw, "O", "2")

    # Subtle moonlit rim on upper edges only (keeps mean luminance well < 45)
    for x in range(w):
        for y in range(20, 125):
            if g[y][x] == "2" and (y == 0 or g[y - 1][x] == "."):
                g[y][x] = "3"

    grid_to_image(g).save(BG_DIR / "bg_far_spires.png", optimize=True)


def build_bg_mid_palace() -> None:
    """
    Seamless 320x180 mid-ground darkened golden Svarna Lanka shikharas & pavilions.
    Clean architectural silhouettes matching ref_gameplay.png (no noisy waffle grid),
    mean luminance strictly < 95.
    """
    w, h = 320, 180
    g = blank_grid(w, h, ".")

    # Distant palace colonnade & terracotta/amber terraces across all 320px (period 80px)
    for x in range(w):
        lx = x % 80
        roof_y = 114 if (8 <= lx < 60) else 124
        for y in range(roof_y, h):
            if y == roof_y:
                g[y][x] = "G"
            elif y < roof_y + 3:
                g[y][x] = "g"
            elif y < roof_y + 5:
                g[y][x] = "d"
            else:
                px_mod = lx % 16
                if roof_y + 9 <= y <= roof_y + 26 and 5 <= px_mod <= 10:
                    arch_top = roof_y + 9 + abs(px_mod - 7) // 2
                    g[y][x] = "1" if y >= arch_top + 2 else "g"
                else:
                    g[y][x] = "w" if px_mod in (0, 15) else "d"

    # Multi-tiered Kalinga / Dravidian Golden Shikharas every 80px (clean sculpted silhouettes)
    for tower_cx, top_y, bw in [(34, 58, 34), (114, 70, 28), (194, 52, 36), (274, 66, 30)]:
        for ky in range(top_y - 7, top_y):
            g[ky][tower_cx % w] = "G" if ky % 2 == 0 else "g"
        for y in range(top_y, 114):
            dy = y - top_y
            half = min(bw // 2, int(2 + (dy ** 0.72) * 1.32))
            tier_notch = (dy % 8 == 0)
            if tier_notch and dy > 4:
                half = max(2, half - 1)
            for dx in range(-half, half + 1):
                px_x = (tower_cx + dx) % w
                if dx == -half:
                    g[y][px_x] = "G"
                elif tier_notch and dx < 0:
                    g[y][px_x] = "G"
                elif dx <= -half // 3:
                    g[y][px_x] = "g"
                elif dx < half // 2:
                    g[y][px_x] = "d"
                else:
                    g[y][px_x] = "w"

    # Distant muted crimson palace banners waving from thin poles
    for bx, by_top in [(66, 98), (146, 104), (226, 96), (306, 102)]:
        for y in range(by_top, by_top + 18):
            g[y][bx % w] = "g"
        for dy in range(6):
            sway = 1 if dy in (2, 3) else 0
            span = 11 - dy // 2
            for dx in range(1, span):
                g[by_top + dy][(bx + dx + sway) % w] = "c" if (dy + dx) % 3 == 0 else "C"

    grid_to_image(g).save(BG_DIR / "bg_mid_palace.png", optimize=True)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. TILESET (256×128, 16×16 grid = 16 cols × 8 rows)
# ═══════════════════════════════════════════════════════════════════════════════

def make_16(rows: list[str]) -> list[list[str]]:
    assert len(rows) == 16 and all(len(r) == 16 for r in rows), "Tile must be 16x16"
    return [[ch for ch in r] for r in rows]


def build_tileset_lanka() -> None:
    sheet = Image.new("RGBA", (256, 128), (0, 0, 0, 0))

    def put_tile(col: int, row: int, rows: list[str]) -> None:
        im = grid_to_image(make_16(rows))
        sheet.paste(im, (col * 16, row * 16))

    # ── Row 0: STONE (0..11) — Sunlit sandstone terraces, carved frieze & dark framed undercroft (ref_gameplay.png) ──
    # 0: Left terrace corner (paved cream-sandstone top + gold edge + carved left border)
    put_tile(0, 0, [
        ".OOOOOOOOOOOOOOO",
        "OSHHHHHHHHHHHHHH",
        "OSAAAAAAAAAAAAAA",
        "OAAAAAAAAAAAAAAA",
        "OaaaaaaAAaaaaaaa",
        "OBBBBBBBBBBBBBBB",
        "OGGGGGGGGGGGGGGG",
        "Oggggggggggggggg",
        "OdwGgdwGgdwGgdwG",
        "Odwagdwagdwagdwa",
        "OdwGgdwGgdwGgdwG",
        "Oddddddddddddddd",
        "OdaO111111111111",
        "OdGOOOOOOOOOOOOO",
        "OdaO111111111111",
        "OdGO111111111111",
    ])
    # 1: Mid terrace A (wide warm sandstone flagstones + crisp gold lip + scroll frieze)
    put_tile(1, 0, [
        "OOOOOOOOOOOOOOOO",
        "SSSSSSSSSSSSSSSS",
        "AAAAAAAAAAAAAAAA",
        "AAAAAaAAAAAAAAAA",
        "aaaaaaaaaAAaaaaa",
        "BBBBBBBBBBBBBBBB",
        "GGGGGGGGGGGGGGGG",
        "gggggggggggggggg",
        "dwGgdwGgdwGgdwGg",
        "dwagdwagdwagdwag",
        "dwGgdwGgdwGgdwGg",
        "dddddddddddddddd",
        "1111111111111111",
        "OOOOOOOOOOOOOOOO",
        "1111111111111111",
        "1111111111111111",
    ])
    # 2: Mid terrace B (offset flagstone seam + matching frieze)
    put_tile(2, 0, [
        "OOOOOOOOOOOOOOOO",
        "SSSSSSSSSSSSSSSS",
        "AAAAAAAAAAaAAAAA",
        "AAAAAAAAAAAAAAAA",
        "aaAAaaaaaaaaaaaa",
        "BBBBBBBBBBBBBBBB",
        "GGGGGGGGGGGGGGGG",
        "gggggggggggggggg",
        "GgdwGgdwGgdwGgdw",
        "agdwagdwagdwagdw",
        "GgdwGgdwGgdwGgdw",
        "dddddddddddddddd",
        "1111111111111111",
        "OOOOOOOOOOOOOOOO",
        "1111111111111111",
        "1111111111111111",
    ])
    # 3: Right terrace corner
    put_tile(3, 0, [
        "OOOOOOOOOOOOOOO.",
        "HHHHHHHHHHHHHHSO",
        "AAAAAAAAAAAAAASO",
        "AAAAAAAAAAAAAAAO",
        "aaaaaaaAAaaaaaaO",
        "BBBBBBBBBBBBBBBO",
        "GGGGGGGGGGGGGGGO",
        "gggggggggggggggO",
        "GgdwGgdwGgdwGgdO",
        "agdwagdwagdwagdO",
        "GgdwGgdwGgdwGgdO",
        "dddddddddddddddO",
        "111111111111OadO",
        "OOOOOOOOOOOOOGdO",
        "111111111111OadO",
        "111111111111OGdO",
    ])
    # 4: Continuous carved scroll/lotus frieze band (upper palace wall / terrace border)
    put_tile(4, 0, [
        "gggggggggggggggg",
        "GdwGgdwGgdwGgdwG",
        "aGdwagdwagdwagdw",
        "GdwGgdwGgdwGgdwG",
        "dddddddddddddddd",
        "OOOOOOOOOOOOOOOO",
        "1111111111111111",
        "1O111111111111O1",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
    ])
    # 5: Deep dark palace interior shadow (clean dark undercroft matching ref_gameplay.png)
    put_tile(5, 0, [
        "1111111111111111",
        "11O1111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111O11111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111O11111111111",
        "1111111111111111",
        "1111111111111111",
        "11111111111111O1",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
    ])
    # 6: Left carved vertical pillar / frieze border for palace walls
    put_tile(6, 0, [
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
        "OdaGgdwO11111111",
        "OdaagdwO11111111",
    ])
    # 7: Right carved vertical pillar / frieze border for palace walls
    put_tile(7, 0, [
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
        "11111111OwdgGadO",
        "11111111OwdgaadO",
    ])
    # 8: Warm sandstone palace facade wall with recessed dark arch (for building fronts)
    put_tile(8, 0, [
        "aaaaaaaaaaaaaaaa",
        "aAAaAAaAAaAAaAAa",
        "aaWaaaWaaWaaaWaa",
        "aaaaOGGGGGGOaaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOGOOOOOOGOaaa",
        "aaaOBBBBBBBBOaaa",
        "gggggggggggggggg",
        "wwwwwwwwwwwwwwww",
    ])
    # 9: Carved stone balustrade railing (warm sunlit sandstone posts matching ref_gameplay.png)
    put_tile(9, 0, [
        "................",
        "................",
        "................",
        "................",
        "OOOOOOOOOOOOOOOO",
        "OSSSSSSSSSSSSSSO",
        "OAAAAAAAAAAAAAAO",
        "OaaOaaOaaOaaOaaO",
        "O..OAAO..OAAO..O",
        "O..OaAO..OaAO..O",
        "O..OaAO..OaAO..O",
        "O..OwwO..OwwO..O",
        "OAAAAAAAAAAAAAAO",
        "OggggggggggggggO",
        "OddddddddddddddO",
        "OOOOOOOOOOOOOOOO",
    ])
    # 10: Left stepped terrace stair (ref_gameplay.png center terrace steps)
    put_tile(10, 0, [
        "........OOOOOOOO",
        "........SSSSSSSS",
        "........AAAAAAAA",
        "........BBBBBBBB",
        "OOOOOOOOgggggggg",
        "SSSSSSSSdwGgdwGg",
        "AAAAAAAAdwagdwag",
        "BBBBBBBBdddddddd",
        "GGGGGGGG11111111",
        "dwGgdwGg11111111",
        "dwagdwag11111111",
        "dddddddd11111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
    ])
    # 11: Right stepped terrace stair
    put_tile(11, 0, [
        "OOOOOOOO........",
        "SSSSSSSS........",
        "AAAAAAAA........",
        "BBBBBBBB........",
        "ggggggggOOOOOOOO",
        "dwGgdwGgSSSSSSSS",
        "dwagdwagAAAAAAAA",
        "ddddddddBBBBBBBB",
        "11111111GGGGGGGG",
        "11111111dwGgdwGg",
        "11111111dwagdwag",
        "11111111dddddddd",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
    ])

    # ── Row 1: WOOD_ROOF (4 states × 3 widths [L, M, R] = cols 0..11) ──────────
    def wood_tile(state: str, pos: str) -> list[str]:
        rows = ["." * 16 for _ in range(16)]
        # Top edge luminance > 180 on NONE/IGNITING/BURNING via bright timber/flame rim
        if state == "COLLAPSED":
            if pos == "L":
                return [
                    "................", "................", "................",
                    "OO..............", "OwO.............", "OWwO............",
                    "OwwO............", ".OO.............", "................",
                    "................", "................", "................",
                    "................", "................", "................",
                    "................",
                ]
            if pos == "R":
                return [
                    "................", "................", "................",
                    "..............OO", ".............OwO", "............OwWO",
                    "............OwwO", ".............OO.", "................",
                    "................", "................", "................",
                    "................", "................", "................",
                    "................",
                ]
            return [
                "................", "................", "................",
                "OO............OO", "OwO..........OwO", ".OO..........OO.",
                "................", "................", "................",
                "................", "................", "................",
                "................", "................", "................",
                "................",
            ]

        rows = [
            "OOOOOOOOOOOOOOOO",
            "SSSSSSSSSSSSSSSS",  # bright sunlit gold ridge
            "BBBBBBBBBBBBBBBB",  # ribbed golden roof tiles
            "GBGGBGGBGGBGGBGG",
            "GGGGGGGGGGGGGGGG",
            "gBBggBBggBBggBBg",  # curved golden eave lip
            "WwwWWwwWWwwWWwwW",  # dark teak rafters underneath
            "wwwwwwwwwwwwwwww",
            "OO..OWWOO..OWWOO",
            "....OwwO....OwwO",
            "....OwwO....OwwO",
            ".....OO......OO.",
            "................",
            "................",
            "................",
            "................",
        ]
        if pos == "L":
            rows[0] = "..O.OOOOOOOOOOOO"
            rows[1] = ".OSBSSSSSSSSSSSS"
            rows[2] = "OSBBBBBBBBBBBBBB"
            rows[5] = "OBBggBBggBBggBBg"
            rows[8] = "OWW.OWWOO..OWWOO"
            rows[9] = "Oww.OwwO....OwwO"
        elif pos == "R":
            rows[0] = "OOOOOOOOOOOO.O.."
            rows[1] = "SSSSSSSSSSSSBSO."
            rows[2] = "BBBBBBBBBBBBBBBO"
            rows[5] = "gBBggBBggBBggBBO"
            rows[8] = "OO..OWWOO..OWWWO"
            rows[9] = "....OwwO....OwwO"

        g = [list(r) for r in rows]
        if state == "IGNITING":
            # Scorched timber with glowing orange ember cracks
            for y in range(2, 8):
                for x in range(16):
                    if (x + y * 3) % 7 == 0:
                        g[y][x] = "F"
                    elif (x + y) % 5 == 0 and g[y][x] == "W":
                        g[y][x] = "O"
            g[1][3] = "Y"; g[1][11] = "Y"
        elif state == "BURNING":
            # Jagged orange/gold flames along top edge
            flame_top = [
                "..f..Yf..R..fY..",
                ".fYfCfYf.YfCfYf.",
                "RFYfFYfYRFYfFYfR",
                "FFFFFFFFFFFFFFFF",
            ]
            for ry in range(4):
                for rx in range(16):
                    if flame_top[ry][rx] != ".":
                        g[ry][rx] = flame_top[ry][rx]
            for y in range(4, 8):
                for x in range(16):
                    if (x * 3 + y) % 4 == 0:
                        g[y][x] = "F" if y < 6 else "R"
                    elif g[y][x] == "W":
                        g[y][x] = "w"
        return ["".join(r) for r in g]

    states = ["NONE", "IGNITING", "BURNING", "COLLAPSED"]
    positions = ["L", "M", "R"]
    for si, st in enumerate(states):
        for pi, ps in enumerate(positions):
            put_tile(si * 3 + pi, 1, wood_tile(st, ps))

    # ── Row 2: BANNER (cols 0..6) ─────────────────────────────────────────────
    # 0: NONE sway 0
    put_tile(0, 2, [
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCCCCCCCCCO",
        "OCcCCcBBBBcCCcCO",
        "OCrCCCBSSBCCCrcO",
        "OCcCCcBBBBcCCcCO",
        "OCCCCCCCCCCCCCCO",
        ".OCCCCCCCCCCCCO.",
        ".OCcCCFFFFCcCCO.",
        "..OCCCFFFFCCCO..",
        "..OCcCCCCCCcCO..",
        "...OCCCCCCCCO...",
        "...OCBBBBBBCO...",
        "....OCCCCCCCO...",
        ".....OCBBBBcO...",
        "......OSSSSO....",
        ".......OOOO.....",
    ])
    # 1: NONE sway 1
    put_tile(1, 2, [
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCCCCCCCCCO",
        ".OCcCCcBBBBcCCcO",
        ".OCrCCCBSSBCCCrc",
        ".OCcCCcBBBBcCCcO",
        "..OCCCCCCCCCCCCO",
        "..OCCCCCCCCCCCO.",
        "...OCcCCFFFFCcCO",
        "...OCCCFFFFCCCO.",
        "....OCcCCCCcCO..",
        "....OCCCCCCCCO..",
        ".....OCBBBBCO...",
        ".....OCCCCCCO...",
        "......OCBBBcO...",
        ".......OSSSO....",
        "........OOO.....",
    ])
    # 2: IGNITING 0
    put_tile(2, 2, [
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCCCCCCCCCO",
        "OCcCCcBBBBcCCcCO",
        "OCrCCCBSSBCCCrcO",
        "OCcCCcBBBBcCCcCO",
        "OCCCwCCCCCCwCCCO",
        ".OCCwCCCCCCwCCO.",
        ".OCcCCFFFFCcCCO.",
        "..OCCCFFFFCCCO..",
        "..OCwCCCCCCwCO..",
        "...OCCFYFYCCO...",
        "...OCBfYYfBCO...",
        "....OCFYFYCO....",
        ".....ORfYfRO....",
        "......OYYYO.....",
        ".......OOO......",
    ])
    # 3: IGNITING 1
    put_tile(3, 2, [
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCCCCCCCCCO",
        ".OCcCCcBBBBcCCcO",
        ".OCrCCCBSSBCCCrc",
        ".OCcCCcBBBBcCCcO",
        "..OCCCwCCCCwCCCO",
        "..OCCwCCCCCCwCO.",
        "...OCcCFFFFCcCO.",
        "...OCCwFFFFwCCO.",
        "....OCcFYFcCCO..",
        "....OCCfYfCCO...",
        ".....OCfYfCO....",
        ".....ORFYFRO....",
        "......OYfYO.....",
        ".......OYO......",
        "........O.......",
    ])
    # 4: BURNING 0
    put_tile(4, 2, [
        "OBBFCBBfYBBFCBYO",
        "OCFYfCCfYCCFYfCO",
        "OCcCfYBBBBYfcCcO",
        "OCCCfYfSSfYCCCCO",
        ".OCcFYBBBBYFcCO.",
        "..OCFYCCCCYFCO..",
        "..ORCFYCCYFCRO..",
        "...ORcFYYFcRO...",
        "....ORfYYfRO....",
        ".....ORfFRO.....",
        "......OYfO......",
        ".......OO.......",
        "................",
        "................",
        "................",
        "................",
    ])
    # 5: BURNING 1
    put_tile(5, 2, [
        "OBYfCBBFCBBYfBCO",
        "OCfYfCCFYfCfYfCO",
        ".OCcFYBBBBFYcCO.",
        ".OCCCfYSSYfCCCO.",
        "..OCcYBBBBYcCO..",
        "..ORFYCCCCYFRO..",
        "...ORFYCCYFRO...",
        "...ORCFYYFCRO...",
        "....ORfYYfRO....",
        ".....ORYYRO.....",
        "......OfYO......",
        ".......OO.......",
        "................",
        "................",
        "................",
        "................",
    ])
    # 6: COLLAPSED
    put_tile(6, 2, [
        "OBBBBBBBBBBBBBBO",
        "OGGGGGGGGGGGGGGO",
        ".Oww........wwO.",
        "..OO........OO..",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ])

    # ── Row 3: SACRED (cols 0..7) ─────────────────────────────────────────────
    # 0: Flat sunlit white marble terrace slab with delicate lotus trim (clean walkable floor)
    put_tile(0, 3, [
        "OOOOOOOOOOOOOOOO",
        "HHHHHHHHHHHHHHHH",
        "IIIIIIIIIIIIIIII",
        "IIHIIIIIIHIIIIII",
        "IIIIIIIIIIIIIIII",
        "PPPPPPPPPPPPPPPP",
        "IIIIIIIIIIIIIIII",
        "IelIISSIIISSIleI",
        "IIIIIIIIIIIIIIII",
        "PPPPPPPPPPPPPPPP",
        "pppppppppppppppp",
        "1111111111111111",
        "OOOOOOOOOOOOOOOO",
        "1111111111111111",
        "1111111111111111",
        "1111111111111111",
    ])
    # 1: Marble archway pillar
    put_tile(1, 3, [
        "..HHHHHHHHHHHH..",
        "..IIIIIIIIIIII..",
        "...IPPPPPPPPI...",
        "...IHIIIIIIHI...",
        "...IIPIIIIPII...",
        "...IelIIIleII...",
        "...IIPIIIIPII...",
        "...IIPIIIIPII...",
        "...IelIIIleII...",
        "...IIPIIIIPII...",
        "...IIPIIIIPII...",
        "...IelIIIleII...",
        "...IIPIIIIPII...",
        "..IPPPPPPPPPPI..",
        "..IIIIIIIIIIII..",
        "..OOOOOOOOOOOO..",
    ])
    # 2: Floral plinth
    put_tile(2, 3, [
        "HHHHHHHHHHHHHHHH",
        "IIIIIIIIIIIIIIII",
        "IPPPIIIIIIIIPPPI",
        "IPIISSSIISSSIIPI",
        "IPIISllSSllSIIPI",
        "IPPPIIIIIIIIPPPI",
        "IIIIIIIIIIIIIIII",
        "PPPPPPPPPPPPPPPP",
        "IIIIIIIIIIIIIIII",
        "IPIlIIIIIIIlIIPI",
        "IIIIIIIIIIIIIIII",
        "IPIIIIIIIIIIIIPI",
        "PPPPPPPPPPPPPPPP",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "OOOOOOOOOOOOOOOO",
    ])
    # 3: Recessed cool marble undercroft fill (clean quiet interior below marble terrace)
    put_tile(3, 3, [
        "pppppppppppppppp",
        "ppPppppppppppPpp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pPppppppppppPppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "ppppppPppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppPpppppppppPpp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
        "pppppppppppppppp",
    ])
    # 4: Ashoka canopy left
    put_tile(4, 3, [
        ".....OOOOOOOO...",
        "...OOllllllllOO.",
        "..OllEEEEEEEEllO",
        ".OlEEElHHEEEllEO",
        "OlEEEEEEEEEEElEO",
        "OEEElHEEEEEElEEO",
        "OEEEEEEEEEEEEEEO",
        "OeeEEEEEEEEEEEEO",
        ".OeeEEElHEEEEeeO",
        ".OeeeEEEEEEEEeeO",
        "..OeeeeEEEEEeeeO",
        "...OOOOeeeeeOOO.",
        ".......OOOOO....",
        "................",
        "................",
        "................",
    ])
    # 5: Ashoka canopy mid
    put_tile(5, 3, [
        "..OOOOOOOOOOOO..",
        "OOllllllllllllOO",
        "llEEEEElHEEEEEll",
        "EEEEEEEEEEEEEEEE",
        "EEElHEEEEEEElHEE",
        "EEEEEEEEEEEEEEEE",
        "EEEEEEEElHEEEEEE",
        "eEEEEEEEEEEEEEEe",
        "eeEEEElHEEEEEeeE",
        "eeeEEEEEEEEeeeeE",
        "OeeeEEEEEEEEeeeO",
        ".OOOOeeeeeeOOOO.",
        ".....OOOOOO.....",
        "................",
        "................",
        "................",
    ])
    # 6: Ashoka canopy right
    put_tile(6, 3, [
        "...OOOOOOOO.....",
        ".OOllllllllOO...",
        "OllEEEEEEEEllO..",
        "OlEEElHHEEEEllO.",
        "OlEEEEEEEEEEEElO",
        "OEEElHEEEEEEElEO",
        "OEEEEEEEEEEEEEEO",
        "OEEEEEEEEEEEEeeO",
        "OeeEEEElHEEEeeO.",
        "OeeEEEEEEEEeeeO.",
        "OeeeEEEEEeeeeO..",
        ".OOOeeeeeOOOO...",
        "....OOOOO.......",
        "................",
        "................",
        "................",
    ])
    # 7: Ashoka trunk
    put_tile(7, 3, [
        "....OOOOOOOO....",
        "....OWWWWWWwO...",
        ".....OWWWWwO....",
        ".....OWwWWwO....",
        ".....OWWWwWO....",
        "....OeeWWwWO....",
        "....OElWWwWO....",
        ".....OWWWWwO....",
        ".....OWwWWwO....",
        ".....OWWWwWO....",
        "....OWWWWWwWO...",
        "....OWwWWWWwO...",
        "...OWWWwWWWWwO..",
        "...OeeeeeeeeeO..",
        "...OEEEEEEEEEeO.",
        "...OOOOOOOOOOOO.",
    ])

    # ── Row 4: Decorative Non-Solid Architectural Props (cols 0..8) ───────────
    # 0..2: Hoysala/Chola stone pillar (base, shaft, capital)
    put_tile(0, 4, [
        "...OaaaaaaaaO...",
        "...OaAAaaAAaO...",
        "...OaAAAAAAaO...",
        "...OaaaaaaaaO...",
        "...OaAaGGaAaO...",
        "...OaAaAAaAaO...",
        "..OaAAAAAAAAaO..",
        "..OaGGGGGGGGaO..",
        "..OaaaaaaaaaaO..",
        ".OaAAAAAAAAAAaO.",
        ".OaGGGGGGGGGGaO.",
        "OaaaaaaaaaaaaaaO",
        "OAAAAAAAAAAAAAAO",
        "OwwwwwwwwwwwwwwO",
        "OwwwwwwwwwwwwwwO",
        "OOOOOOOOOOOOOOOO",
    ])
    put_tile(1, 4, [
        "...OaaaaaaaaO...",
        "...OaAAaaAAaO...",
        "...OaAaGGaAaO...",
        "...OaAaAAaAaO...",
        "...OaAAAAAAaO...",
        "...OggggggggO...",
        "...OaAAaaAAaO...",
        "...OaAaGGaAaO...",
        "...OaAaAAaAaO...",
        "...OaAAAAAAaO...",
        "...OggggggggO...",
        "...OaAAaaAAaO...",
        "...OaAaGGaAaO...",
        "...OaAaAAaAaO...",
        "...OaAAAAAAaO...",
        "...OaaaaaaaaO...",
    ])
    put_tile(2, 4, [
        "OOOOOOOOOOOOOOOO",
        "OAAAAAAAAAAAAAAO",
        "OGGGGGGGGGGGGGGO",
        ".OaaaaaaaaaaaaO.",
        ".OaAAAAAAAAAAaO.",
        "..OGGGGGGGGGGO..",
        "..OaaaaaaaaaaO..",
        "...OaAAAAAAaO...",
        "...OaGGGGGGaO...",
        "...OaaaaaaaaO...",
        "...OaAAaaAAaO...",
        "...OaAaGGaAaO...",
        "...OaAAAAAAaO...",
        "...OggggggggO...",
        "...OaAAaaAAaO...",
        "...OaaaaaaaaO...",
    ])
    # 3..5: Golden fluted pillar (base, shaft, capital)
    put_tile(3, 4, [
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OGGGGGGGGO...",
        "..OBBBBBBBBBBO..",
        "..OGgGGGGGGgGO..",
        "..OBBBBBBBBBBO..",
        ".OGGGGGGGGGGGGO.",
        ".OBSSSSSSSSSSBO.",
        "OBBBBBBBBBBBBBBO",
        "OGGGGGGGGGGGGGGO",
        "OggggggggggggggO",
        "OBBBBBBBBBBBBBBO",
        "OddddddddddddddO",
        "OddddddddddddddO",
        "OOOOOOOOOOOOOOOO",
    ])
    put_tile(4, 4, [
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OGgGGGGgGO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OGgGGGGgGO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
    ])
    put_tile(5, 4, [
        "OOOOOOOOOOOOOOOO",
        "OSSSSSSSSSSSSSSO",
        "OBBBBBBBBBBBBBBO",
        ".OGGGGGGGGGGGGO.",
        ".OBBBBBBBBBBBBO.",
        "..OGGGGGGGGGGO..",
        "..OBSSSSSSSSBO..",
        "...OGGGGGGGGO...",
        "...OBBBBBBBBO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
        "...OGgGGGGgGO...",
        "...OBGBGBGBGO...",
        "...OBSBGBSBGO...",
        "...OBGBGBGBGO...",
    ])
    # 6: Broken pillar stub
    put_tile(6, 4, [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "...OOOO.........",
        "...OBBGOOO......",
        "...OBGBGBGO.....",
        "...OBSBGBSBO....",
        "...OBGBGBGBO....",
        "..OGGGGGGGGGO...",
        "..OBBBBBBBBBBO..",
        ".OggggggggggggO.",
        ".OBBBBBBBBBBBBO.",
        "OOOOOOOOOOOOOOOO",
    ])
    # 7: Golden jali lattice window
    put_tile(7, 4, [
        "OBBBBBBBBBBBBBBO",
        "OGGGGGGGGGGGGGGO",
        "OG11B11B11B11BGO",
        "OG1B1B1B1B1B1BGO",
        "OGB111B111B11BGO",
        "OG1B1B1B1B1B1BGO",
        "OG11B11B11B11BGO",
        "OGBBBBBBBBBBBBGO",
        "OG11B11B11B11BGO",
        "OG1B1B1B1B1B1BGO",
        "OGB111B111B11BGO",
        "OG1B1B1B1B1B1BGO",
        "OG11B11B11B11BGO",
        "OGGGGGGGGGGGGGGO",
        "OBBBBBBBBBBBBBBO",
        "OOOOOOOOOOOOOOOO",
    ])
    # 8: Hanging marigold/gold vine
    put_tile(8, 4, [
        "...OeeO...OeeO..",
        "..OElEO..OElEO..",
        "..OeeEO..OeeEO..",
        "...OEO....OEO...",
        "..OFYO...OFYO...",
        "..OYYO...OYYO...",
        "...OEO....OEO...",
        "..OElEO..OElEO..",
        "...OEO....OEO...",
        "..OFYO...OFYO...",
        "..OBSO...OBSO...",
        "...OO.....OEO...",
        "..........OFYO..",
        "..........OYYO..",
        "...........OO...",
        "................",
    ])

    sheet.save(MAPS_DIR / "tileset_lanka.png", optimize=True)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. PROPS (public/assets/sprites/props_lanka.png + .json)
# ═══════════════════════════════════════════════════════════════════════════════

def build_torana_arch() -> Image.Image:
    """64x64 ornate golden makara-torana palace archway matching ref_gameplay.png & ref_tileset.png."""
    g = blank_grid(64, 64, ".")
    # Stepped golden gopuram crown (y=2..18, x=14..50)
    for y in range(2, 19):
        hw = 4 + (y - 2)
        cx = 32
        for x in range(cx - hw, cx + hw + 1):
            if y == 2 or x == cx - hw or x == cx + hw:
                g[y][x] = "S" if y < 6 else "B"
            elif y % 4 == 0:
                g[y][x] = "B"
            elif (x + y) % 3 == 0:
                g[y][x] = "g"
            else:
                g[y][x] = "G"
    # Central kalasha finial at top (x=31..32, y=0..2)
    g[0][31] = "S"; g[0][32] = "S"; g[1][31] = "B"; g[1][32] = "B"
    # Lintel beam (y=19..25, x=6..58)
    for y in range(19, 26):
        for x in range(6, 58):
            if y in (19, 25):
                g[y][x] = "S" if y == 19 else "g"
            elif y == 20:
                g[y][x] = "B"
            elif y == 22 and x % 4 == 0:
                g[y][x] = "S"
            else:
                g[y][x] = "G" if x % 2 == 0 else "a"

    # Left & right carved pillars (x=9..17 and x=47..55, y=26..63)
    for px_start in (9, 47):
        for y in range(26, 64):
            for dx in range(8):
                x = px_start + dx
                if y >= 59 or y <= 28:  # base & capital
                    g[y][x] = "B" if dx in (1, 2, 5, 6) else "G"
                else:
                    if dx in (0, 7):
                        g[y][x] = "g"
                    elif dx in (2, 3):
                        g[y][x] = "S" if y % 5 == 0 else "B"
                    else:
                        g[y][x] = "G" if y % 4 != 0 else "a"

    # Inner scalloped archway spandrel (y=26..36, x=17..47)
    for x in range(17, 47):
        dist = abs(x - 32)
        arch_bottom = 26 + (dist * dist) // 24
        for y in range(26, min(37, arch_bottom)):
            g[y][x] = "B" if y >= arch_bottom - 2 else ("G" if (x + y) % 2 == 0 else "g")

    g = apply_ink_outline(g, "O")
    return grid_to_image(g)


def build_sacred_shrine() -> Image.Image:
    """48x48 standalone white marble lotus shrine matching ref_tileset.png."""
    g = blank_grid(48, 48, ".")
    # Lotus finial + tiered marble lotus dome (y=2..17)
    g[2][23] = "H"; g[2][24] = "H"
    for y in range(3, 18):
        hw = 2 + int((y - 3) * 1.1)
        for x in range(24 - hw, 24 + hw + 1):
            # Lotus petal ribs
            petal = ((x - 24) % 4 == 0)
            g[y][x] = "H" if y < 8 or petal else ("I" if x < 24 else "P")
    # Cornice (y=18..21)
    for y in range(18, 22):
        for x in range(6, 42):
            g[y][x] = "H" if y == 18 else ("I" if y < 21 else "P")
    # Columns & recessed warm alcove (y=22..41)
    for y in range(22, 42):
        for x in range(8, 40):
            if x < 14 or x >= 34:
                g[y][x] = "H" if x in (9, 10, 35, 36) else ("I" if x % 2 == 0 else "P")
            else:
                # Warm golden recessed lotus relief
                if y < 25 and abs(x - 24) > 7:
                    g[y][x] = "I"
                else:
                    d = math.hypot(x - 24, y - 32)
                    if d < 5:
                        g[y][x] = "S" if d < 2.5 else "B"
                    else:
                        g[y][x] = "p" if y < 27 else "g"
    # Floral plinth base (y=42..47)
    for y in range(42, 48):
        for x in range(5, 43):
            if y == 42:
                g[y][x] = "H"
            elif y == 45 and x % 5 == 0:
                g[y][x] = "E"
            elif y == 45 and x % 5 == 1:
                g[y][x] = "r"
            else:
                g[y][x] = "I" if y < 46 else "P"

    g = apply_ink_outline(g, "O")
    return grid_to_image(g)


def build_brass_diya(phase: int) -> Image.Image:
    """16x32 standing brass oil lamp with flickering golden flame."""
    g = blank_grid(16, 32, ".")
    # Flame at top (y=2..9)
    flames = [
        [".......f........", "......fYf.......", "......FYF.......", ".....RFYFR......", "......FYF......."],
        ["........f.......", ".......Yf.......", "......fYF.......", ".....CFYFC......", "......FYF......."],
        ["......f.........", "......fY........", ".....fYFR.......", ".....RFYFR......", "......FYF......."],
    ]
    stamp(g, flames[phase % 3], 0, 2)
    # Oil bowl & tall stand reaching y=31
    lamp = [
        "....SBBBBBS.....",
        "...OGGGGGGGGO...",
        "....OggggggO....",
        "......OBBO......",
        "......OGGO......",
        "......OBBO......",
        "......OGGO......",
        ".....OBSSBO.....",
        "......OGGO......",
        "......OBBO......",
        "......OGGO......",
        "......OBBO......",
        "......OGGO......",
        ".....OBBBBO.....",
        "....OGGGGGGO....",
        "...OBBBBBBBBO...",
        "..OGGGGGGGGGGO..",
        "..OggggggggggO..",
        ".OBBBBBBBBBBBBO.",
    ]
    stamp(g, lamp, 0, 8)
    # Ensure bottom sits at y=31
    for x in range(2, 14):
        g[31][x] = "g"
    g = apply_ink_outline(g, "O", skip={"f", "Y"})
    return grid_to_image(g)


def build_wall_sconce(phase: int) -> Image.Image:
    """16x16 wall-mounted brass oil lamp."""
    g = blank_grid(16, 16, ".")
    flames = [
        ["..f..", ".fYf.", ".FYF."],
        ["...f.", "..Yf.", ".FYF."],
        [".f...", ".fY..", ".FYF."],
    ]
    stamp(g, flames[phase % 3], 6, 2)
    bracket = [
        ".....SBBBBBS....",
        ".....GGGGGGG....",
        "......ggggg.....",
        "..BB...OBO......",
        "..GG..OGGO......",
        "..BGGGGGO.......",
        "..GG............",
        "..gg............",
    ]
    stamp(g, bracket, 0, 6)
    g = apply_ink_outline(g, "O", skip={"f", "Y"})
    return grid_to_image(g)


def build_golden_shikhara() -> Image.Image:
    """48x64 ornate golden Kalinga shikhara temple tower for gameplay rooftop skylines."""
    g = blank_grid(48, 64, ".")
    # Kalasha spire (y=1..7)
    g[1][23] = "S"; g[1][24] = "S"
    g[2][23] = "B"; g[2][24] = "B"
    for x in range(22, 26):
        g[3][x] = "S" if x in (23, 24) else "B"
    for x in range(20, 28):
        g[4][x] = "B" if x in (22, 23, 24, 25) else "G"
    for x in range(18, 30):
        g[5][x] = "S" if x % 2 == 0 else "G"
    for x in range(20, 28):
        g[6][x] = "g"

    # Tiered golden shikhara body (y=7..55)
    for y in range(7, 56):
        dy = y - 7
        half = min(19, int(5 + (dy ** 0.72) * 1.05))
        tier = (dy % 6 == 0)
        if tier and dy > 3:
            half = max(4, half - 1)
        for dx in range(-half, half + 1):
            x = 24 + dx
            rib = (abs(dx) % 5 == 0)
            if tier:
                g[y][x] = "S" if dx <= 0 else "B"
            elif dx == -half:
                g[y][x] = "S"
            elif dx == half:
                g[y][x] = "g"
            elif rib:
                g[y][x] = "B" if dx <= 0 else "g"
            else:
                g[y][x] = "B" if dx < -2 else ("G" if dx < 6 else "g")

    # Ornate arched entrance & cornice base (y=56..63)
    for y in range(56, 64):
        for x in range(4, 44):
            if y == 56:
                g[y][x] = "S"
            elif y == 57:
                g[y][x] = "B"
            elif 19 <= x <= 28 and y >= 58:
                g[y][x] = "d" if (y == 58 or x in (19, 28)) else "w"
            else:
                g[y][x] = "G" if x % 3 != 0 else "g"

    g = apply_ink_outline(g, "O")
    return grid_to_image(g)


def build_golden_roof_dome() -> Image.Image:
    """48x32 curved ribbed golden palace roof with upturned eaves (ref_gameplay.png)."""
    g = blank_grid(48, 32, ".")
    # Top ridge & kalasha finial
    g[1][23] = "S"; g[1][24] = "S"
    g[2][22] = "B"; g[2][23] = "S"; g[2][24] = "S"; g[2][25] = "B"
    # Sloped curved ribbed roof (y=3..24)
    for y in range(3, 25):
        dy = y - 3
        half = min(22, 3 + dy)
        for dx in range(-half, half + 1):
            x = 24 + dx
            rib = (abs(dx) % 4 == 0)
            if y == 3:
                g[y][x] = "S"
            elif y >= 22:
                g[y][x] = "S" if y == 22 else ("B" if y == 23 else "g")
            elif rib:
                g[y][x] = "g"
            else:
                g[y][x] = "S" if dx < -half // 2 else ("B" if dx < half // 2 else "G")
    # Upturned wing finials at x=1..2 and x=45..46
    g[20][1] = "S"; g[21][1] = "B"; g[21][2] = "S"
    g[20][46] = "B"; g[21][46] = "G"; g[21][45] = "B"
    # Lower carved frieze under eave (y=25..31)
    for y in range(25, 32):
        for x in range(4, 44):
            if y in (25, 31):
                g[y][x] = "g"
            elif y == 27 and x % 4 == 0:
                g[y][x] = "B"
            else:
                g[y][x] = "a" if x % 2 == 0 else "W"

    g = apply_ink_outline(g, "O")
    return grid_to_image(g)


def build_props_lanka() -> None:
    frames: list[tuple[Image.Image, int]] = [
        (build_torana_arch(), 200),
        (build_sacred_shrine(), 200),
        (build_brass_diya(0), 125),
        (build_brass_diya(1), 125),
        (build_brass_diya(2), 125),
        (build_wall_sconce(0), 125),
        (build_wall_sconce(1), 125),
        (build_wall_sconce(2), 125),
        (build_golden_shikhara(), 200),
        (build_golden_roof_dome(), 200),
    ]
    tags = [
        ("torana_arch", 0, 0),
        ("sacred_shrine", 1, 1),
        ("brass_diya", 2, 4),
        ("wall_sconce", 5, 7),
        ("golden_shikhara", 8, 8),
        ("golden_roof_dome", 9, 9),
    ]
    save_aseprite_sheet(
        "props_lanka",
        frames,
        tags,
        SPRITES_DIR / "props_lanka.png",
        SPRITES_DIR / "props_lanka.json",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 4. LORD HANUMAN (48×32 frames, body centered ~x=24, feet at y=31)
# ═══════════════════════════════════════════════════════════════════════════════

def build_hanuman_frame(
    bx_off: int = 0,
    by_off: int = 0,
    arm_pose: str = "idle",
    leg_pose: str = "idle",
    tail_pose: str = "up",
    flame_phase: int = 0,
    whip_arc: int = 0,
    hurt_flash: bool = False,
) -> Image.Image:
    g = blank_grid(48, 32, ".")
    cx = 24 + bx_off
    # Stocky heroic vanara proportions (~24px tall):
    # Head (y=8..15), Muscular Torso+Dhoti (y=16..24), Strong compact legs (y=25..31, 7px tall)
    by = 8 + by_off

    # 1. Blazing Tail & roaring flame jet (matching ref_gameplay.png)
    tail_curves = {
        "up": [(20, 22), (17, 21), (15, 19), (14, 16), (14, 13), (15, 10), (17, 8)],
        "up2": [(20, 22), (17, 21), (14, 18), (13, 15), (14, 12), (16, 9), (18, 7)],
        "stream": [(20, 22), (17, 21), (14, 20), (11, 18), (9, 16), (8, 14), (7, 12)],
        "stream2": [(20, 22), (17, 22), (14, 21), (11, 19), (8, 17), (7, 15), (6, 13)],
        "jump": [(20, 22), (18, 21), (15, 19), (13, 16), (12, 13), (13, 10), (15, 8)],
        "coil": [(20, 22), (17, 23), (14, 22), (13, 19), (13, 16), (14, 14), (16, 12)],
        "whip1": [(25, 22), (29, 21), (33, 19), (37, 16), (40, 14), (43, 12), (45, 11)],
        "whip2": [(25, 22), (30, 22), (34, 21), (38, 20), (41, 19), (44, 18), (46, 17)],
        "recover": [(21, 22), (18, 20), (16, 17), (16, 14), (17, 11), (18, 9), (19, 7)],
    }
    pts = tail_curves[tail_pose]
    for i, (tx, ty) in enumerate(pts):
        x, y = tx + bx_off, ty + by_off
        if 0 <= x < 48 and 0 <= y < 32:
            g[y][x] = "I" if i >= 4 and i % 2 == 0 else ("g" if i >= 4 else "a")
            if y + 1 < 32:
                g[y + 1][x] = "w" if i < 4 else "I"

    # Flame plume at tail tip
    fx, fy = pts[-1][0] + bx_off, pts[-1][1] + by_off
    if tail_pose in ("stream", "stream2", "jump"):
        plumes = [
            [
                "......RfY...",
                "....RFYfYf..",
                "..RRFFffYYf.",
                "CRFFffffYYf.",
                ".RRFFffYYf..",
                "...CRFYRR...",
            ],
            [
                ".....FRY....",
                "...RFfYfR...",
                ".CRFFffffY..",
                "RRFFFfffYYf.",
                "..CRYYfYFR..",
                "....CRFR....",
            ],
            [
                "......fRY...",
                "...RCFYfYf..",
                ".RRFFffYYfR.",
                "CRFFFfffYYf.",
                "..RFYYfYFR..",
                "....RFYR....",
            ],
        ]
        stamp(g, plumes[flame_phase % 3], max(0, fx - 10), max(0, fy - 3))
    elif tail_pose in ("whip1", "whip2"):
        plumes = [
            ["RFYf", "fYYf", "RFYR"],
            ["CFfY", "YffY", "CRFR"],
        ]
        stamp(g, plumes[flame_phase % 2], min(44, fx - 1), fy - 1)
    else:
        plumes = [
            ["..f..", ".FYf.", "RFfYR", ".CYR."],
            [".f...", "CYfR.", "FfYf.", ".FYR."],
            ["..f..", ".YfF.", "CFfYR", ".RYC."],
        ]
        stamp(g, plumes[flame_phase % 3], fx - 2, max(0, fy - 3))

    # 2. Head & Conical Golden Mukuta Crown (8 rows, y = by..by+7)
    head = [
        "...S....",
        "..SBS...",
        ".gBGBg..",
        ".BSBSB..",
        "CAaaaA..",  # brow & crimson headband
        ".AAfOAO.",  # vanara snout + bright eye
        "..AAAA..",
        "B.aaAa..",  # kundala earring & jaw
    ]
    stamp(g, head, cx - 3, by)

    # 3. Broad Muscular Chest, Yajnopavita, Royal Blue Sash & Crimson-Saffron Dhoti (9 rows, y = by+8..by+16)
    torso = [
        ".AAAaa..",
        "AAAIAAa.",  # broad chest + white sacred thread
        "AAAaIAa.",
        ".AAaIA..",
        ".AAAaA..",
        ".bBBBBb.",  # royal blue sash (#2457A6) + gold belt
        "bFFFFFFb",  # saffron-crimson dhoti wrap
        "FcCCCCcF",
        "FcC..CcF",
    ]
    stamp(g, torso, cx - 3, by + 8)

    # 4. Muscular Arms with golden armlets/wristlets
    if arm_pose == "idle":
        stamp(g, ["AB", "aB", "AA"], cx - 5, by + 9)
        stamp(g, ["BA", "Ba", "AA"], cx + 4, by + 9)
    elif arm_pose == "run1":
        stamp(g, ["AA", "Ba", ".a"], cx - 6, by + 9)
        stamp(g, [".A", "AB", "AA"], cx + 4, by + 8)
    elif arm_pose == "run2":
        stamp(g, [".A", "Ba", "AA"], cx + 4, by + 9)
        stamp(g, ["AA", "AB", ".a"], cx - 6, by + 8)
    elif arm_pose == "jump":
        stamp(g, ["AA", "Ba"], cx - 5, by + 7)
        stamp(g, ["AB", "AA"], cx + 4, by + 6)
    elif arm_pose == "wall":
        stamp(g, ["AA", "Ba", "AA"], cx + 4, by + 7)
        stamp(g, ["AB", "a."], cx - 5, by + 10)
    elif arm_pose == "whip":
        stamp(g, ["AB", "a."], cx - 5, by + 9)
        stamp(g, ["AAB", ".AA"], cx + 4, by + 9)

    # 5. Compact Muscular Vanara Legs (only 7 rows: y = by+17..by+23 = 25..31!)
    ly = by + 17  # 25 + by_off
    if leg_pose == "idle":
        # Wide athletic warrior stance, thick thighs/calves, golden anklets, feet at y=31
        legs = [
            "AAa..aAA",
            "AAa..aAA",
            "AaA..AaA",
            "AB....BA",
            "AA....AA",
            "AAa..aAA",
        ]
        stamp(g, legs, cx - 3, ly)
        g[30][cx - 3] = "A"; g[31][cx - 3] = "A"; g[31][cx - 2] = "A"; g[31][cx - 1] = "a"
        g[30][cx + 2] = "A"; g[31][cx + 2] = "A"; g[31][cx + 3] = "A"; g[31][cx + 4] = "a"
    elif leg_pose == "run1":
        # Athletic forward stride (compact, bent knees)
        legs = [
            "aAA..AAa",
            "AA....AA",
            "B......B",
            "AA....AA",
            "AAA..AAA",
        ]
        stamp(g, legs, cx - 4, ly)
        g[30][cx - 4] = "A"; g[31][cx - 4] = "A"; g[31][cx - 3] = "a"
        g[30][cx + 2] = "A"; g[31][cx + 2] = "A"; g[31][cx + 3] = "a"
    elif leg_pose == "run2":
        # Passing stride
        legs = [
            ".AAaaAA.",
            ".AA..AA.",
            ".AB..BA.",
            ".AA..AA.",
            "AAa..aAA",
        ]
        stamp(g, legs, cx - 3, ly)
        g[30][cx - 2] = "A"; g[31][cx - 2] = "A"; g[31][cx - 1] = "a"
        g[30][cx + 1] = "A"; g[31][cx + 1] = "A"; g[31][cx + 2] = "a"
    elif leg_pose == "jump":
        # Iconic ref_gameplay.png leap: front knee tucked up, back leg trailing cleanly
        legs = [
            "aA..AAAA",
            "AA...ABA",
            "B.....AA",
            "AA......",
        ]
        stamp(g, legs, cx - 4, ly - 1)
    elif leg_pose == "fall":
        legs = [
            "AAa..aAA",
            "AB....BA",
            "AA....AA",
            "AAa..aAA",
        ]
        stamp(g, legs, cx - 3, ly)

    # 6. Sweeping Whip Fire Arc across 24x14 active hitbox zone
    if whip_arc == 1:
        arc = [
            ".....ffYYFF",
            "...ffYYYYFF",
            ".ffYYYYFFRR",
            "ffYYYFFRR..",
            "fYYFFRR....",
        ]
        stamp(g, arc, 33, 11)
    elif whip_arc == 2:
        arc = [
            "....ffYYFFCC",
            "..ffYYYYFFRR",
            "ffYYYYFFRR..",
            "ffYYFFRR....",
            "..ffFFRR....",
            "....CC......",
        ]
        stamp(g, arc, 34, 15)

    if hurt_flash:
        for y in range(32):
            for x in range(48):
                if g[y][x] in ("A", "a", "B", "F"):
                    g[y][x] = "f"

    g = apply_ink_outline(g, "O", skip={"f", "Y"})
    return grid_to_image(g)


def build_hanuman() -> None:
    frames: list[tuple[Image.Image, int]] = []

    # idle (4f @ 6 FPS = 167ms)
    for i in range(4):
        dy = 1 if i in (1, 2) else 0
        frames.append((
            build_hanuman_frame(by_off=dy, tail_pose="up" if i % 2 == 0 else "up2", flame_phase=i),
            167,
        ))

    # run (6f @ 12 FPS = 83ms)
    for i in range(6):
        dy = -1 if i in (1, 4) else 0
        dx = 1 if i in (2, 3) else 0
        arm = "run1" if i % 2 == 0 else "run2"
        leg = "run1" if i % 2 == 0 else "run2"
        frames.append((
            build_hanuman_frame(bx_off=dx, by_off=dy, arm_pose=arm, leg_pose=leg, tail_pose="stream" if i % 2 == 0 else "stream2", flame_phase=i),
            83,
        ))

    # jump (2f @ 10 FPS = 100ms)
    for i in range(2):
        frames.append((
            build_hanuman_frame(by_off=-2, arm_pose="jump", leg_pose="jump", tail_pose="stream", flame_phase=i),
            100,
        ))

    # fall (2f @ 10 FPS = 100ms)
    for i in range(2):
        frames.append((
            build_hanuman_frame(by_off=-1, arm_pose="jump", leg_pose="fall", tail_pose="jump", flame_phase=i),
            100,
        ))

    # wall_slide (2f @ 8 FPS = 125ms)
    for i in range(2):
        frames.append((
            build_hanuman_frame(bx_off=1, by_off=0, arm_pose="wall", leg_pose="fall", tail_pose="up" if i == 0 else "up2", flame_phase=i),
            125,
        ))

    # tail_whip (4f @ 16 FPS = 60ms each = 0.24s)
    frames.append((build_hanuman_frame(bx_off=-2, arm_pose="whip", leg_pose="idle", tail_pose="coil", flame_phase=0), 60))
    frames.append((build_hanuman_frame(bx_off=1, arm_pose="whip", leg_pose="idle", tail_pose="whip1", flame_phase=1, whip_arc=1), 60))
    frames.append((build_hanuman_frame(bx_off=2, arm_pose="whip", leg_pose="idle", tail_pose="whip2", flame_phase=0, whip_arc=2), 60))
    frames.append((build_hanuman_frame(bx_off=0, arm_pose="idle", leg_pose="idle", tail_pose="recover", flame_phase=2), 60))

    # hurt (2f @ 10 FPS = 100ms)
    frames.append((build_hanuman_frame(bx_off=-1, arm_pose="idle", leg_pose="idle", tail_pose="coil", flame_phase=0, hurt_flash=True), 100))
    frames.append((build_hanuman_frame(bx_off=-2, arm_pose="idle", leg_pose="idle", tail_pose="up2", flame_phase=1, hurt_flash=False), 100))

    tags = [
        ("idle", 0, 3),
        ("run", 4, 9),
        ("jump", 10, 11),
        ("fall", 12, 13),
        ("wall_slide", 14, 15),
        ("tail_whip", 16, 19),
        ("hurt", 20, 21),
    ]
    save_aseprite_sheet(
        "hanuman",
        frames,
        tags,
        SPRITES_DIR / "hanuman.png",
        SPRITES_DIR / "hanuman.json",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 5. RAKSHASA GUARD (32×32 frames)
# ═══════════════════════════════════════════════════════════════════════════════

def build_guard_frame(pose: str = "idle", phase: int = 0) -> Image.Image:
    g = blank_grid(32, 32, ".")
    dx = 1 if (pose == "patrol" and phase in (1, 2)) else (-1 if pose == "knockback" else 0)
    dy = 1 if (pose == "idle" and phase == 1) or (pose == "patrol" and phase % 2 == 1) else 0
    ox = 10 + dx
    oy = 5 + dy

    # Horned bronze/indigo crown & armored face
    head = [
        ".S....S.",
        ".gB..Bg.",
        ".3GGGG3.",
        "23333332",
        "32YY32YY",  # glowing amber eyes
        ".3M33M3.",  # fangs
        ".233332.",
    ]
    stamp(g, head, ox + 1, oy)

    # Dark bronze/indigo armor + crimson cape & loincloth
    torso = [
        "GB2332BG",
        "gG3333Gg",
        "c233332c",
        "cC3223Cc",
        ".GBBBBG.",
        ".cCCCCc.",
        ".cCrrcC.",
    ]
    stamp(g, torso, ox + 1, oy + 7)

    # Golden war bow & spear
    if pose == "aim":
        # Drawn golden bow + blazing arrow (phase 0: half draw, phase 1: full draw + flame flare)
        bow_x = ox + 9 if phase == 0 else ox + 10
        bow = ["..B.", ".gB.", "gB..", "gB..", ".gB.", "..B."]
        stamp(g, bow, bow_x, oy + 5)
        draw_start = ox + 6 if phase == 0 else ox + 4
        for ax in range(draw_start, bow_x + 6):
            g[oy + 8][ax] = "W"
        if phase == 1:
            g[oy + 7][bow_x + 5] = "F"
            g[oy + 9][bow_x + 5] = "F"
            g[oy + 8][bow_x + 5] = "Y"
            g[oy + 8][bow_x + 6] = "f"
            g[oy + 7][bow_x + 1] = "I"
            g[oy + 9][bow_x + 1] = "I"
        else:
            g[oy + 8][bow_x + 5] = "Y"
    elif pose == "shoot":
        bow = ["..B.", ".gB.", "gB..", "gB..", ".gB.", "..B."]
        stamp(g, bow, ox + 10 - phase, oy + 5)
        g[oy + 8][ox + 12] = "S"
    else:
        # Held golden spear/bow
        for i in range(20):
            sx = ox + 11 - i // 3
            sy = max(1, oy - 2 + i)
            if 0 <= sx < 32 and 0 <= sy < 32:
                g[sy][sx] = "S" if i <= 2 else ("B" if i <= 4 else "g")

    # Legs reaching y=31
    if pose == "patrol" and phase in (1, 3):
        legs = [
            "23....32",
            "3......3",
            "gG....Gg",
            "23....32",
            "33....33",
            "233..332",
        ]
        stamp(g, legs, ox + 1, oy + 14)
        g[31][ox + 1] = "2"; g[31][ox + 2] = "3"
        g[31][ox + 7] = "3"; g[31][ox + 8] = "2"
    else:
        legs = [
            ".23..32.",
            ".33..33.",
            ".gG..Gg.",
            ".23..32.",
            ".23..32.",
            "233..332",
        ]
        stamp(g, legs, ox + 1, oy + 14)
        g[31][ox + 2] = "2"; g[31][ox + 3] = "3"
        g[31][ox + 6] = "3"; g[31][ox + 7] = "2"

    if pose == "knockback" and phase == 0:
        for y in range(32):
            for x in range(32):
                if g[y][x] in ("2", "3", "G"):
                    g[y][x] = "S"

    g = apply_ink_outline(g, "O")
    return grid_to_image(g)


def build_rakshasa_guard() -> None:
    frames = [
        (build_guard_frame("idle", 0), 200),
        (build_guard_frame("idle", 1), 200),
        (build_guard_frame("patrol", 0), 120),
        (build_guard_frame("patrol", 1), 120),
        (build_guard_frame("patrol", 2), 120),
        (build_guard_frame("patrol", 3), 120),
        (build_guard_frame("aim", 0), 140),
        (build_guard_frame("aim", 1), 140),
        (build_guard_frame("shoot", 0), 100),
        (build_guard_frame("shoot", 1), 100),
        (build_guard_frame("knockback", 0), 140),
        (build_guard_frame("knockback", 1), 140),
    ]
    tags = [
        ("idle", 0, 1),
        ("patrol", 2, 5),
        ("aim", 6, 7),
        ("shoot", 8, 9),
        ("knockback", 10, 11),
    ]
    save_aseprite_sheet(
        "rakshasa_guard",
        frames,
        tags,
        SPRITES_DIR / "rakshasa_guard.png",
        SPRITES_DIR / "rakshasa_guard.json",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 6. FX FIRE (public/assets/sprites/fx_fire.png + .json)
# ═══════════════════════════════════════════════════════════════════════════════

def build_fx_fire() -> None:
    fire_loops = [
        [
            ".......f........",
            "......fY........",
            "...R..Yf..R.....",
            "..FY..fY..FY....",
            ".RFYfRfYf.CYf...",
            ".FFYfYfYfRFYf...",
            "RFYfYfYfYfYfFR..",
            "FFYfYfYfYfYfYF..",
            "RFYfYfYfYfYfYfR.",
            "FYfYfYfYfYfYfYF.",
            "RFYfYfYfYfYfYfR.",
            ".FYfYfYfYfYfYF..",
            ".RFYfYfYfYfYFR..",
            "..RFYfYfYfYFR...",
            "...RFFFFFFFR....",
            "....RRRRRRR.....",
        ],
        [
            "........f.......",
            ".......Yf.......",
            "....R..fY..R....",
            "...Yf..Yf.FY....",
            "..FYfRfYf.CYf...",
            "..RYfYfYfRFYf...",
            ".FYfYfYfYfYfYF..",
            "RFYfYfYfYfYfYfR.",
            "FYfYfYfYfYfYfYF.",
            "RFYfYfYfYfYfYfR.",
            ".FYfYfYfYfYfYF..",
            ".RFYfYfYfYfYFR..",
            "..RFYfYfYfYFR...",
            "...RFFFFFFFR....",
            "....RRRRRRR.....",
            "................",
        ],
        [
            "......f.........",
            "......Yf........",
            "..R...fY...R....",
            ".FY...Yf..Yf....",
            ".RYfRFYf..FYf...",
            "RFYfYfYfRFYf....",
            ".FYfYfYfYfYfYF..",
            "RFYfYfYfYfYfYfR.",
            "FYfYfYfYfYfYfYF.",
            "RFYfYfYfYfYfYfR.",
            ".FYfYfYfYfYfYF..",
            ".RFYfYfYfYfYFR..",
            "..RFYfYfYfYFR...",
            "...RFFFFFFFR....",
            "....RRRRRRR.....",
            "................",
        ],
        [
            ".......f........",
            "......fY........",
            "...R..Yf...R....",
            "..Yf..fY..FY....",
            "..FYfRfYf.RYf...",
            ".RFYfYfYfRFYf...",
            ".FYfYfYfYfYfYF..",
            "RFYfYfYfYfYfYfR.",
            "FYfYfYfYfYfYfYF.",
            "RFYfYfYfYfYfYfR.",
            ".FYfYfYfYfYfYF..",
            ".RFYfYfYfYfYFR..",
            "..RFYfYfYfYFR...",
            "...RFFFFFFFR....",
            "....RRRRRRR.....",
            "................",
        ],
    ]

    embers = [
        [".ff.", "fYYf", "fYYf", ".FF."],
        [".YY.", "YFFY", "FRRF", ".RR."],
        ["....", ".fY.", ".FR.", "...."],
    ]

    arrows = [
        [
            ".F......Y...",
            "CYWWWWWWWffY",
            "FYWWWWWWWWfM",
            "CYWWWWWWWffY",
            ".F......Y...",
        ],
        [
            ".R......f...",
            "FYWWWWWWWYYf",
            "RYWWWWWWWWfM",
            "FYWWWWWWWYYf",
            ".R......f...",
        ],
    ]

    sacred_warns = [
        [
            "......HHHH......",
            "....HHIIIIHH....",
            "...HIIlEEllIH...",
            "..HIllSSSSllIH..",
            "..HIlSSffSSlIH..",
            ".HIlSfHHHHfSlIH.",
            ".HIlSfHHHHfSlIH.",
            "..HIlSSffSSlIH..",
            "..HIllSSSSllIH..",
            "...HIIlEEllIH...",
            "....HHIIIIHH....",
            "......HHHH......",
            "................",
            "................",
            "................",
            "................",
        ],
        [
            ".....HHHHHH.....",
            "...HHIIIIIIHH...",
            "..HIll....llIH..",
            ".HIl..SSSS..lIH.",
            ".HIl.SffffS.lIH.",
            "HIl..SfHHfS..lIH",
            "HIl..SfHHfS..lIH",
            ".HIl.SffffS.lIH.",
            ".HIl..SSSS..lIH.",
            "..HIll....llIH..",
            "...HHIIIIIIHH...",
            ".....HHHHHH.....",
            "................",
            "................",
            "................",
            "................",
        ],
        [
            "...HHHHHHHHHH...",
            "..HIllllllllIH..",
            ".HIl........lIH.",
            "HIl..........lIH",
            "HI............IH",
            "HI............IH",
            "HI............IH",
            "HI............IH",
            "HIl..........lIH",
            ".HIl........lIH.",
            "..HIllllllllIH..",
            "...HHHHHHHHHH...",
            "................",
            "................",
            "................",
            "................",
        ],
        [
            "..HHHHHHHHHHHH..",
            ".HI..........IH.",
            "HI............IH",
            "H..............H",
            "H..............H",
            "H..............H",
            "H..............H",
            "H..............H",
            "H..............H",
            "HI............IH",
            ".HI..........IH.",
            "..HHHHHHHHHHHH..",
            "................",
            "................",
            "................",
            "................",
        ],
    ]

    frames: list[tuple[Image.Image, int]] = []
    for f in fire_loops:
        frames.append((grid_to_image(make_16(f)), 100))
    for e in embers:
        frames.append((grid_to_image([[ch for ch in r] for r in e]), 100))
    for a in arrows:
        frames.append((grid_to_image([[ch for ch in r] for r in a]), 100))
    for sw in sacred_warns:
        frames.append((grid_to_image(make_16(sw)), 100))

    tags = [
        ("fire_tile_loop", 0, 3),
        ("ember_spark", 4, 6),
        ("arrow", 7, 8),
        ("sacred_warn", 9, 12),
    ]
    save_aseprite_sheet(
        "fx_fire",
        frames,
        tags,
        SPRITES_DIR / "fx_fire.png",
        SPRITES_DIR / "fx_fire.json",
    )


def main() -> None:
    build_bg_title_lanka()
    build_bg_sky()
    build_bg_far_spires()
    build_bg_mid_palace()
    build_tileset_lanka()
    build_props_lanka()
    build_hanuman()
    build_rakshasa_guard()
    build_fx_fire()
    print("Revamp art assets built successfully!")


if __name__ == "__main__":
    main()

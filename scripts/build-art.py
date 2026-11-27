#!/usr/bin/env python3
"""
scripts/build-art.py — Deterministic pixel-art compiler for Lanka Dahan.
Compiles 24-color J2ME palette sprites, tilesets, VFX, and parallax backgrounds
from explicit character-mapped pixel grids into PNGs and Aseprite JSON Hash atlases.
"""

import json
import math
import os
from pathlib import Path
from PIL import Image

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Master Curated 24-Color Palette (+ transparent '.')
PALETTE = {
    ".": (0, 0, 0, 0),
    "O": (11, 10, 20, 255),     # OUTLINE #0b0a14
    "D": (18, 20, 43, 255),     # SKY_DARK #12142b
    "M": (29, 34, 71, 255),     # SKY_MID #1d2247
    "L": (45, 53, 97, 255),     # SKY_LIGHT #2d3561
    "g": (110, 68, 28, 255),    # GOLD_SHADOW #6e441c
    "G": (184, 121, 36, 255),   # GOLD_MID #b87924
    "B": (240, 184, 61, 255),   # GOLD_BRIGHT #f0b83d
    "S": (255, 241, 168, 255),  # GOLD_SPEC #fff1a8
    "w": (71, 35, 24, 255),     # WOOD_DARK #472318
    "W": (125, 61, 34, 255),    # WOOD_MID #7d3d22
    "c": (105, 20, 38, 255),    # CRIMSON_DARK #691426
    "C": (184, 35, 58, 255),    # CRIMSON_BRIGHT #b8233a
    "s": (143, 59, 27, 255),    # SKIN_SHADOW #8f3b1b
    "K": (212, 100, 42, 255),   # SKIN_MID #d4642a
    "k": (242, 148, 75, 255),   # SKIN_LIGHT #f2944b
    "F": (255, 122, 26, 255),   # SAFFRON #ff7a1a
    "T": (242, 237, 225, 255),  # CLOTH_WHITE #f2ede1
    "d": (36, 28, 51, 255),     # DEMON_SHADOW #241c33
    "V": (74, 58, 94, 255),     # DEMON_MID #4a3a5e
    "v": (117, 97, 138, 255),   # DEMON_LIGHT #75618a
    "f": (255, 251, 224, 255),  # FIRE_CORE #fffbe0
    "Y": (255, 212, 59, 255),   # FIRE_BRIGHT #ffd43b
    "I": (215, 230, 240, 255),  # SACRED_MARBLE #d7e6f0
    "E": (45, 153, 115, 255),   # SACRED_EMERALD #2d9973
}


def blank_canvas(w: int, h: int) -> list[list[str]]:
    return [["." for _ in range(w)] for _ in range(h)]


def stamp_grid(canvas: list[list[str]], grid: list[str], ox: int = 0, oy: int = 0) -> None:
    h = len(canvas)
    w = len(canvas[0])
    for r, row in enumerate(grid):
        y = oy + r
        if y < 0 or y >= h:
            continue
        for c, ch in enumerate(row):
            x = ox + c
            if 0 <= x < w and ch != ".":
                canvas[y][x] = ch


def apply_outline(canvas: list[list[str]], outline_char: str = "O", skip_chars: set[str] | None = None) -> list[list[str]]:
    """Add 1px dark outline around non-transparent pixels."""
    h = len(canvas)
    w = len(canvas[0])
    out = [row[:] for row in canvas]
    skip = skip_chars or set()
    for y in range(h):
        for x in range(w):
            if canvas[y][x] != ".":
                continue
            has_neighbor = False
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    nc = canvas[ny][nx]
                    if nc != "." and nc != outline_char and nc not in skip:
                        has_neighbor = True
                        break
            if has_neighbor:
                out[y][x] = outline_char
    return out


def render_grid_to_image(canvas: list[list[str]]) -> Image.Image:
    h = len(canvas)
    w = len(canvas[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            ch = canvas[y][x]
            px[x, y] = PALETTE[ch]
    return img


def save_aseprite_sheet(
    name: str,
    frames: list[list[list[str]]],
    durations: list[int],
    tags: list[tuple[str, int, int]],
    fw: int,
    fh: int,
    cols: int | None = None,
) -> None:
    n = len(frames)
    if cols is None:
        cols = n
    rows = math.ceil(n / cols)
    sheet_w = cols * fw
    sheet_h = rows * fh
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    json_frames = {}
    for idx, grid in enumerate(frames):
        col = idx % cols
        row = idx // cols
        x = col * fw
        y = row * fh
        frame_img = render_grid_to_image(grid)
        sheet.paste(frame_img, (x, y))
        json_frames[f"{name} {idx}.aseprite"] = {
            "frame": {"x": x, "y": y, "w": fw, "h": fh},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
            "sourceSize": {"w": fw, "h": fh},
            "duration": durations[idx],
        }

    meta = {
        "app": "build-art.py",
        "version": "1.0",
        "image": f"{name}.png",
        "format": "RGBA8888",
        "size": {"w": sheet_w, "h": sheet_h},
        "scale": "1",
        "frameTags": [
            {"name": tag_name, "from": f_idx, "to": t_idx, "direction": "forward"}
            for tag_name, f_idx, t_idx in tags
        ],
    }

    sheet.save(OUT_DIR / f"{name}.png")
    with open(OUT_DIR / f"{name}.json", "w", encoding="utf-8") as fp:
        json.dump({"frames": json_frames, "meta": meta}, fp, indent=2)


# ─── A. LORD HANUMAN (32x32) ──────────────────────────────────────────────────

HANUMAN_HEAD = [
    "....S.....",  # crown tip
    "...SBS....",  # mukuta upper
    "..gBGBg...",  # mukuta tier
    "..BSBSB...",  # crown band
    ".FkKKkKO..",  # brow & saffron headband
    ".kKCTKOT..",  # tilak & bright eye
    "..KKKKkk..",  # vanara snout
    ".B.KssK...",  # gold kundala earring & jaw
]

HANUMAN_TORSO = [
    "...kKKKk..",  # shoulders
    "..kKTKKs..",  # chest + yajnopavita thread
    "..KKKTKs..",  # torso + diagonal thread
    "...KKKTK..",  # waist
    "...BGBGB..",  # gold waist sash
    "..FFCcFF..",  # saffron/crimson dhoti
    "..FcCCcF..",  # dhoti folds
]

def build_hanuman_frame(
    body_dx: int = 0,
    body_dy: int = 0,
    ribbon_phase: int = 0,
    arm_pose: str = "idle",
    leg_pose: str = "idle",
    tail_pose: str = "up",
    flame_phase: int = 0,
    hurt_flash: bool = False,
    whip_arc: int = 0,
) -> list[list[str]]:
    c = blank_canvas(32, 32)
    bx = 12 + body_dx
    by = 8 + body_dy

    # Tail & oil-cloth wrap (drawn behind body)
    tail_paths = {
        "up": [(10, 21), (8, 20), (7, 18), (6, 15), (6, 12), (7, 9), (8, 7)],
        "up2": [(10, 21), (8, 20), (6, 17), (6, 14), (7, 11), (8, 8), (9, 6)],
        "trail": [(10, 21), (8, 21), (6, 20), (4, 18), (3, 16), (2, 14), (2, 12)],
        "trail2": [(10, 21), (8, 20), (6, 19), (4, 18), (3, 17), (2, 15), (1, 13)],
        "coil": [(10, 21), (8, 22), (6, 21), (5, 19), (5, 16), (6, 14), (7, 12)],
        "whip1": [(13, 21), (16, 20), (19, 18), (22, 16), (25, 14), (27, 12), (29, 11)],
        "whip2": [(13, 21), (17, 21), (21, 20), (24, 19), (27, 18), (29, 17), (30, 16)],
        "recover": [(11, 21), (9, 20), (8, 17), (9, 14), (10, 11), (9, 9), (8, 7)],
    }
    pts = tail_paths[tail_pose]
    for idx, (tx, ty) in enumerate(pts):
        x, y = tx + body_dx, ty + body_dy
        if 0 <= x < 32 and 0 <= y < 32:
            # Alternating oil-wrapped cloth & gold shadow
            c[y][x] = "T" if idx % 2 == 0 else "g"
            if y + 1 < 32 and idx < 4:
                c[y + 1][x] = "s"

    # Tail flame at tip
    fx, fy = pts[-1][0] + body_dx, pts[-1][1] + body_dy
    flame_shapes = [
        [
            "..C.",
            ".FY.",
            "FfYC",
            ".FY.",
        ],
        [
            ".F..",
            "CYf.",
            ".fYC",
            ".FY.",
        ],
        [
            "..F.",
            ".YfC",
            "CfY.",
            ".YF.",
        ],
    ]
    fgrid = flame_shapes[flame_phase % 3]
    stamp_grid(c, fgrid, fx - 1, fy - 2)

    # Flowing saffron headband ribbon
    ribbons = [
        ["FF.", ".FF"],
        ["FF.", "F.F"],
        ["FFF", ".F."],
        [".FF", "FF."],
    ]
    stamp_grid(c, ribbons[ribbon_phase % 4], bx - 2, by + 3)

    # Head & Torso
    stamp_grid(c, HANUMAN_HEAD, bx, by)
    stamp_grid(c, HANUMAN_TORSO, bx, by + 8)

    # Arms
    if arm_pose == "idle":
        stamp_grid(c, ["kB", "KB", "k."], bx - 1, by + 9)   # back arm
        stamp_grid(c, ["kK", "BK", "k."], bx + 6, by + 9)   # front arm
    elif arm_pose == "run1":
        stamp_grid(c, ["k.", "BK", ".K"], bx - 2, by + 9)
        stamp_grid(c, [".K", "KB", "k."], bx + 7, by + 8)
    elif arm_pose == "run2":
        stamp_grid(c, [".K", "BK", "k."], bx + 7, by + 9)
        stamp_grid(c, ["k.", "KB", ".K"], bx - 2, by + 8)
    elif arm_pose == "jump":
        stamp_grid(c, ["k.", "BK"], bx - 1, by + 7)
        stamp_grid(c, ["kB", "K."], bx + 7, by + 6)
    elif arm_pose == "wall":
        stamp_grid(c, ["kK", "BK", "K."], bx + 7, by + 7)
        stamp_grid(c, ["kB", "K."], bx - 1, by + 10)
    elif arm_pose == "whip":
        stamp_grid(c, ["kB", "K."], bx - 1, by + 9)
        stamp_grid(c, ["kKB", "..k"], bx + 7, by + 9)

    # Legs (must reach y=31 for grounded poses!)
    # Torso bottom is at by + 15 = 23 + body_dy. So legs span y=23..31.
    leg_y = by + 15
    if leg_pose == "idle":
        # Left & right legs straight down to y=31
        legs = [
            ".Ks..Ks.",
            ".Ks..Ks.",
            ".Ks..Ks.",
            ".Ks..Ks.",
            ".KB..KB.",
            ".KK..KK.",
            ".kK..kK.",
            ".kKk.kKk",
        ]
        stamp_grid(c, legs, bx + 1, leg_y)
    elif leg_pose == "run1":
        legs = [
            "sK....Ks",
            "K......K",
            "B......B",
            "K......K",
            "kK....kK",
            "kKk..kKk",
            "........",
            "........",
        ]
        stamp_grid(c, legs, bx + 1, leg_y)
        # Ensure grounded feet touch y=30..31
        c[30][bx + 1] = "k"; c[31][bx + 1] = "K"; c[31][bx + 2] = "K"
        c[30][bx + 7] = "k"; c[31][bx + 7] = "K"; c[31][bx + 8] = "K"
    elif leg_pose == "run2":
        legs = [
            "..KsKs..",
            "..KsKs..",
            "..KBKB..",
            "..KKKK..",
            "..kKkK..",
            "..kKkKk.",
            "........",
            "........",
        ]
        stamp_grid(c, legs, bx + 1, leg_y)
        c[30][bx + 3] = "k"; c[31][bx + 3] = "K"; c[31][bx + 4] = "K"
        c[30][bx + 5] = "k"; c[31][bx + 5] = "K"; c[31][bx + 6] = "K"
    elif leg_pose == "jump":
        legs = [
            ".Ks..Ks.",
            ".KB...KB",
            ".KK...kK",
            ".kKk..kK",
        ]
        stamp_grid(c, legs, bx + 1, leg_y)
    elif leg_pose == "fall":
        legs = [
            ".Ks..Ks.",
            ".Ks..Ks.",
            ".KB..KB.",
            ".kK..kK.",
            ".kKk.kKk",
        ]
        stamp_grid(c, legs, bx + 1, leg_y)

    # Whip luminous fire arc overlay
    if whip_arc == 1:
        arc = [
            "....YfS",
            "..CYfYS",
            ".CFYfY.",
            "CCFY...",
        ]
        stamp_grid(c, arc, 23, 10)
    elif whip_arc == 2:
        arc = [
            "...CfS",
            ".CFfYS",
            "CCFYfS",
            ".CFfY.",
            "...Cf.",
        ]
        stamp_grid(c, arc, 25, 13)

    if hurt_flash:
        for y in range(32):
            for x in range(32):
                if c[y][x] in ("K", "k", "s"):
                    c[y][x] = "S"

    return apply_outline(c, "O", skip_chars={"f", "Y"})


def build_hanuman() -> None:
    frames = []
    durations = []

    # idle (4f, 150ms)
    for i in range(4):
        dy = 1 if i in (1, 2) else 0
        frames.append(build_hanuman_frame(body_dy=dy, ribbon_phase=i, tail_pose="up" if i % 2 == 0 else "up2", flame_phase=i))
        durations.append(150)

    # run (6f, 80ms)
    for i in range(6):
        dy = -1 if i in (1, 4) else 0
        arm = "run1" if i % 2 == 0 else "run2"
        leg = "run1" if i % 3 != 1 else "run2"
        frames.append(build_hanuman_frame(body_dx=1, body_dy=dy, ribbon_phase=i, arm_pose=arm, leg_pose=leg, tail_pose="trail" if i % 2 == 0 else "trail2", flame_phase=i))
        durations.append(80)

    # jump (2f, 100ms)
    for i in range(2):
        frames.append(build_hanuman_frame(body_dy=-2, ribbon_phase=i, arm_pose="jump", leg_pose="jump", tail_pose="trail", flame_phase=i))
        durations.append(100)

    # fall (2f, 100ms)
    for i in range(2):
        frames.append(build_hanuman_frame(body_dy=-1, ribbon_phase=i, arm_pose="jump", leg_pose="fall", tail_pose="up2", flame_phase=i))
        durations.append(100)

    # wall_slide (2f, 120ms)
    for i in range(2):
        frames.append(build_hanuman_frame(body_dx=1, body_dy=0, ribbon_phase=i, arm_pose="wall", leg_pose="fall", tail_pose="up", flame_phase=i))
        durations.append(120)

    # tail_whip (4f, 60ms)
    frames.append(build_hanuman_frame(body_dx=-1, ribbon_phase=0, arm_pose="whip", leg_pose="idle", tail_pose="coil", flame_phase=0))
    frames.append(build_hanuman_frame(body_dx=1, ribbon_phase=1, arm_pose="whip", leg_pose="idle", tail_pose="whip1", flame_phase=1, whip_arc=1))
    frames.append(build_hanuman_frame(body_dx=2, ribbon_phase=2, arm_pose="whip", leg_pose="idle", tail_pose="whip2", flame_phase=2, whip_arc=2))
    frames.append(build_hanuman_frame(body_dx=0, ribbon_phase=3, arm_pose="idle", leg_pose="idle", tail_pose="recover", flame_phase=0))
    durations.extend([60, 60, 60, 60])

    # hurt (2f, 150ms)
    for i in range(2):
        frames.append(build_hanuman_frame(body_dx=-1, body_dy=0, ribbon_phase=i, arm_pose="idle", leg_pose="idle", tail_pose="coil", flame_phase=i, hurt_flash=(i == 0)))
        durations.append(150)

    tags = [
        ("idle", 0, 3),
        ("run", 4, 9),
        ("jump", 10, 11),
        ("fall", 12, 13),
        ("wall_slide", 14, 15),
        ("tail_whip", 16, 19),
        ("hurt", 20, 21),
    ]
    save_aseprite_sheet("hanuman", frames, durations, tags, 32, 32)


# ─── B. RAKSHASA GUARD (32x32) ────────────────────────────────────────────────

def build_guard_frame(phase: int = 0, attack_step: int = -1, hurt_flash: bool = False) -> list[list[str]]:
    c = blank_canvas(32, 32)
    dy = 1 if (phase % 2 == 1 and attack_step < 0) else 0
    ox = 10
    oy = 5 + dy

    # Crested/horned Dravidian war helm & face
    head = [
        "...S..S...",
        "..BG..GB..",
        "..gGGGGg..",
        ".dVVVVVVd.",
        ".vVVYYVVY.",  # glowing amber eyes
        "..VT..TV..",  # ivory fangs
        "..dVVVVd..",
    ]
    stamp_grid(c, head, ox + 1, oy)

    # Armor, pauldrons, torso, crimson waistcloth
    torso = [
        ".GBdVVdBG.",
        "gGGVVVVGGg",
        ".dVVVVVVd.",
        "..VVVVVV..",
        "..GBGBGB..",
        ".cCCCCCCc.",
        ".cCCccCCc.",
    ]
    stamp_grid(c, torso, ox + 1, oy + 7)

    # Spear (diagonal or thrusting)
    if attack_step == 0:  # telegraph back
        for i in range(18):
            sx, sy = 7 + i, 19 - i // 2
            if 0 <= sx < 32 and 0 <= sy < 32:
                c[sy][sx] = "S" if i >= 15 else ("B" if i >= 13 else "W")
    elif attack_step == 1:  # strike forward
        for i in range(22):
            sx, sy = 9 + i, 14
            if 0 <= sx < 32:
                c[sy][sx] = "S" if i >= 19 else ("B" if i >= 17 else "W")
    else:  # diagonal held spear
        for i in range(22):
            sx, sy = 23 - i // 2, 3 + i
            if 0 <= sx < 32 and 0 <= sy < 32:
                c[sy][sx] = "S" if i <= 2 else ("B" if i <= 4 else "W")

    # Legs reaching y=31
    leg_y = oy + 14
    if phase % 2 == 0 or attack_step >= 0:
        legs = [
            "..dV..Vd..",
            "..VV..VV..",
            "..VV..VV..",
            "..gG..Gg..",
            "..dV..Vd..",
            "..dV..Vd..",
            ".dVV..VVd.",
            ".dVV..VVd.",
        ]
    else:
        legs = [
            "...dVVd...",
            "..dV..Vd..",
            "..gG..Gg..",
            "..VV..VV..",
            "..dV..Vd..",
            ".dVV..VVd.",
            ".dVV..VVd.",
            ".dVV..VVd.",
        ]
    stamp_grid(c, legs, ox + 1, leg_y)
    # Guarantee feet at y=30..31
    c[31][ox + 3] = "d"; c[31][ox + 4] = "V"
    c[31][ox + 7] = "V"; c[31][ox + 8] = "d"

    if hurt_flash:
        for y in range(32):
            for x in range(32):
                if c[y][x] in ("V", "v", "d"):
                    c[y][x] = "S"

    return apply_outline(c, "O")


def build_rakshasa_guard() -> None:
    frames = [
        build_guard_frame(0),
        build_guard_frame(1),
        build_guard_frame(0),
        build_guard_frame(1),
        build_guard_frame(2),
        build_guard_frame(3),
        build_guard_frame(0, attack_step=0),
        build_guard_frame(0, attack_step=1),
        build_guard_frame(0, attack_step=2),
        build_guard_frame(0, hurt_flash=True),
        build_guard_frame(1, hurt_flash=False),
    ]
    durations = [200, 200, 120, 120, 120, 120, 100, 100, 100, 150, 150]
    tags = [
        ("idle", 0, 1),
        ("patrol", 2, 5),
        ("attack", 6, 8),
        ("hurt", 9, 10),
    ]
    save_aseprite_sheet("rakshasa_guard", frames, durations, tags, 32, 32)


# ─── C. RAKSHASA ARCHER & ARROW (32x32) ──────────────────────────────────────

def build_archer_frame(pose: str = "idle", phase: int = 0, hurt_flash: bool = False) -> list[list[str]]:
    c = blank_canvas(32, 32)
    dy = 1 if (pose == "idle" and phase == 1) else 0
    ox = 10
    oy = 7 + dy

    # Leaner horned helm
    head = [
        ".G....G.",
        ".BG..GB.",
        "..dVVd..",
        ".vVVYYV.",
        "..dVVd..",
    ]
    stamp_grid(c, head, ox + 1, oy)

    # Gold chest harness & crimson cloak
    torso = [
        ".cVGGVc.",
        "cCVGGVCc",
        "cCVVVVCc",
        ".cGBBGc.",
        ".cCCCCc.",
    ]
    stamp_grid(c, torso, ox + 1, oy + 5)

    # Curved war bow (dhanush) on right
    bow = [
        "..B.",
        ".GB.",
        "gB..",
        "gB..",
        "gB..",
        ".GB.",
        "..B.",
    ]
    stamp_grid(c, bow, ox + 9, oy + 3)

    if pose == "aim":
        # Drawn bowstring & glowing arrow
        for x in range(ox + 6, ox + 14):
            c[oy + 6][x] = "W"
        c[oy + 6][ox + 14] = "Y"
        c[oy + 6][ox + 15] = "f"
    elif pose == "shoot":
        c[oy + 6][ox + 10] = "T"

    # Legs reaching y=31
    legs = [
        "..dV.Vd..",
        "..VV.VV..",
        "..gG.Gg..",
        "..dV.Vd..",
        "..dV.Vd..",
        ".dVV.VVd.",
        ".dVV.VVd.",
        ".dVV.VVd.",
    ]
    stamp_grid(c, legs, ox + 1, oy + 10)
    c[31][ox + 3] = "d"; c[31][ox + 4] = "V"
    c[31][ox + 6] = "V"; c[31][ox + 7] = "d"

    if hurt_flash:
        for y in range(32):
            for x in range(32):
                if c[y][x] in ("V", "v", "d"):
                    c[y][x] = "S"

    return apply_outline(c, "O")


def build_arrow_frame(phase: int = 0) -> list[list[str]]:
    c = blank_canvas(32, 32)
    # Centered 16x8 flaming arrow inside 32x32
    tip = "f" if phase == 0 else "Y"
    tail_f = "F" if phase == 0 else "C"
    grid = [
        "................",
        f"..{tail_f}.........Y...",
        f".{tail_f}YWWWWWWWWWW{tip}f.",
        f"{tail_f}CYWWWWWWWWWWW{tip}ff",
        f".{tail_f}YWWWWWWWWWW{tip}f.",
        f"..{tail_f}.........Y...",
        "................",
        "................",
    ]
    stamp_grid(c, grid, 8, 12)
    return apply_outline(c, "O", skip_chars={"f", "Y"})


def build_rakshasa_archer() -> None:
    frames = [
        build_archer_frame("idle", 0),
        build_archer_frame("idle", 1),
        build_archer_frame("aim", 0),
        build_archer_frame("aim", 1),
        build_archer_frame("shoot", 0),
        build_archer_frame("shoot", 1),
        build_archer_frame("idle", 0, hurt_flash=True),
        build_archer_frame("idle", 1, hurt_flash=False),
        build_arrow_frame(0),
        build_arrow_frame(1),
    ]
    durations = [200, 200, 150, 150, 100, 100, 150, 150, 100, 100]
    tags = [
        ("idle", 0, 1),
        ("aim", 2, 3),
        ("shoot", 4, 5),
        ("hurt", 6, 7),
        ("arrow", 8, 9),
    ]
    save_aseprite_sheet("rakshasa_archer", frames, durations, tags, 32, 32)


# ─── D. LANKA TILESET (16x16 grid, 5 cols x 5 rows) ───────────────────────────

def make_tile(rows: list[str]) -> list[list[str]]:
    return [[ch for ch in r] for r in rows]


def build_lanka_tiles() -> None:
    tiles: list[list[list[str]]] = []

    # Row 0: STONE (5 tiles)
    tiles.append(make_tile([  # 0: cornice with merlons
        "OO..OO..OO..OO..",
        "SB..SB..SB..SB..",
        "BG..BG..BG..BG..",
        "GGGGGGGGGGGGGGGG",
        "BBBBBBBBBBBBBBBB",
        "gGGGGGGGGGGGGGGg",
        "GggGGggGGggGGggG",
        "GGGGGGGGGGGGGGGG",
        "gGGGGGGGGGGGGGGg",
        "GGBBBBGGBBBBGGBB",
        "GGGGGGGGGGGGGGGG",
        "gGGggGGggGGggGGg",
        "GGGGGGGGGGGGGGGG",
        "gGGGGGGGGGGGGGGg",
        "gggggggggggggggg",
        "OOOOOOOOOOOOOOOO",
    ]))
    tiles.append(make_tile([  # 1: carved wall
        "GGGGGGGGGGGGGGGG",
        "gGGgBBgGGgBBgGGg",
        "gGGgGGgGGgGGgGGg",
        "GGGGGGGGGGGGGGGG",
        "gGGGGgBBBBgGGGGg",
        "gGGGGgGggGgGGGGg",
        "gGGGGgGggGgGGGGg",
        "gGGGGgBBBBgGGGGg",
        "GGGGGGGGGGGGGGGG",
        "gGGgGGgGGgGGgGGg",
        "gGGgBBgGGgBBgGGg",
        "GGGGGGGGGGGGGGGG",
        "gGGGGGGGGGGGGGGg",
        "gGGGGGGGGGGGGGGg",
        "gggggggggggggggg",
        "OOOOOOOOOOOOOOOO",
    ]))
    tiles.append(make_tile([  # 2: fluted golden pillar
        "..BBBBBBBBBBBB..",
        "..gGGGGGGGGGGg..",
        "...BGBGBGBGBG...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBgBGgBGB...",
        "...BGBGBGBGBG...",
        "..gGGGGGGGGGGg..",
        "..BBBBBBBBBBBB..",
        "..OOOOOOOOOOOO..",
    ]))
    tiles.append(make_tile([  # 3: arched alcove
        "GGGGGGGGGGGGGGGG",
        "gGGGGgBBBBgGGGGg",
        "gGGGgBDDDDgGGGGg",
        "gGGgBDDDDDDgGGGg",
        "gGGgDDDDDDDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgDDMMMMDDgGGg",
        "gGGgBBBBBBBBgGGg",
        "OOOOOOOOOOOOOOOO",
    ]))
    tiles.append(make_tile([  # 4: solid gold-inlaid block
        "SBBBBBBBBBBBBBBG",
        "BGGGGGGGGGGGGGGg",
        "BGgGGGGGGGGGGgGg",
        "BGGgGGGGGGGGgGGg",
        "BGGGGBBBBBBGGGGg",
        "BGGGBGGGGGGbGGGg".replace("b", "B"),
        "BGGGBGggggGBGGGg",
        "BGGGBGggggGBGGGg",
        "BGGGBGGGGGGbGGGg".replace("b", "B"),
        "BGGGGBBBBBBGGGGg",
        "BGGgGGGGGGGGgGGg",
        "BGgGGGGGGGGGGgGg",
        "BGGGGGGGGGGGGGGg",
        "gGGGGGGGGGGGGGGg",
        "gggggggggggggggg",
        "OOOOOOOOOOOOOOOO",
    ]))

    # Row 1: WOOD_ROOF (5 tiles: intact, igniting, burning_0, burning_1, collapsed)
    tiles.append(make_tile([  # 5: intact
        "SBGGGGGGGGGGGGGB",
        "OWWWWWWWWWWWWWWO",
        "OWwWWwWWwWWwWWwO",
        "OWWWWWWWWWWWWWWO",
        "OwwwwwwwwwwwwwwO",
        "OWwWWwWWwWWwWWwO",
        "OWWWWWWWWWWWWWWO",
        "OwwwwwwwwwwwwwwO",
        "..w..w....w..w..",
        "..w..w....w..w..",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 6: igniting
        "SBGFGGGGGGFGGGGB",
        "OWwWWwWWwWWwWWwO",
        "OWwOwWWwOwWWwOwO",
        "OWWFWWWWWFWWWWWO",
        "OwwwwOwwwwOwwwwO",
        "OWwWWwWWwWWwWWwO",
        "OwwwwwwwwwwwwwwO",
        "OwwOwwwwwwwwOwwO",
        "..w..w....w..w..",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 7: burning_0
        "..C..fY..C..Yf..",
        ".FYfCYfY.FYfCY..",
        "fYfCFYfYCfYfCFY.",
        "OWwFFwWWFFwWWwWO",
        "OwwOwFFwwwwOwwwO",
        "OWwWWwWWwWWwWWwO",
        "OwwwwwwwwwwwwwwO",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 8: burning_1
        ".Yf..CF..Yf..C..",
        "CYfY.FYf.YfY.FY.",
        ".FYfCFYfCFYfCFY.",
        "OWwFFwFFwWWFFwWO",
        "OwwOwwwOwwwwOwwO",
        "OWwWWwWWwWWwWWwO",
        "OwwwwwwwwwwwwwwO",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 9: collapsed
        "................",
        "................",
        "................",
        "................",
        "OO............OO",
        "OwO..........OwO",
        ".OwO........OwO.",
        "..OO........OO..",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))

    # Row 2: BANNER (5 tiles: intact_0, intact_1, igniting, burning_0, burning_1)
    tiles.append(make_tile([  # 10: intact_0
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCCCCCCCCCO",
        "OCcCCcBBBBcCCcCO",
        "OCCCCCBSSBCCCCCO",
        "OCcCCcBBBBcCCcCO",
        "OCCCCCCCCCCCCCCO",
        ".OCCCCCCCCCCCCO.",
        ".OCcCCCCCCCCcCO.",
        "..OCCCCCCCCCCO..",
        "..OCcCCCCCCcCO..",
        "...OCCCCCCCCO...",
        "...OCBBBBBBCO...",
        "....OCCCCCCCO...",
        ".....OCCCCCcO...",
        "......OBBBO.....",
        ".......OOO......",
    ]))
    tiles.append(make_tile([  # 11: intact_1 (wind flutter)
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCCCCCCCCCO",
        ".OCcCCcBBBBcCCcO",
        ".OCCCCCBSSBCCCCO",
        ".OCcCCcBBBBcCCcO",
        "..OCCCCCCCCCCCCO",
        "..OCCCCCCCCCCCO.",
        "...OCcCCCCCCcCO.",
        "...OCCCCCCCCCO..",
        "....OCcCCCCcCO..",
        "....OCCCCCCCO...",
        ".....OCBBBBCO...",
        ".....OCCCCCCO...",
        "......OCCCCO....",
        ".......OBBO.....",
        "........OO......",
    ]))
    tiles.append(make_tile([  # 12: igniting
        "OBBBBBBBBBBBBBBO",
        "OCCCCCCFCCCCCCCO",
        "OCcCCcFBBFcCCcCO",
        "OCCCCCFSSFCCCCCO",
        "OCcCCcBBBBcCCcCO",
        "OCCCwCCCCCCwCCCO",
        ".OCCwCCCCCCwCCO.",
        "..OCCCCCCCCCCO..",
        "..OCwCCCCCCwCO..",
        "...OCCCCCCCCO...",
        "...OCBBBBBBCO...",
        "....OCCCCCCCO...",
        ".....OwwCCCcO...",
        "......OBBBO.....",
        ".......OOO......",
        "................",
    ]))
    tiles.append(make_tile([  # 13: burning_0
        "OBBFCBBfYBBFCBYO",
        "OCFYfCCfYCCFYfCO",
        "OCcCfYBBBBYfcCcO",
        "OCCCfYfSSfYCCCCO",
        ".OCcFYBBBBYFcCO.",
        "..OCFYCCCCYFCO..",
        "..OCCFYCCYFCCO..",
        "...OCcFYYFcCO...",
        "....OCCCCCCCO...",
        ".....OCFFCCO....",
        "......OBBO......",
        ".......OO.......",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 14: burning_1
        "OBYfCBBFCBBYfBCO",
        "OCfYfCCFYfCfYfCO",
        ".OCcFYBBBBFYcCO.",
        ".OCCCfYSSYfCCCO.",
        "..OCcYBBBBYcCO..",
        "..OCFYCCCCYFCO..",
        "...OCFYCCYFCO...",
        "...OCCFYYFCCO...",
        "....OCCCCCCCO...",
        ".....OCYYCCO....",
        "......OBBO......",
        ".......OO.......",
        "................",
        "................",
        "................",
        "................",
    ]))

    # Row 3: SACRED (5 tiles: marble roof, tulsi pillar, ashoka canopy, crest, marble base)
    tiles.append(make_tile([  # 15: moonlit marble roof with lotus
        "IIIIIIIIIIIIIIII",
        "ILLIIIIIIIIIILLI",
        "IILIIIIIIIIIIILI",
        "IIIIIIIIIIIIIIII",
        "ILIIIIIIIIIIIILI",
        "IIIEIIIIIIIIEIII",
        "IIIEEIISSIIEEIII",
        "IIIIEIISSI EIIII".replace(" ", "I"),
        "IIIIIIIIIIIIIIII",
        "ILLLLLLLLLLLLLLI",
        "IIIIIIIIIIIIIIII",
        "ILIIIIIIIIIIIILI",
        "IIIIIIIIIIIIIIII",
        "ILLLLLLLLLLLLLLI",
        "DDDDDDDDDDDDDDDD",
        "OOOOOOOOOOOOOOOO",
    ]))
    tiles.append(make_tile([  # 16: sacred tulsi/garlanded pillar
        "..IIIIIIIIIIII..",
        "..ILLLLLLLLLLI..",
        "...IEEEEEEEI....",
        "...ISIIIIISI....",
        "...IILIIILII....",
        "...IEEEEEEEE....",
        "...IILIIILII....",
        "...IILIIILII....",
        "...IEEEEEEEI....",
        "...IILIIILII....",
        "...IILIIILII....",
        "...IEEEEEEEI....",
        "...IILIIILII....",
        "..ILLLLLLLLLLI..",
        "..IIIIIIIIIIII..",
        "..OOOOOOOOOOOO..",
    ]))
    tiles.append(make_tile([  # 17: Ashoka canopy
        "...OEEEEEEEEO...",
        "..OEEEEEEEEEEO..",
        ".OEEESEEEEESEEO.",
        "OEEEEIEEEEEIEEEE",
        "OEEEEEEEEEEEEEEO",
        "OEEESEEEEEEESEEO",
        "OEEEEEEEEEEEEEEO",
        ".OEEEEIEEEEIEEO.",
        ".OEEEEEEEEEEEEO.",
        "..OEEEEEEEEEEO..",
        "...OOOEEEEOOO...",
        "......OWWO......",
        "......OWWO......",
        "......OWWO......",
        "......OWWO......",
        "......OOOO......",
    ]))
    tiles.append(make_tile([  # 18: auspicious crest
        "IIIIIIIIIIIIIIII",
        "ILLLLIIIIIILLLLI",
        "ILIIIIISSIIIIILI",
        "ILIIIISFFSIIIILI",
        "ILIIIISFFSIIIILI",
        "ILIIIEESSEEEIILI",
        "ILIIEEEEEEEEIILI",
        "ILIIIISSSSIIIILI",
        "ILIIIIIIIIIIIILI",
        "ILLLLIIIIIILLLLI",
        "IIIIIIIIIIIIIIII",
        "ILIIIIIIIIIIIILI",
        "IIIIIIIIIIIIIIII",
        "ILLLLLLLLLLLLLLI",
        "DDDDDDDDDDDDDDDD",
        "OOOOOOOOOOOOOOOO",
    ]))
    tiles.append(make_tile([  # 19: marble base
        "IIIIIIIIIIIIIIII",
        "ILIIIIIIIIIIIILI",
        "ILIIIIIIIIIIIILI",
        "ILLLLLLLLLLLLLLI",
        "IIIIIIIIIIIIIIII",
        "ILIIIIIIIIIIIILI",
        "ILIIIIIIIIIIIILI",
        "IIIIIIIIIIIIIIII",
        "ILLLLLLLLLLLLLLI",
        "IIIIIIIIIIIIIIII",
        "ILIIIIIIIIIIIILI",
        "IIIIIIIIIIIIIIII",
        "ILLLLLLLLLLLLLLI",
        "DDDDDDDDDDDDDDDD",
        "DDDDDDDDDDDDDDDD",
        "OOOOOOOOOOOOOOOO",
    ]))

    # Row 4: Decor / Goal (5 tiles: kalasha, diya_0, diya_1, exit_arch_L, exit_arch_R)
    tiles.append(make_tile([  # 20: kalasha
        ".......OO.......",
        "......OSSO......",
        "......OBBO......",
        ".......OO.......",
        ".....OBSSBO.....",
        "....OBBBBBBO....",
        "....OGGGGGGO....",
        ".....OGGGGO.....",
        "....OBBBBBBO....",
        "...OBGGGGGGGO...",
        "...OGGGGGGGGO...",
        "....OGGGGGGO....",
        "....OBBBBBBO....",
        "...OgGGGGGGgO...",
        "..OBBBBBBBBBBO..",
        "..OOOOOOOOOOOO..",
    ]))
    tiles.append(make_tile([  # 21: diya_0
        "................",
        "................",
        ".......f........",
        "......YfY.......",
        "......CFY.......",
        ".......F........",
        "....OBBBBBO.....",
        "...OGGGGGGGGO...",
        "...OggggggggO...",
        "....OBBBBBBO....",
        ".....OOOOOO.....",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 22: diya_1
        "................",
        ".......f........",
        "......fYf.......",
        "......CYF.......",
        ".......Y........",
        ".......F........",
        "....OBBBBBO.....",
        "...OGGGGGGGGO...",
        "...OggggggggO...",
        "....OBBBBBBO....",
        ".....OOOOOO.....",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    tiles.append(make_tile([  # 23: exit arch L
        ".......OOBBBBBBB",
        "......OBBSSSSSSS",
        ".....OBBGGGGGGGG",
        "....OBBGGGGGGGGG",
        "...OBBGg........",
        "..OBBGg.........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OBBG..........",
        "..OOOO..........",
    ]))
    tiles.append(make_tile([  # 24: exit arch R
        "BBBBBBBOO.......",
        "SSSSSSSBBO......",
        "GGGGGGGGBBO.....",
        "GGGGGGGGGBBO....",
        "........gGBBO...",
        ".........gGBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........GBBO..",
        "..........OOOO..",
    ]))

    durations = [200] * 25
    tags = [
        ("stone", 0, 4),
        ("wood_roof", 5, 9),
        ("banner", 10, 14),
        ("sacred", 15, 19),
        ("decor", 20, 24),
    ]
    save_aseprite_sheet("lanka_tiles", tiles, durations, tags, 16, 16, cols=5)


# ─── E. FIRE & IMPACT VFX (16x16) ─────────────────────────────────────────────

def build_fx_fire() -> None:
    frames = []

    # flame_loop (4f)
    flame_grids = [
        [
            ".......f........",
            "......fY........",
            "....C.Yf..C.....",
            "...FY.fY..FY....",
            "..CYfCfYf.CYf...",
            "..FYfYfYfCFYf...",
            ".CFYfYfYfYfYFC..",
            ".FYfYfYfYfYfYF..",
            "CFYfYfYfYfYfYFC.",
            "FYfYfYfYfYfYfYF.",
            "CFYfYfYfYfYfYFC.",
            ".FYfYfYfYfYfYF..",
            ".CFYfYfYfYfYFC..",
            "..CFYfYfYfYFC...",
            "...CFYfYfYFC....",
            "....CCCCCCC.....",
        ],
        [
            "........f.......",
            ".......Yf.......",
            "....C..fY..C....",
            "...Yf..Yf.FY....",
            "..FYfCfYf.CYf...",
            "..CYfYfYfCFYf...",
            ".FYfYfYfYfYfYF..",
            "CFYfYfYfYfYfYFC.",
            "FYfYfYfYfYfYfYF.",
            "CFYfYfYfYfYfYFC.",
            ".FYfYfYfYfYfYF..",
            ".CFYfYfYfYfYFC..",
            "..CFYfYfYfYFC...",
            "...CFYfYfYFC....",
            "....CCCCCCC.....",
            "................",
        ],
        [
            "......f.........",
            "......Yf........",
            "...C..fY...C....",
            "..FY..Yf..Yf....",
            "..CYfCFYf.FYf...",
            ".CFYfYfYfCFYf...",
            ".FYfYfYfYfYfYF..",
            "CFYfYfYfYfYfYFC.",
            "FYfYfYfYfYfYfYF.",
            "CFYfYfYfYfYfYFC.",
            ".FYfYfYfYfYfYF..",
            ".CFYfYfYfYfYFC..",
            "..CFYfYfYfYFC...",
            "...CFYfYfYFC....",
            "....CCCCCCC.....",
            "................",
        ],
        [
            ".......f........",
            "......fY........",
            "...C..Yf...C....",
            "..Yf..fY..FY....",
            "..FYfCfYf.CYf...",
            ".CFYfYfYfCFYf...",
            ".FYfYfYfYfYfYF..",
            "CFYfYfYfYfYfYFC.",
            "FYfYfYfYfYfYfYF.",
            "CFYfYfYfYfYfYFC.",
            ".FYfYfYfYfYfYF..",
            ".CFYfYfYfYfYFC..",
            "..CFYfYfYfYFC...",
            "...CFYfYfYFC....",
            "....CCCCCCC.....",
            "................",
        ],
    ]
    for g in flame_grids:
        frames.append(make_tile(g))

    # ember (2f)
    frames.append(make_tile([
        "................",
        "......Y.........",
        "................",
        "..........f.....",
        "................",
        "...F............",
        "................",
        "........Y.......",
        ".....f..........",
        "................",
        "...........C....",
        "....Y...........",
        "................",
        ".......F........",
        "................",
        "................",
    ]))
    frames.append(make_tile([
        "......f.........",
        "................",
        ".........Y......",
        "................",
        "...Y............",
        "................",
        ".......f........",
        "................",
        "....C...........",
        "..........Y.....",
        "................",
        ".......F........",
        "................",
        "................",
        "................",
        "................",
    ]))

    # whip_slash (3f)
    frames.append(make_tile([
        "......CCCC......",
        "....CCFFFFCC....",
        "...CFYYYYYYFC...",
        "..CFYffffffYFC..",
        ".CFYf......fYFC.",
        ".CYf........fYC.",
        "..C..........C..",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    frames.append(make_tile([
        "....CCCCCCC.....",
        "..CCFFFFFFFCC...",
        ".CFYYYYfYYYYFC..",
        ".CYfff..fffYFC..",
        "CFYf......fYFC..",
        "CYf........fYC..",
        ".C..........C...",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ]))
    frames.append(make_tile([
        ".......CC.......",
        ".....CCFFCC.....",
        "....CFYYYYFC....",
        "...CYf....fYC...",
        "..CF........FC..",
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
    ]))

    # sacred_shield (3f)
    frames.append(make_tile([
        "................",
        "......IIII......",
        "....IIEEEEII....",
        "...IEEEEEEEI....",
        "..IEEIISSIIEEI..",
        "..IEIISSSSIIEI..",
        ".IEEISSSSSSIEEI.",
        ".IEEISSSSSSIEEI.",
        "..IEIISSSSIIEI..",
        "..IEEIISSIIEEI..",
        "...IEEEEEEEI....",
        "....IIEEEEII....",
        "......IIII......",
        "................",
        "................",
        "................",
    ]))
    frames.append(make_tile([
        ".....IIIIII.....",
        "...IIEEEEEEII...",
        "..IEE......EEI..",
        ".IE..IISSII..EI.",
        ".IE.ISSSSSSI.EI.",
        "IE..ISSSSSSI..EI",
        "IE..ISSSSSSI..EI",
        ".IE.ISSSSSSI.EI.",
        ".IE..IISSII..EI.",
        "..IEE......EEI..",
        "...IIEEEEEEII...",
        ".....IIIIII.....",
        "................",
        "................",
        "................",
        "................",
    ]))
    frames.append(make_tile([
        "...IIIIIIIIII...",
        "..IE........EI..",
        ".IE..........EI.",
        "IE............EI",
        "I..............I",
        "I..............I",
        "I..............I",
        "I..............I",
        "IE............EI",
        ".IE..........EI.",
        "..IE........EI..",
        "...IIIIIIIIII...",
        "................",
        "................",
        "................",
        "................",
    ]))

    durations = [80, 80, 80, 80, 100, 100, 60, 60, 60, 100, 100, 100]
    tags = [
        ("flame_loop", 0, 3),
        ("ember", 4, 5),
        ("whip_slash", 6, 8),
        ("sacred_shield", 9, 11),
    ]
    save_aseprite_sheet("fx_fire", frames, durations, tags, 16, 16)


# ─── F. MULTI-LAYER PARALLAX BACKGROUNDS (320x180) ────────────────────────────

BAYER_4X4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]


def build_backgrounds() -> None:
    w, h = 320, 180

    # 1. bg_sky.png: Ordered Bayer dithered indigo gradient + crescent moon + stars
    sky = Image.new("RGBA", (w, h), PALETTE["D"])
    spx = sky.load()
    for y in range(h):
        t = y / h
        for x in range(w):
            b = BAYER_4X4[y % 4][x % 4] / 16.0
            if t < 0.45:
                col = "M" if (t - 0.15) * 3.0 > b else "D"
            elif t < 0.8:
                col = "L" if (t - 0.50) * 3.0 > b else "M"
            else:
                col = "L"
            spx[x, y] = PALETTE[col]

    # Crescent moon in upper-left (cx=48, cy=34)
    for y in range(16, 54):
        for x in range(30, 68):
            d_main = math.hypot(x - 48, y - 34)
            d_cut = math.hypot(x - 54, y - 31)
            if d_main <= 13 and d_cut > 11:
                spx[x, y] = PALETTE["S"] if d_main > 11 else PALETTE["I"]

    # Pixel stars
    stars = [
        (18, 15), (95, 22), (140, 12), (190, 28), (245, 18), (295, 25),
        (75, 50), (125, 42), (175, 16), (220, 48), (270, 38), (310, 12),
        (30, 68), (110, 62), (160, 58), (210, 20), (260, 60), (290, 54),
    ]
    for idx, (sx, sy) in enumerate(stars):
        spx[sx, sy] = PALETTE["S"] if idx % 3 == 0 else PALETTE["I"]

    sky.save(OUT_DIR / "bg_sky.png")

    # 2. bg_mountains.png: Seamless Trikuta peaks + distant spires/gopurams
    mtn = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mpx = mtn.load()
    for x in range(w):
        # Seamless periodic waveform (period = 320)
        ang = (x / w) * 2 * math.pi
        ridge = (
            122
            - 18 * math.sin(ang * 2)
            - 10 * math.cos(ang * 3 + 0.5)
            - 6 * math.sin(ang * 5)
        )
        y_top = int(ridge)
        for y in range(y_top, h):
            if y == y_top:
                mpx[x, y] = PALETTE["L"]
            elif y < y_top + 4 and x % 2 == 0:
                mpx[x, y] = PALETTE["L"]
            else:
                mpx[x, y] = PALETTE["M"]

    # Distant gopuram spires on mountain peaks
    spire_xs = [40, 118, 200, 276]
    for sx in spire_xs:
        base_y = 98
        for tier in range(5):
            tw = 18 - tier * 3
            ty = base_y - tier * 5
            for y in range(ty - 5, ty):
                for dx in range(-tw // 2, tw // 2 + 1):
                    px_x = (sx + dx) % w
                    mpx[px_x, y] = PALETTE["L"] if dx < -tw // 4 or y == ty - 5 else PALETTE["M"]
        # Kalasha tip
        mpx[sx % w, base_y - 26] = PALETTE["G"]
        mpx[sx % w, base_y - 27] = PALETTE["B"]

    mtn.save(OUT_DIR / "bg_mountains.png")

    # 3. bg_palace_mid.png: Seamless golden palace colonnades & lit windows
    pal = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ppx = pal.load()
    # Period = 64px (5 repeats across 320px)
    for x in range(w):
        lx = x % 64
        # Parapet roofline
        roof_y = 128 if (lx < 20 or lx >= 44) else 118
        for y in range(roof_y, h):
            if y == roof_y:
                ppx[x, y] = PALETTE["G"]
            elif y < roof_y + 3:
                ppx[x, y] = PALETTE["g"]
            else:
                ppx[x, y] = PALETTE["D"] if (x % 16 < 2) else PALETTE["M"]

        # Arched warm lit palace windows every 32px
        wx = x % 32
        if 12 <= wx <= 19:
            for y in range(138, 152):
                if y == 138 and (wx == 12 or wx == 19):
                    continue
                ppx[x, y] = PALETTE["G"] if y < 142 else PALETTE["B"]
                if 14 <= wx <= 17 and 141 <= y <= 149:
                    ppx[x, y] = PALETTE["Y"]

        # Battlement merlons
        if lx % 8 < 4 and roof_y == 128:
            for y in range(124, 128):
                ppx[x, y] = PALETTE["g"]

    pal.save(OUT_DIR / "bg_palace_mid.png")


def main() -> None:
    build_hanuman()
    build_rakshasa_guard()
    build_rakshasa_archer()
    build_lanka_tiles()
    build_fx_fire()
    build_backgrounds()
    print(f"Built all art assets in {OUT_DIR}")


if __name__ == "__main__":
    main()

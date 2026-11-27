#!/usr/bin/env python3
"""
scripts/local_visual_judge.py — Gate 2 Zero-API Local Visual Judge.
Evaluates the generated sprites, tileset, and rendered 320x180 scene against
docs/art-refs/ref_gameplay.png and docs/art-refs/ref_tileset.png across 4 criteria (0..10),
emitting strict JSON to stdout and docs/art-refs/last_judge_report.json.
Pure Python stdlib + Pillow only.
"""

from __future__ import annotations

import json
import math
from collections import Counter, deque
from pathlib import Path
from PIL import Image

from palette import (
    MASTER_RGB,
    PALETTE_HEX,
    luminance,
    quantize_to_palette,
)
from verify_revamp import compose_scene_1x, connected_components_4way, frame_diff_ratio

ROOT = Path(__file__).resolve().parent.parent
REFS_DIR = ROOT / "docs" / "art-refs"
ASSETS_DIR = ROOT / "public" / "assets"
SPRITES_DIR = ASSETS_DIR / "sprites"
MAPS_DIR = ASSETS_DIR / "maps"
BG_DIR = ASSETS_DIR / "bg"
REPORT_OUT = REFS_DIR / "last_judge_report.json"

INK_RGB = MASTER_RGB["INK"]
GOLD_RAMPS = {MASTER_RGB["GOLD_DARK"], MASTER_RGB["GOLD_SHADOW"], MASTER_RGB["GOLD_MID"], MASTER_RGB["GOLD_BRIGHT"], MASTER_RGB["GOLD_SPEC"]}
GOLD_BRIGHTS = {MASTER_RGB["GOLD_MID"], MASTER_RGB["GOLD_BRIGHT"], MASTER_RGB["GOLD_SPEC"]}
SKIN_RAMPS = {MASTER_RGB["TIMBER_DARK"], MASTER_RGB["TIMBER_MID"], MASTER_RGB["SAND_MID"], MASTER_RGB["SAND_LIGHT"]}
CRIMSON_RAMPS = {MASTER_RGB["CRIMSON_DARK"], MASTER_RGB["CRIMSON_MID"], MASTER_RGB["CRIMSON_BRIGHT"]}
FIRE_RAMPS = {MASTER_RGB["FIRE_RED"], MASTER_RGB["FIRE_ORANGE"], MASTER_RGB["FIRE_GOLD"], MASTER_RGB["FIRE_CORE"]}
MARBLE_EMERALD = {
    MASTER_RGB["MARBLE_DARK"], MASTER_RGB["MARBLE_MID"], MASTER_RGB["MARBLE_LIGHT"], MASTER_RGB["MARBLE_PURE"],
    MASTER_RGB["ASHOKA_DARK"], MASTER_RGB["ASHOKA_MID"], MASTER_RGB["ASHOKA_LIGHT"],
}
SASH_BLUE_RGB = MASTER_RGB["SASH_BLUE"]

COLOR_GROUP_HEX = {
    "NIGHT": {"#090B17", "#12162E", "#1D2247", "#2E3363", "#4B4A7A"},
    "OCEAN": {"#0E2034", "#1E3A54", "#4B6D8A", "#A9C4DC", "#F2F6FC"},
    "GOLD": {"#4D2812", "#8A4E1D", "#C78028", "#F2B63D", "#FFE680"},
    "SAND": {"#3B2018", "#6E3F2C", "#A66848", "#D69B72"},
    "CRIMSON": {"#5C111B", "#9E1F2A", "#D93D38"},
    "FIRE": {"#D92B1C", "#FF7A18", "#FFD23F", "#FFF9D6"},
    "MARBLE": {"#5E6275", "#9AA1B5", "#D8DDE8", "#FFFFFF"},
    "EMERALD": {"#16382E", "#2B614C", "#4D916E", "#2457A6"},
}

RGB_TO_GROUP: dict[tuple[int, int, int], str] = {}
for grp, hexes in COLOR_GROUP_HEX.items():
    for hx in hexes:
        for k, v in PALETTE_HEX.items():
            if v.upper() == hx.upper():
                RGB_TO_GROUP[MASTER_RGB[k]] = grp


def load_frames(sheet_name: str) -> tuple[Image.Image, dict, list[Image.Image]]:
    im = Image.open(SPRITES_DIR / f"{sheet_name}.png").convert("RGBA")
    data = json.loads((SPRITES_DIR / f"{sheet_name}.json").read_text(encoding="utf-8"))
    frames = []
    for i in range(len(data["frames"])):
        r = data["frames"][f"{sheet_name} {i}.aseprite"]["frame"]
        frames.append(im.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])))
    return im, data, frames


def exterior_outline_ratio(img: Image.Image) -> tuple[float, int, int]:
    """Measure % of exterior boundary pixels that are INK (#090B17)."""
    w, h = img.size
    px = img.load()
    total_boundary = 0
    ink_boundary = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            touches_bg = False
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or nx >= w or ny < 0 or ny >= h or px[nx, ny][3] == 0:
                    touches_bg = True
                    break
            if touches_bg:
                total_boundary += 1
                if (r, g, b) == INK_RGB:
                    ink_boundary += 1
    return ink_boundary / max(1, total_boundary), ink_boundary, total_boundary


def count_orphan_1px_non_fire(img: Image.Image) -> list[tuple[int, int]]:
    px = img.load()
    orphans: list[tuple[int, int]] = []
    for comp in connected_components_4way(img):
        if comp["area"] == 1:
            x, y = comp["pixels"][0]
            if px[x, y][:3] not in FIRE_RAMPS:
                orphans.append((x, y))
    return orphans


def cosine_sim(c1: dict[str, float], c2: dict[str, float]) -> float:
    keys = set(c1) | set(c2)
    dot = sum(c1.get(k, 0.0) * c2.get(k, 0.0) for k in keys)
    n1 = math.sqrt(sum(v * v for v in c1.values()))
    n2 = math.sqrt(sum(v * v for v in c2.values()))
    return dot / max(1e-9, n1 * n2)


def group_histogram(img: Image.Image, y0: int = 0, y1: int | None = None, ignore_ink: bool = True) -> dict[str, float]:
    px = img.load()
    counts: Counter[str] = Counter()
    y_end = y1 if y1 is not None else img.height
    for y in range(y0, y_end):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            rgb = (r, g, b)
            if ignore_ink and rgb == INK_RGB:
                continue
            grp = RGB_TO_GROUP.get(rgb)
            if grp:
                counts[grp] += 1
    tot = sum(counts.values())
    return {k: v / tot for k, v in counts.items()} if tot else {}


def judge_hanuman_identity(
    frames: list[Image.Image], data: dict, defects: list[dict]
) -> float:
    outline_ratios: list[float] = []
    strat_pass = 0
    multitone_pass = 0
    flame_tail_pass = 0

    for i, fr in enumerate(frames):
        ratio, _, _ = exterior_outline_ratio(fr)
        outline_ratios.append(ratio)
        if ratio < 0.85:
            defects.append({
                "target": f"hanuman:frame_{i}",
                "issue": f"Exterior #090B17 outline completeness {ratio:.1%} < 85%",
                "fix": "Ensure apply_ink_outline(g, ink='K') outlines all exterior pixels cleanly without skipping body/tail edges in scripts/revamp_art.py.",
            })

        px = fr.load()
        ys = [y for y in range(fr.height) for x in range(fr.width) if px[x, y][3] > 0]
        if not ys:
            continue
        min_y, max_y = min(ys), max(ys)
        bh = max(1, max_y - min_y + 1)

        gold_used = set()
        skin_used = set()
        fire_used = set()
        has_top_gold = False
        has_mid_skin = False
        has_low_crimson = False
        has_low_blue = False
        fire_pixels_tail = 0

        for y in range(min_y, max_y + 1):
            rel = (y - min_y) / bh
            for x in range(fr.width):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                rgb = (r, g, b)
                if rgb in GOLD_RAMPS:
                    gold_used.add(rgb)
                if rgb in SKIN_RAMPS:
                    skin_used.add(rgb)
                if rgb in FIRE_RAMPS:
                    fire_used.add(rgb)
                    if x <= 19 or x >= 32:
                        fire_pixels_tail += 1
                if rel <= 0.42 and rgb in GOLD_BRIGHTS:
                    has_top_gold = True
                if 0.25 <= rel <= 0.78 and rgb in SKIN_RAMPS:
                    has_mid_skin = True
                if 0.45 <= rel <= 0.90:
                    if rgb in CRIMSON_RAMPS:
                        has_low_crimson = True
                    if rgb == SASH_BLUE_RGB:
                        has_low_blue = True

        if has_top_gold and has_mid_skin and has_low_crimson and has_low_blue:
            strat_pass += 1
        else:
            defects.append({
                "target": f"hanuman:frame_{i}",
                "issue": f"Broken vertical stratification (top_gold={has_top_gold}, mid_skin={has_mid_skin}, low_crimson={has_low_crimson}, low_blue={has_low_blue})",
                "fix": "Ensure HANUMAN_HEAD_MUKUTA and HANUMAN_TORSO_DHOTI stay unoccluded with clear gold crown, skin torso, royal blue sash, and crimson dhoti in scripts/revamp_art.py.",
            })

        if len(gold_used) >= 2 and len(skin_used) >= 2 and len(fire_used) >= 3:
            multitone_pass += 1
        else:
            defects.append({
                "target": f"hanuman:frame_{i}",
                "issue": f"Flat shading (gold_shades={len(gold_used)}, skin_shades={len(skin_used)}, fire_shades={len(fire_used)})",
                "fix": "Use >= 2 gold shades, >= 2 skin shades, and >= 3 fire ramp shades in Hanuman stamps/plumes in scripts/revamp_art.py.",
            })

        if fire_pixels_tail >= 6 and (MASTER_RGB["FIRE_CORE"] in fire_used or MASTER_RGB["FIRE_GOLD"] in fire_used):
            flame_tail_pass += 1
        else:
            defects.append({
                "target": f"hanuman:frame_{i}",
                "issue": f"Weak/missing blazing tail plume (tail_fire_px={fire_pixels_tail})",
                "fix": "Anchor a richer F->O->Y->W flame jet to HANUMAN_TAIL_SPLINES tip in scripts/revamp_art.py.",
            })

    n = max(1, len(frames))
    min_out = min(outline_ratios) if outline_ratios else 0.0
    avg_out = sum(outline_ratios) / n
    s_outline = 3.0 * min(1.0, min_out / 0.90) if min_out >= 0.85 else 1.5 * (avg_out / 0.85)
    s_strat = 2.5 * (strat_pass / n)
    s_tone = 2.5 * (multitone_pass / n)
    s_tail = 2.0 * (flame_tail_pass / n)
    return round(min(10.0, s_outline + s_strat + s_tone + s_tail), 2)


def find_crown_peak(img: Image.Image) -> tuple[int, int] | None:
    px = img.load()
    gold_top = {MASTER_RGB["GOLD_SPEC"], MASTER_RGB["GOLD_BRIGHT"], MASTER_RGB["GOLD_MID"]}
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][3] > 0 and px[x, y][:3] in gold_top:
                return (x, y)
    return None


def judge_cross_frame_consistency(
    h_frames: list[Image.Image], h_data: dict, r_frames: list[Image.Image], r_data: dict, defects: list[dict]
) -> float:
    # 1. Head/crown lock across idle/run/jump/fall/wall_slide
    ref_peak = find_crown_peak(h_frames[0])
    head_matches: list[float] = []
    if ref_peak is not None:
        ref_px = h_frames[0].load()
        check_indices = list(range(16))  # idle(0..3), run(4..9), jump(10..11), fall(12..13), wall_slide(14..15)
        for idx in check_indices:
            pk = find_crown_peak(h_frames[idx])
            if pk is None:
                head_matches.append(0.0)
                continue
            cur_px = h_frames[idx].load()
            same = 0
            total = 0
            for dy in range(0, 8):
                for dx in range(-3, 4):
                    rx, ry = ref_peak[0] + dx, ref_peak[1] + dy
                    cx, cy = pk[0] + dx, pk[1] + dy
                    if 0 <= rx < 48 and 0 <= ry < 32 and 0 <= cx < 48 and 0 <= cy < 32:
                        c0 = ref_px[rx, ry]
                        c1 = cur_px[cx, cy]
                        if c0[3] > 0 or c1[3] > 0:
                            total += 1
                            if c0 == c1:
                                same += 1
            match = same / max(1, total)
            head_matches.append(match)
            if match < 0.85:
                defects.append({
                    "target": f"hanuman:frame_{idx}",
                    "issue": f"Head/mukuta consistency vs idle_0 dropped to {match:.1%} (< 85%)",
                    "fix": "Ensure HANUMAN_HEAD_MUKUTA is stamped last over back arms/tails and without per-frame overrides in scripts/revamp_art.py.",
                })
    avg_head = sum(head_matches) / max(1, len(head_matches))

    # 2. Height jitter check
    h0 = connected_components_4way(h_frames[0])[0]["height"]
    max_h_dev = 0.0
    for idx in range(16):
        ch = connected_components_4way(h_frames[idx])[0]["height"]
        max_h_dev = max(max_h_dev, abs(ch - h0) / max(1, h0))

    # 3. Orphan 1px non-fire pixels
    total_orphans = 0
    for i, fr in enumerate(h_frames):
        orphs = count_orphan_1px_non_fire(fr)
        if orphs:
            total_orphans += len(orphs)
            defects.append({
                "target": f"hanuman:frame_{i}",
                "issue": f"Found {len(orphs)} stray 1px non-fire orphan pixels at {orphs[:3]}",
                "fix": "Connect isolated limb/tail pixels 4-way cleanly in scripts/revamp_art.py.",
            })
    for i, fr in enumerate(r_frames):
        orphs = count_orphan_1px_non_fire(fr)
        if orphs:
            total_orphans += len(orphs)
            defects.append({
                "target": f"rakshasa_guard:frame_{i}",
                "issue": f"Found {len(orphs)} stray 1px non-fire orphan pixels at {orphs[:3]}",
                "fix": "Connect isolated weapon/armor pixels 4-way in build_guard_frame in scripts/revamp_art.py.",
            })

    # 4. Smooth frame delta (3%..45%) across both Hanuman and Rakshasa tags
    smooth_total = 0
    smooth_ok = 0
    for name, frames, data in [("hanuman", h_frames, h_data), ("rakshasa_guard", r_frames, r_data)]:
        for tag in data["meta"]["frameTags"]:
            for i in range(tag["from"], tag["to"]):
                smooth_total += 1
                delta = frame_diff_ratio(frames[i], frames[i + 1])
                if 0.03 <= delta <= 0.45:
                    smooth_ok += 1
                else:
                    defects.append({
                        "target": f"{name}:{tag['name']}_{i - tag['from']}",
                        "issue": f"Consecutive frame delta {delta:.1%} outside smooth [3%, 45%] range",
                        "fix": "Adjust pose offsets or animation deltas for smoother motion in scripts/revamp_art.py.",
                    })

    s_head = 3.5 * min(1.0, avg_head / 0.95)
    s_jitter = 2.5 * max(0.0, 1.0 - max(0.0, max_h_dev - 0.05) / 0.15)
    s_orphan = 2.0 if total_orphans == 0 else max(0.0, 2.0 - 0.5 * total_orphans)
    s_delta = 2.0 * (smooth_ok / max(1, smooth_total))
    return round(min(10.0, s_head + s_jitter + s_orphan + s_delta), 2)


def edge_col(img: Image.Image, x: int) -> list[str]:
    px = img.load()
    cols = []
    for y in range(img.height):
        r, g, b, a = px[x, y]
        if a == 0:
            cols.append(".")
        else:
            cols.append(RGB_TO_GROUP.get((r, g, b), "?"))
    return cols


def tile_fire_and_opaque(tile: Image.Image) -> tuple[float, int]:
    px = tile.load()
    fire = 0
    opaque = 0
    for y in range(tile.height):
        for x in range(tile.width):
            r, g, b, a = px[x, y]
            if a > 0:
                opaque += 1
                if (r, g, b) in FIRE_RAMPS:
                    fire += 1
    return fire / max(1, opaque), opaque


def judge_architecture_and_tiles(defects: list[dict]) -> float:
    tileset = Image.open(MAPS_DIR / "tileset_lanka.png").convert("RGBA")
    ref_tileset = Image.open(REFS_DIR / "ref_tileset.png").convert("RGBA")
    ref_small = quantize_to_palette(ref_tileset.resize((160, 90), Image.Resampling.NEAREST), allow_alpha=False)

    # 1. Palette histogram similarity vs ref_tileset (ignoring dark sky backdrop on ref)
    h_ts = group_histogram(tileset, ignore_ink=True)
    h_ref = group_histogram(ref_small, ignore_ink=True)
    # Remove ref NIGHT background blue dominance when comparing opaque architectural tileset
    h_ts.pop("NIGHT", None)
    h_ref.pop("NIGHT", None)
    sim = cosine_sim(h_ts, h_ref)

    # 2. Horizontal seam continuity: STONE 0->1->2->3, WOOD_NONE 0->1->2
    seam_pairs = [
        ("STONE 0->1", (0, 0), (1, 0)),
        ("STONE 1->2", (1, 0), (2, 0)),
        ("STONE 2->3", (2, 0), (3, 0)),
        ("WOOD_NONE L->M", (0, 1), (1, 1)),
        ("WOOD_NONE M->R", (1, 1), (2, 1)),
    ]
    seam_scores: list[float] = []
    for label, (c0, r0), (c1, r1) in seam_pairs:
        t0 = tileset.crop((c0 * 16, r0 * 16, (c0 + 1) * 16, (r0 + 1) * 16))
        t1 = tileset.crop((c1 * 16, r1 * 16, (c1 + 1) * 16, (r1 + 1) * 16))
        right_edge = edge_col(t0, 15)
        left_edge = edge_col(t1, 0)
        match = sum(1 for a, b in zip(right_edge, left_edge) if a == b) / 16.0
        seam_scores.append(match)
        if match < 0.70:
            defects.append({
                "target": f"tileset_lanka:{label}",
                "issue": f"Horizontal seam row-group match only {match:.1%} (< 70%)",
                "fix": "Align right-edge col 15 of left tile and left-edge col 0 of right tile in build_tileset_lanka() in scripts/revamp_art.py.",
            })
    avg_seam = sum(seam_scores) / max(1, len(seam_scores))

    # 3. Progressive fire readability (WOOD NONE < IGNITING < BURNING & COLLAPSED breakdown)
    wood_stats = []
    for st_idx in range(4):
        fire_sum = 0.0
        op_sum = 0
        for p_idx in range(3):
            col = st_idx * 3 + p_idx
            t = tileset.crop((col * 16, 16, (col + 1) * 16, 32))
            fr, op = tile_fire_and_opaque(t)
            fire_sum += fr
            op_sum += op
        wood_stats.append((fire_sum / 3.0, op_sum / 3.0))

    fire_ok = (
        wood_stats[0][0] < wood_stats[1][0] < wood_stats[2][0]
        and wood_stats[2][0] >= 0.25
        and wood_stats[3][1] <= 0.45 * wood_stats[0][1]
    )
    if not fire_ok:
        defects.append({
            "target": "tileset_lanka:WOOD_ROOF",
            "issue": f"Fire progression/collapse ratios invalid: NONE={wood_stats[0]}, IGN={wood_stats[1]}, BURN={wood_stats[2]}, COLL={wood_stats[3]}",
            "fix": "Ensure NONE < IGNITING < BURNING fire pixel ratios and COLLAPSED <= 45% opaque pixels of NONE in scripts/revamp_art.py.",
        })

    # 4. Sacred cool-tone dominance (>= 50% marble/emerald in row 3 cols 0..7)
    sacred_total = 0
    sacred_cool = 0
    px = tileset.load()
    for y in range(48, 64):
        for x in range(0, 128):
            r, g, b, a = px[x, y]
            if a == 0 or (r, g, b) == INK_RGB:
                continue
            sacred_total += 1
            if (r, g, b) in MARBLE_EMERALD:
                sacred_cool += 1
    cool_ratio = sacred_cool / max(1, sacred_total)
    if cool_ratio < 0.50:
        defects.append({
            "target": "tileset_lanka:SACRED",
            "issue": f"SACRED cool-marble/emerald dominance {cool_ratio:.1%} < 50%",
            "fix": "Increase marble/emerald tile coverage in row 3 of build_tileset_lanka() in scripts/revamp_art.py.",
        })

    s_hist = 3.0 * min(1.0, sim / 0.85)
    s_seam = 2.5 * min(1.0, avg_seam / 0.88)
    s_fire = 2.5 if fire_ok else 0.5
    s_sacred = 2.0 * min(1.0, cool_ratio / 0.70) if cool_ratio >= 0.50 else 0.5
    return round(min(10.0, s_hist + s_seam + s_fire + s_sacred), 2)


def region_stats(img: Image.Image, y0: int, y1: int) -> tuple[float, float]:
    px = img.load()
    tot = 0.0
    mx = 0.0
    cnt = 0
    for y in range(y0, y1):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = luminance((r, g, b))
            tot += lum
            mx = max(mx, lum)
            cnt += 1
    return tot / max(1, cnt), mx


def judge_scene_composition(
    bgs: dict[str, Image.Image],
    tileset: Image.Image,
    props_img: Image.Image, props_data: dict,
    h_img: Image.Image, h_data: dict,
    g_img: Image.Image, g_data: dict,
    fx_img: Image.Image, fx_data: dict,
    defects: list[dict],
) -> float:
    scene = compose_scene_1x(
        bgs, tileset, props_img, props_data, h_img, h_data, g_img, g_data, fx_img, fx_data
    )
    ref_gp = Image.open(REFS_DIR / "ref_gameplay.png").convert("RGBA")
    ref_small = quantize_to_palette(ref_gp.resize((320, 180), Image.Resampling.NEAREST), allow_alpha=False)

    # 3-band distribution similarity vs ref_gameplay.png
    sky_sim = cosine_sim(group_histogram(scene, 0, 65, ignore_ink=False), group_histogram(ref_small, 0, 65, ignore_ink=False))
    mid_sim = cosine_sim(group_histogram(scene, 65, 128, ignore_ink=False), group_histogram(ref_small, 65, 128, ignore_ink=False))
    fg_sim = cosine_sim(group_histogram(scene, 128, 180, ignore_ink=False), group_histogram(ref_small, 128, 180, ignore_ink=False))
    band_sim = (sky_sim + mid_sim + fg_sim) / 3.0

    sky_mean, _ = region_stats(scene, 0, 60)
    _, fg_peak = region_stats(scene, 120, 180)
    if sky_mean >= 45:
        defects.append({
            "target": "scene:sky_band",
            "issue": f"Sky mean luminance {sky_mean:.1f} >= 45",
            "fix": "Darken bg_sky.png / bg_far_spires.png top bands in scripts/revamp_art.py.",
        })
    if fg_peak <= 180:
        defects.append({
            "target": "scene:foreground",
            "issue": f"Foreground peak luminance {fg_peak:.1f} <= 180",
            "fix": "Ensure golden roofs/fire cores retain #FFE680 / #FFF9D6 highlights in scripts/revamp_art.py.",
        })

    # Hanuman foreground pop against background immediately behind him at (104, 82)
    hx, hy = 104, 82
    bg_only = Image.new("RGBA", (320, 180), (9, 11, 23, 255))
    bg_only.paste(bgs["bg_sky.png"], (0, 0), bgs["bg_sky.png"])
    bg_only.paste(bgs["bg_far_spires.png"], (0, 0), bgs["bg_far_spires.png"])
    bg_only.paste(bgs["bg_mid_palace.png"], (0, 0), bgs["bg_mid_palace.png"])

    r = h_data["frames"]["hanuman 10.aseprite"]["frame"]
    han_crop = h_img.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
    hp = han_crop.load()
    bp = bg_only.load()
    han_lums = []
    bg_lums = []
    for y in range(han_crop.height):
        for x in range(han_crop.width):
            pr, pg, pb, pa = hp[x, y]
            if pa > 0 and (pr, pg, pb) != INK_RGB:
                han_lums.append(luminance((pr, pg, pb)))
                br, bgc, bb, _ = bp[hx + x, hy + y]
                bg_lums.append(luminance((br, bgc, bb)))

    mean_han = sum(han_lums) / max(1, len(han_lums))
    mean_bg = sum(bg_lums) / max(1, len(bg_lums))
    contrast = abs(mean_han - mean_bg)
    if contrast < 45:
        defects.append({
            "target": "scene:hanuman_contrast",
            "issue": f"Hanuman vs backdrop contrast {contrast:.1f} < 45 (han={mean_han:.1f}, bg={mean_bg:.1f})",
            "fix": "Brighten Hanuman gold/skin/fire highlights or darken bg_mid_palace behind upper sky in scripts/revamp_art.py.",
        })

    s_bands = 5.0 * min(1.0, band_sim / 0.85)
    s_contrast = 5.0 * min(1.0, contrast / 80.0) if contrast >= 45 else 2.0 * (contrast / 45.0)
    return round(min(10.0, s_bands + s_contrast), 2)


def main() -> int:
    defects: list[dict] = []
    h_img, h_data, h_frames = load_frames("hanuman")
    r_img, r_data, r_frames = load_frames("rakshasa_guard")
    p_img, p_data, _ = load_frames("props_lanka")
    f_img, f_data, _ = load_frames("fx_fire")
    tileset = Image.open(MAPS_DIR / "tileset_lanka.png").convert("RGBA")
    bgs = {
        name: Image.open(BG_DIR / name).convert("RGBA")
        for name in ("bg_title_lanka.png", "bg_sky.png", "bg_far_spires.png", "bg_mid_palace.png")
    }

    s_identity = judge_hanuman_identity(h_frames, h_data, defects)
    s_consistency = judge_cross_frame_consistency(h_frames, h_data, r_frames, r_data, defects)
    s_arch = judge_architecture_and_tiles(defects)
    s_scene = judge_scene_composition(bgs, tileset, p_img, p_data, h_img, h_data, r_img, r_data, f_img, f_data, defects)

    scores = {
        "hanuman_identity": s_identity,
        "cross_frame_consistency": s_consistency,
        "architecture_and_tiles": s_arch,
        "scene_composition_and_contrast": s_scene,
    }
    avg = sum(scores.values()) / 4.0
    overall_pass = (
        len(defects) == 0
        and min(scores.values()) >= 8.0
        and avg >= 8.5
    )

    report = {
        "scores": scores,
        "overall_pass": overall_pass,
        "blocking_defects": defects[:25],
    }

    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

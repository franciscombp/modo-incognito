#!/usr/bin/env python3
"""Generate placeholder pixel-art character sprite sheets.

These stand in for the real artist-drawn sprites: same dimensions, same
frame layout, same palette family as the reference sheet (mauve sweater,
dark navy skirt, dusty-pink bob, brown boots), so swapping in the final
art is a straight file replacement with no code changes.

Sheet layout — 4 columns x 4 rows, each cell FRAME_W x FRAME_H:
    row 0: walk south (facing the camera)
    row 1: walk west  (facing left)
    row 2: walk east  (facing right)
    row 3: walk north (facing away)
Column 0 of every row doubles as that direction's idle pose.

Written with the stdlib only (zlib + struct) so it runs anywhere without
Pillow or node-canvas.
"""

import os
import struct
import zlib

FRAME_W, FRAME_H = 32, 44
COLS, ROWS = 4, 4

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "sprites")


# --------------------------------------------------------------------------
# Minimal PNG writer (RGBA, 8-bit, no interlace)
# --------------------------------------------------------------------------
def write_png(path, width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        row = pixels[y]
        for x in range(width):
            raw.extend(row[x])

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


# --------------------------------------------------------------------------
# Tiny drawing surface
# --------------------------------------------------------------------------
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[(0, 0, 0, 0)] * w for _ in range(h)]

    def set(self, x, y, color):
        if color is None:
            return
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = color

    def rect(self, x, y, w, h, color):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, color)

    def hline(self, x0, x1, y, color):
        for x in range(x0, x1 + 1):
            self.set(x, y, color)

    def blit(self, dst, ox, oy):
        for y in range(self.h):
            for x in range(self.w):
                c = self.px[y][x]
                if c[3]:
                    dst.set(ox + x, oy + y, c)


# --------------------------------------------------------------------------
# Palettes. Every character shares one silhouette; only the colors change,
# which is exactly how the final sheets are expected to be authored.
# --------------------------------------------------------------------------
def shade(color, factor):
    r, g, b, a = color
    return (int(r * factor), int(g * factor), int(b * factor), a)


def palette(skin, skin_sh, hair, hair_sh, top, top_sh, bottom, bottom_sh, shoe, legs):
    return {
        "skin": skin,
        "skin_sh": skin_sh,
        "hair": hair,
        "hair_sh": hair_sh,
        "top": top,
        "top_sh": top_sh,
        "bottom": bottom,
        "bottom_sh": bottom_sh,
        "shoe": shoe,
        "legs": legs,
        "line": (26, 22, 28, 255),
        "eye": (38, 30, 36, 255),
    }


PLAYER = palette(
    skin=(233, 196, 174, 255),
    skin_sh=(198, 158, 139, 255),
    hair=(176, 144, 152, 255),
    hair_sh=(133, 106, 116, 255),
    top=(138, 95, 102, 255),
    top_sh=(105, 70, 78, 255),
    bottom=(46, 50, 68, 255),
    bottom_sh=(33, 36, 51, 255),
    shoe=(107, 69, 48, 255),
    legs=(30, 30, 40, 255),
)

BOSS = palette(
    skin=(217, 173, 130, 255),
    skin_sh=(178, 137, 100, 255),
    hair=(58, 48, 44, 255),
    hair_sh=(38, 31, 29, 255),
    top=(38, 41, 50, 255),
    top_sh=(26, 28, 35, 255),
    bottom=(31, 33, 41, 255),
    bottom_sh=(22, 24, 30, 255),
    shoe=(24, 22, 26, 255),
    legs=(31, 33, 41, 255),
)

NPC_PALETTES = [
    palette(
        skin=(230, 190, 160, 255), skin_sh=(192, 152, 124, 255),
        hair=(92, 66, 52, 255), hair_sh=(64, 45, 35, 255),
        top=(224, 114, 44, 255), top_sh=(178, 86, 30, 255),
        bottom=(58, 63, 74, 255), bottom_sh=(42, 46, 55, 255),
        shoe=(46, 40, 38, 255), legs=(58, 63, 74, 255),
    ),
    palette(
        skin=(198, 152, 120, 255), skin_sh=(160, 118, 92, 255),
        hair=(40, 34, 32, 255), hair_sh=(26, 22, 21, 255),
        top=(91, 155, 213, 255), top_sh=(64, 118, 170, 255),
        bottom=(52, 56, 66, 255), bottom_sh=(38, 41, 49, 255),
        shoe=(40, 36, 34, 255), legs=(52, 56, 66, 255),
    ),
    palette(
        skin=(242, 208, 186, 255), skin_sh=(206, 170, 150, 255),
        hair=(206, 168, 92, 255), hair_sh=(160, 126, 62, 255),
        top=(111, 191, 115, 255), top_sh=(78, 148, 84, 255),
        bottom=(48, 52, 62, 255), bottom_sh=(35, 38, 46, 255),
        shoe=(74, 56, 44, 255), legs=(48, 52, 62, 255),
    ),
    palette(
        skin=(214, 168, 140, 255), skin_sh=(176, 132, 108, 255),
        hair=(120, 82, 96, 255), hair_sh=(88, 58, 70, 255),
        top=(217, 70, 59, 255), top_sh=(170, 50, 43, 255),
        bottom=(45, 48, 58, 255), bottom_sh=(33, 35, 43, 255),
        shoe=(52, 42, 38, 255), legs=(45, 48, 58, 255),
    ),
]


# --------------------------------------------------------------------------
# Character drawing. `phase` drives the 4-frame walk cycle:
#   0 = contact (legs apart), 1 = passing, 2 = contact mirrored, 3 = passing
# --------------------------------------------------------------------------
def walk_pose(phase):
    """Per-phase (stride, bob, arm swing) for the 4-frame cycle.

    stride is how far the leading leg is thrown forward (profile views) or
    how much the lifted leg shortens (front/back views); bob raises the
    whole body by a pixel on the two passing frames.
    """
    return [(3, 0, 1), (0, -1, 0), (-3, 0, -1), (0, -1, 0)][phase]


def draw_head(c, p, cx, top, facing):
    """Chin-length bob. 11px wide, 13px tall, drawn from `top` downwards."""
    hair, hair_sh = p["hair"], p["hair_sh"]

    halves = [3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6]
    for dy, half in enumerate(halves):
        col = hair if dy < 10 else hair_sh
        c.hline(cx - half, cx + half - 1, top + dy, col)

    if facing == "north":
        # Back of the head: no face, just a shaded nape under the bob.
        c.rect(cx - 3, top + 8, 7, 3, hair_sh)
        return

    if facing == "south":
        c.rect(cx - 3, top + 4, 7, 6, p["skin"])       # face
        c.hline(cx - 3, cx + 3, top + 9, p["skin_sh"])  # jaw shading
        c.rect(cx - 4, top + 3, 9, 2, hair)             # bangs
        c.set(cx - 2, top + 6, p["eye"])
        c.set(cx + 2, top + 6, p["eye"])
        c.set(cx, top + 8, p["skin_sh"])                # mouth
        return

    # Profile: face on the leading side, hair sweeping back behind it.
    lead = 1 if facing == "east" else -1
    x0 = cx - 1 if lead > 0 else cx - 4
    c.rect(x0, top + 4, 5, 6, p["skin"])
    c.hline(x0, x0 + 4, top + 9, p["skin_sh"])
    c.rect(x0, top + 3, 5, 2, hair)                     # bangs
    c.set(cx + 2 * lead, top + 6, p["eye"])
    c.set(cx + 4 * lead, top + 6, p["skin"])            # nose bump
    c.rect(cx - 5 if lead > 0 else cx + 1, top + 4, 4, 9, hair)  # hair behind


def draw_character(p, facing, phase):
    c = Canvas(FRAME_W, FRAME_H)
    cx = FRAME_W // 2
    stride, bob, arm = walk_pose(phase)

    profile = facing in ("west", "east")
    lead = 1 if facing == "east" else -1

    ground = 41
    # Contact shadow, so the sprite sits on the isometric floor instead of
    # floating over it.
    for dx in range(-6, 7):
        a = 105 - abs(dx) * 15
        if a > 0:
            c.set(cx + dx, ground, (0, 0, 0, a))
            if abs(dx) <= 3:
                c.set(cx + dx, ground + 1, (0, 0, 0, a // 2))

    head_top = 3 + bob
    torso_top = 17 + bob
    hip_y = 26 + bob
    skirt_h = 6
    hem_y = hip_y + skirt_h
    boot_h = 4
    boot_y = ground - boot_h

    # ---------------- Legs (drawn before the skirt, which overlaps them) --
    if profile:
        # Legs swing fore/aft; the trailing one is shaded to sit behind.
        far = shade(p["legs"], 0.6)
        far_shoe = shade(p["shoe"], 0.6)
        for dx, leg_col, shoe_col in (
            (-stride * lead, far, far_shoe),
            (stride * lead, p["legs"], p["shoe"]),
        ):
            lx = cx + dx - 2
            c.rect(lx, hem_y, 4, boot_y - hem_y, leg_col)
            c.rect(lx - 1, boot_y, 5, boot_h, shoe_col)
    else:
        # Front/back: one leg lifts on the contact frames.
        lift_left = boot_h - 1 if phase == 0 else 0
        lift_right = boot_h - 1 if phase == 2 else 0
        for lx, lift in ((cx - 4, lift_left), (cx + 1, lift_right)):
            c.rect(lx, hem_y, 3, boot_y - hem_y - lift, p["legs"])
            c.rect(lx - 1, boot_y - lift, 5, boot_h, p["shoe"])

    # ---------------- Skirt: flared trapezoid -----------------------------
    base_half = 4 if profile else 5
    for i in range(skirt_h):
        half = base_half + i // 2
        col = p["bottom"] if i < skirt_h - 2 else p["bottom_sh"]
        c.hline(cx - half, cx + half - 1, hip_y + i, col)

    # ---------------- Torso / sweater -------------------------------------
    torso_half = 4 if profile else 5
    tx = cx - torso_half + (lead if profile else 0)
    c.rect(tx, torso_top, torso_half * 2, hip_y - torso_top, p["top"])
    c.hline(tx, tx + torso_half * 2 - 1, hip_y - 1, p["top_sh"])

    # ---------------- Arms: swing opposite the legs -----------------------
    if profile:
        ax = cx + (torso_half - 1) * lead + (arm * lead)
        c.rect(ax, torso_top + 1, 2, 7, p["top_sh"])
        c.rect(ax, torso_top + 8, 2, 2, p["skin"])
    else:
        for side, swing in ((-1, arm), (1, -arm)):
            ax = cx + side * (torso_half + 1) - (0 if side > 0 else 1)
            c.rect(ax, torso_top + 1 + swing, 2, 7, p["top_sh"])
            c.rect(ax, torso_top + 8 + swing, 2, 2, p["skin"])

    # ---------------- Neck + head -----------------------------------------
    c.rect(cx - 1, torso_top - 2, 3, 2, p["skin_sh"])
    draw_head(c, p, cx, head_top, facing)

    return c



def build_sheet(p):
    sheet = Canvas(FRAME_W * COLS, FRAME_H * ROWS)
    for row, facing in enumerate(("south", "west", "east", "north")):
        for col in range(COLS):
            frame = draw_character(p, facing, col)
            frame.blit(sheet, col * FRAME_W, row * FRAME_H)
    return sheet


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    sheets = {"employee": PLAYER, "boss": BOSS}
    for i, npc in enumerate(NPC_PALETTES):
        sheets[f"npc{i + 1}"] = npc

    for name, p in sheets.items():
        sheet = build_sheet(p)
        path = os.path.join(OUT_DIR, f"{name}.png")
        write_png(path, sheet.w, sheet.h, sheet.px)
        print(f"wrote {path} ({sheet.w}x{sheet.h})")


if __name__ == "__main__":
    main()

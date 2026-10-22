"""
make_icons.py: draws the home-screen icons from Christon the Cleric's
pixel sprite (the same one in js/sprite.js). Plain Python, no extra
packages. Run it again only if you change the sprite or colors:

    python tools/make_icons.py
"""

import os
import struct
import zlib

SPRITE = [
    ".....hhhhh...gg.", "....hhhhhhh.gWWg", "....hhssssh..gg.", "...hhsesesh..w..",
    "...hhssssss..w..", "...hh.ssss...w..", "....rrggrr...w..", "...rrrggrrr.sw..",
    "..rrrrggrrrrsw..", "..srrrggrrr..w..", "...rrrggrrr..w..", "...rrRggRrr..w..",
    "..rrrRggRrrr.w..", "..rrRRggRRrr.w..", ".rrrRRggRRrrrw..", "..kk.....kk..w..",
]
PALETTE = {"h": "#5a3524", "s": "#e9b98f", "e": "#2a1d2e", "r": "#9b4aa1", "R": "#6a2c70",
           "g": "#e6c36e", "W": "#fff6d8", "w": "#8b5a2b", "k": "#3a2a3f"}
OUTLINE = "#0d0b12"
BACKGROUND = "#1e1a29"   # the app's card color
GLOW = "#292338"         # a soft square behind the hero

ICON_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))


def sprite_with_outline():
    """The 16x16 sprite on an 18x18 grid, with a dark outline around it."""
    grid = [[None] * 18 for _ in range(18)]
    solid = lambda x, y: 0 <= x < 16 and 0 <= y < 16 and SPRITE[y][x] != "."
    for y in range(-1, 17):
        for x in range(-1, 17):
            if solid(x, y):
                grid[y + 1][x + 1] = PALETTE[SPRITE[y][x]]
            elif any(solid(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                grid[y + 1][x + 1] = OUTLINE
    return grid


def draw_icon(size, hero_share):
    """A square icon with the hero centered, taking up `hero_share` of the height."""
    scale = int(size * hero_share / 18)
    hero = sprite_with_outline()
    left = (size - 18 * scale) // 2
    top = (size - 18 * scale) // 2
    glow_pad = scale * 2
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            color = BACKGROUND
            if left - glow_pad <= x < left + 18 * scale + glow_pad and top - glow_pad <= y < top + 18 * scale + glow_pad:
                color = GLOW
            gx, gy = (x - left) // scale, (y - top) // scale
            if 0 <= gx < 18 and 0 <= gy < 18 and x >= left and y >= top and hero[gy][gx]:
                color = hero[gy][gx]
            row.append(rgb(color))
        pixels.append(row)
    return pixels


def write_png(path, pixels):
    """Write RGB pixels as a PNG file."""
    height, width = len(pixels), len(pixels[0])
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in pixels)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    # Maskable icons get cropped to a circle or squircle, so the hero stays in the middle 60%.
    for name, size, share in (("icon-192.png", 192, 0.75), ("icon-512.png", 512, 0.75), ("maskable-512.png", 512, 0.55)):
        write_png(os.path.join(ICON_DIR, name), draw_icon(size, share))
        print("Saved", os.path.join(ICON_DIR, name))


if __name__ == "__main__":
    main()

"""Generate Miro's application icons.

Miro's identity: a deep ink squircle holding three ember voice bars that resolve
into a single text caret - "speech becomes text". Rendering is deterministic, so
re-running this script reproduces byte-comparable artwork on any machine.

Usage:  python scripts/generate-icons.py
Requires Pillow (pip install pillow).
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

INK = (22, 24, 29, 255)  # #16181D
EMBER = (255, 77, 46, 255)  # #FF4D2E
PAPER = (237, 238, 240, 255)  # #EDEEF0

MASTER = 1024
SUPERSAMPLE = 4
# Tauri reads its bundle icons from the crate directory, so this is where the
# generated artwork lives.
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "icons"
)


def rounded_bar(draw: ImageDraw.ImageDraw, cx: float, cy: float, w: float, h: float, fill) -> None:
    r = w / 2.0
    draw.rounded_rectangle([cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0], radius=r, fill=fill)


def render_master() -> Image.Image:
    s = MASTER * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Squircle plate, inset so the mark keeps a margin on every surface.
    inset = 0.055 * s
    d.rounded_rectangle([inset, inset, s - inset, s - inset], radius=0.225 * s, fill=INK)

    # Glyph geometry, expressed as fractions of the canvas so every size matches.
    bar_w = 0.075 * s
    gap = 0.055 * s
    caret_gap = 0.075 * s
    glyph_h = 0.52 * s
    heights = (0.40, 0.92, 0.58)
    total_w = 3 * bar_w + 2 * gap + caret_gap + bar_w
    x = (s - total_w) / 2.0
    cy = s / 2.0

    for h_frac in heights:
        rounded_bar(d, x + bar_w / 2.0, cy, bar_w, glyph_h * h_frac, EMBER)
        x += bar_w + gap

    x += caret_gap - gap
    rounded_bar(d, x + bar_w / 2.0, cy, bar_w, glyph_h * 0.92, PAPER)

    return img.resize((MASTER, MASTER), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    master = render_master()

    master.save(os.path.join(OUT_DIR, "icon.png"))
    for size, name in ((32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")):
        master.resize((size, size), Image.LANCZOS).save(os.path.join(OUT_DIR, name))

    # Windows tray icons are tiny and rendered on both light and dark taskbars,
    # so the tray mark is written at the sizes Windows actually asks for.
    master.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT_DIR, "tray.png"))
    master.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT_DIR, "tray@2x.png"))

    master.resize((256, 256), Image.LANCZOS).save(
        os.path.join(OUT_DIR, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"icons written to {OUT_DIR}")


if __name__ == "__main__":
    main()

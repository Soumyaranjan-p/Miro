"""Generate Miro's application icons.

The identity is Miro's mascot avatar: a cap, a gold chain and a round black
gloss orb. The source artwork lives in the repo (scripts/icon-source.webp) so
regeneration is deterministic on any machine - no network fetch involved.

Usage:  python scripts/generate-icons.py
Requires Pillow (pip install pillow).
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

MASTER = 1024
# The avatar, committed next to this script. Any webp/png/jpg works; the
# preferred source is the mascot portrait.
SOURCE = Path(__file__).with_name("icon-source.webp")
# Tauri reads its bundle icons from the crate directory, so this is where the
# generated artwork lives.
OUT_DIR = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
# The webview surfaces brand them too: the settings window favicon and the
# header avatar both come from here.
PUBLIC_DIR = Path(__file__).resolve().parent.parent / "public"


def load_master() -> Image.Image:
    """Center-crops the source to a square, then scales it to MASTER."""
    src = Image.open(SOURCE).convert("RGBA")
    width, height = src.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    cropped = src.crop((left, top, left + side, top + side))
    return cropped.resize((MASTER, MASTER), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = load_master()

    master.save(OUT_DIR / "icon.png")
    for size, name in ((32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")):
        master.resize((size, size), Image.LANCZOS).save(OUT_DIR / name)

    # Windows tray icons are tiny and rendered on both light and dark taskbars,
    # so the tray mark is written at the sizes Windows actually asks for.
    master.resize((32, 32), Image.LANCZOS).save(OUT_DIR / "tray.png")
    master.resize((64, 64), Image.LANCZOS).save(OUT_DIR / "tray@2x.png")

    master.resize((256, 256), Image.LANCZOS).save(
        OUT_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # Webview surfaces: favicon for the settings window and the header avatar.
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    master.resize((128, 128), Image.LANCZOS).save(PUBLIC_DIR / "logo.png")
    master.resize((32, 32), Image.LANCZOS).save(PUBLIC_DIR / "favicon.png")

    print(f"icons written to {OUT_DIR}")
    print(f"web assets written to {PUBLIC_DIR}")


if __name__ == "__main__":
    main()

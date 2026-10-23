import { createFoxRenderer, drawFox } from "./lib/fox/draw";

/**
 * Renders one large, deterministic frame of Miro's fox for the icon
 * pipeline. scripts/generate-icons.py screenshots this page through a
 * headless browser (transparent background) and turns it into the
 * application icons, so the artwork must fill the window and never depend
 * on wall-clock time.
 */

const SIZE = Math.max(256, typeof window === "undefined" ? 1024 : window.innerWidth);
const canvas = document.createElement("canvas");
canvas.width = SIZE;
canvas.height = SIZE;
canvas.style.width = `${SIZE}px`;
canvas.style.height = `${SIZE}px`;
document.body.appendChild(canvas);

const ctx = canvas.getContext("2d");
if (ctx) {
  drawFox(
    ctx,
    {
      t: 2.4,
      state: "normal",
      level: 0,
      gazeX: 0,
      gazeY: 0,
      width: SIZE,
      height: SIZE,
      reducedMotion: true,
    },
    createFoxRenderer(),
  );
}

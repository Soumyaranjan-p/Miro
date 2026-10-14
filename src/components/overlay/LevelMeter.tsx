import { useEffect, useRef } from "react";
import { useReducedMotion } from "../../lib/hooks";

interface LevelMeterProps {
  /** Rolling levels, newest last, each 0..1. */
  frames: number[];
  height?: number;
  /** Ember while recording, neutral while processing or probing. */
  tone?: "accent" | "muted" | "danger";
  className?: string;
}

const BAR_WIDTH = 3;
const BAR_GAP = 2;

/**
 * The overlay's waveform. Drawn on a canvas so 40+ bars can move at 60 fps
 * without thrashing React; the shape comes from the RMS levels the audio
 * thread publishes, never from audio itself.
 */
export function LevelMeter({ frames, height = 40, tone = "accent", className }: LevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef(frames);
  const reduced = useReducedMotion();
  framesRef.current = frames;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let raf = 0;
    let disposed = false;

    const draw = () => {
      if (disposed) return;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth || 200;
      const cssHeight = canvas.clientHeight || height;
      if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);

      const styles = getComputedStyle(document.documentElement);
      const color =
        tone === "accent"
          ? styles.getPropertyValue("--miro-accent").trim() || "#ff4d2e"
          : tone === "danger"
            ? styles.getPropertyValue("--miro-danger").trim() || "#cc2b20"
            : styles.getPropertyValue("--miro-line-strong").trim() || "#d3d3d8";

      const centre = cssHeight / 2;
      const count = Math.max(1, Math.floor(cssWidth / (BAR_WIDTH + BAR_GAP)));
      const levels = framesRef.current;
      const usable = Math.min(count, levels.length);
      const offset = (cssWidth - (count * (BAR_WIDTH + BAR_GAP) - BAR_GAP)) / 2;

      // In reduced-motion mode the meter becomes a single steady level line.
      const flat = reduced ? levels[levels.length - 1] ?? 0 : null;

      context.fillStyle = color;
      for (let i = 0; i < count; i += 1) {
        const index = levels.length - usable + i;
        const raw = flat !== null ? flat : index >= 0 ? levels[index] ?? 0 : 0;
        // Minuscule idle floor keeps the meter recognisably "listening".
        const amplitude = Math.max(0.06, Math.min(1, raw)) * (cssHeight / 2 - 3);
        const x = offset + i * (BAR_WIDTH + BAR_GAP);
        const radius = BAR_WIDTH / 2;
        const top = centre - amplitude;
        const bottom = centre + amplitude;
        context.beginPath();
        context.roundRect(x, top, BAR_WIDTH, Math.max(BAR_WIDTH, bottom - top), radius);
        context.fill();
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
    };
  }, [height, tone, reduced]);

  return <canvas ref={canvasRef} className={className} style={{ height, width: "100%", display: "block" }} />;
}

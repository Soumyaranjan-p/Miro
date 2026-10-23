import { useEffect, useRef } from "react";
import {
  createFoxRenderer,
  drawFox,
  type FoxParams,
  type FoxState,
} from "../../lib/fox/draw";

export type { FoxState };

/**
 * A canvas that keeps Miro's fox alive: breathing, blinking, gaze and the
 * state pose from `draw.ts`. One requestAnimationFrame loop per canvas, which
 * is fine for the handful this app renders, and the loop itself is reclaimed
 * when the component unmounts or becomes tab-hidden.
 */
export function LiveFox({
  size,
  state,
  level = 0,
  trackMouse = false,
  reducedMotion = false,
  className,
  label = "Miro",
}: {
  /** CSS width/height in px. */
  size: number;
  state: FoxState;
  /** Mic level 0..1 while listening. */
  level?: number;
  /** Follow the pointer with the eyes (the hero fox). */
  trackMouse?: boolean;
  reducedMotion?: boolean;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef(createFoxRenderer());
  const stateRef = useRef({ state, level, trackMouse, reducedMotion });
  stateRef.current = { state, level, trackMouse, reducedMotion };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Track the pointer through a ref so the mousemove listener never
    // re-subscribes.
    let gazeTarget = { x: 0, y: 0 };
    let running = true;

    const onPoke = () => {
      // A click squishes the whole body for POKE_SECONDS; anything in flight
      // just resets the clock.
      rendererRef.current.poke = 0.65;
    };
    canvas.addEventListener("pointerdown", onPoke);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const reach = Math.max(rect.width, rect.height) * 1.4;
      gazeTarget = {
        x: (event.clientX - cx) / reach,
        y: (event.clientY - cy) / reach,
      };
    };
    if (trackMouse) window.addEventListener("pointermove", onMove);

    const ctx = canvas.getContext("2d");
    // Only a broken environment has no 2d context; then we show nothing but
    // the label survives through aria.
    if (ctx) {
      let raf = 0;
      const frameStart = performance.now();
      const render = (now: number) => {
        if (!running) return;
        const c = stateRef.current;
        const params: FoxParams = {
          t: (now - frameStart) / 1000,
          state: c.state,
          level: c.level,
          gazeX: gazeTarget.x,
          gazeY: gazeTarget.y,
          width: canvas.width,
          height: canvas.height,
          reducedMotion: c.reducedMotion,
        };
        drawFox(ctx, params, rendererRef.current);
        raf = window.requestAnimationFrame(render);
      };
      raf = window.requestAnimationFrame(render);

      const onVisibility = () => {
        if (document.hidden) {
          window.cancelAnimationFrame(raf);
          raf = 0;
        } else if (raf === 0) {
          raf = window.requestAnimationFrame(render);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        running = false;
        window.cancelAnimationFrame(raf);
        canvas.removeEventListener("pointerdown", onPoke);
        document.removeEventListener("visibilitychange", onVisibility);
        observer.disconnect();
        if (trackMouse) window.removeEventListener("pointermove", onMove);
      };
    }

    return () => {
      observer.disconnect();
    };
  }, [size, trackMouse, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      className={className}
    />
  );
}

"use client";

import { useRef, useState } from "react";
import { useMountEffect } from "@/components/mirro/lib/use-mount-effect";
import {
  CANVAS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FIXED_STEP,
  setCanvasSize,
} from "./koi/config";
import { FishRenderer } from "./koi/fish-renderer";
import { vec } from "./koi/math";
import { School } from "./koi/school";
import { getWeatherPreset, DEFAULT_WEATHER_PRESET_ID } from "./koi/weather";
import { settings } from "./koi/settings/store";
import { loadInto, connectPersistence } from "./koi/settings/persistence";

// Restore persisted tuning once, at module scope, so the simulation reads the
// same values the reference app does.
loadInto(settings);
connectPersistence(settings);

interface KoiRuntime {
  school: School;
  renderer: FishRenderer;
}

/**
 * Interactive procedural koi pond (Mort Dudley engine).
 *
 * Faithful port of the upstream Three.js simulation: the same `School` logic,
 * `FishRenderer` GLSL passes, ecology, weather, lotus, duckweed and butterflies
 * are vendored under `./koi`. This component owns only the host concerns the
 * original kept in `app.tsx` — canvas sizing, the fixed-step simulation loop,
 * pointer feeding, and disposal.
 */
export function KoiPondThree() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<KoiRuntime | null>(null);
  const [night, setNight] = useState(false);

  useMountEffect(() => {
    const canvas = canvasRef.current;
    const display = displayRef.current;
    if (!canvas || !display) return;

    setCanvasSize(CANVAS.width, CANVAS.height);
    const school = new School();
    const renderer = new FishRenderer(canvas);
    runtimeRef.current = { school, renderer };

    const preset = getWeatherPreset(settings.meta().weather);
    renderer.setWeatherPreset(preset.id);
    school.setMoonlight(preset.id === "moonlight");

    // The render buffer is a fixed 480x270 pixel-art surface; only re-allocate
    // when that backbuffer actually changes size.
    const resizeObserver = new ResizeObserver(() => {
      const rect = display.getBoundingClientRect();
      const portrait =
        window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches &&
        rect.width > 0 &&
        rect.height > 0;
      const nextWidth = portrait
        ? Math.min(CANVAS.width, Math.max(CANVAS.height, Math.round(rect.width * 0.7)))
        : CANVAS.width;
      const nextHeight = portrait
        ? Math.max(CANVAS.height, Math.round((nextWidth * rect.height) / rect.width))
        : CANVAS.height;
      if (nextWidth === CANVAS_WIDTH && nextHeight === CANVAS_HEIGHT) return;
      const oldWidth = CANVAS_WIDTH;
      const oldHeight = CANVAS_HEIGHT;
      setCanvasSize(nextWidth, nextHeight);
      school.resize(nextWidth / oldWidth, nextHeight / oldHeight);
      renderer.resize(nextWidth, nextHeight, oldWidth, oldHeight);
    });
    resizeObserver.observe(display);

    let animationFrame = 0;
    let accumulator = 0;
    let simulationTime = 0;
    let previousTime = performance.now();

    const animate = (now: number): void => {
      accumulator += Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      while (accumulator >= FIXED_STEP) {
        simulationTime += FIXED_STEP;
        school.update(FIXED_STEP, simulationTime);
        accumulator -= FIXED_STEP;
      }
      renderer.draw(school, simulationTime, false);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
      } else {
        previousTime = performance.now();
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
      renderer.dispose();
      runtimeRef.current = null;
    };
  });

  const pondPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return vec();
    const bounds = canvas.getBoundingClientRect();
    return vec(
      ((event.clientX - bounds.left) / bounds.width) * CANVAS_WIDTH,
      ((event.clientY - bounds.top) / bounds.height) * CANVAS_HEIGHT,
    );
  };

  const applyNight = (value: boolean) => {
    setNight(value);
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const preset = getWeatherPreset(value ? "moonlight" : DEFAULT_WEATHER_PRESET_ID);
    runtime.renderer.setWeatherPreset(preset.id);
    runtime.school.setMoonlight(value);
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-label="Procedural koi pond">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            Interactive · procedural simulation
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            The koi pond
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Every fish steers itself in real time — depth, hunger, currents and
            weather included. Click the water to call them over.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyNight(!night)}
            aria-pressed={night}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {night ? "Day view" : "Night view"}
          </button>
          <button
            type="button"
            onClick={() => runtimeRef.current?.school.callTo(vec(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2))}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted"
          >
            Call the fish
          </button>
          <button
            type="button"
            onClick={() => runtimeRef.current?.school.scatter()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted"
          >
            Scatter
          </button>
        </div>
      </div>

      <div
        ref={displayRef}
        className="relative mt-10 aspect-video w-full overflow-hidden rounded-2xl border border-border bg-[#09090b]"
      >
        <canvas
          ref={canvasRef}
          aria-label="Animated procedural koi"
          onPointerDown={(event) => {
            const point = pondPoint(event);
            runtimeRef.current?.school.callTo(point);
          }}
          className="block h-full w-full touch-none"
          style={{ imageRendering: "pixelated" }}
        />
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-3 py-1 font-mono text-[11px] text-white backdrop-blur-sm">
          Click the water to call the koi
          {night ? " · Night" : ""}
        </p>
      </div>
    </section>
  );
}

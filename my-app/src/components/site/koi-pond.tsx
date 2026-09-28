"use client";

import { useEffect, useRef, useState } from "react";

interface KoiPatch {
  at: number;
  color: string;
}

interface Koi {
  x: number;
  y: number;
  angle: number;
  speed: number;
  baseSpeed: number;
  size: number;
  phase: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
  depth: number;
  base: string;
  patches: KoiPatch[];
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  max: number;
  alpha: number;
}

interface Food {
  x: number;
  y: number;
  ttl: number;
}

interface PondTheme {
  waterTop: string;
  waterBottom: string;
  ripple: string;
  outline: string;
  leaf: string;
  leafShadow: string;
  flower: string;
  food: string;
}

const PATTERNS: { base: string; patches: KoiPatch[] }[] = [
  { base: "#f4f1ea", patches: [{ at: 0.25, color: "#ff7a33" }, { at: 0.58, color: "#232326" }] },
  { base: "#f4f1ea", patches: [{ at: 0.38, color: "#232326" }] },
  { base: "#ff8a3d", patches: [{ at: 0.32, color: "#f4f1ea" }] },
  { base: "#2a2a2e", patches: [{ at: 0.42, color: "#ff7a33" }] },
  { base: "#f4f1ea", patches: [{ at: 0.22, color: "#ff7a33" }, { at: 0.62, color: "#ff7a33" }] },
];

function pondTheme(dark: boolean): PondTheme {
  return dark
    ? {
        waterTop: "#0c1521",
        waterBottom: "#070c13",
        ripple: "235,242,250",
        outline: "rgba(0,0,0,0.5)",
        leaf: "#2f7a4d",
        leafShadow: "#1f5a37",
        flower: "#f0c3d2",
        food: "#ff4d29",
      }
    : {
        waterTop: "#dcebf0",
        waterBottom: "#bfd6de",
        ripple: "15,45,60",
        outline: "rgba(20,45,60,0.35)",
        leaf: "#3f9a5f",
        leafShadow: "#2f7d4b",
        flower: "#e79fb3",
        food: "#c94019",
      };
}

function turnToward(angle: number, target: number, maxStep: number): number {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + Math.max(-maxStep, Math.min(maxStep, d));
}

function drawKoi(
  g: CanvasRenderingContext2D,
  f: Koi,
  theme: PondTheme,
  scale: number
) {
  const segs = 9;
  const len = f.size * scale;
  const dirx = Math.cos(f.angle);
  const diry = Math.sin(f.angle);
  const nx = -diry;
  const ny = dirx;

  const px: number[] = [];
  const py: number[] = [];
  const pw: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const back = s * len;
    const sway = Math.sin(f.phase - s * 4.2) * len * 0.09 * s;
    px.push(f.x - dirx * back - diry * sway);
    py.push(f.y - diry * back + dirx * sway);
    pw.push((1 - s * 0.78) * len * 0.155);
  }

  g.beginPath();
  for (let i = 0; i <= segs; i++) {
    const X = px[i] + nx * pw[i];
    const Y = py[i] + ny * pw[i];
    if (i === 0) g.moveTo(X, Y);
    else g.lineTo(X, Y);
  }
  for (let i = segs; i >= 0; i--) {
    g.lineTo(px[i] - nx * pw[i], py[i] - ny * pw[i]);
  }
  g.closePath();
  g.fillStyle = f.base;
  g.fill();
  g.strokeStyle = theme.outline;
  g.lineWidth = 1;
  g.stroke();

  for (const pt of f.patches) {
    const i = Math.max(0, Math.min(segs, Math.floor(pt.at * segs)));
    g.beginPath();
    g.ellipse(px[i], py[i], pw[i] * 0.92, pw[i] * 0.68, f.angle, 0, Math.PI * 2);
    g.fillStyle = pt.color;
    g.fill();
  }

  const wag = Math.sin(f.phase - 4.2) * 0.5;
  const tl = len * 0.3;
  const bx = px[segs];
  const by = py[segs];
  const tx = bx - dirx * tl * 0.9 + nx * wag * tl * 0.45;
  const ty = by - diry * tl * 0.9 + ny * wag * tl * 0.45;
  g.beginPath();
  g.moveTo(bx, by);
  g.lineTo(tx + nx * tl * 0.4, ty + ny * tl * 0.4);
  g.lineTo(tx - nx * tl * 0.4, ty - ny * tl * 0.4);
  g.closePath();
  g.fillStyle = f.base;
  g.fill();
  g.strokeStyle = theme.outline;
  g.stroke();
}

function drawLeaf(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  theme: PondTheme,
  withFlower: boolean
) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = theme.leaf;
  g.fill();
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + r * 0.95, y - r * 0.3);
  g.lineTo(x + r * 0.7, y + r * 0.62);
  g.closePath();
  g.fillStyle = theme.leafShadow;
  g.fill();
  if (withFlower) {
    g.fillStyle = theme.flower;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 0.22, y - r * 0.35 + Math.sin(a) * r * 0.22, r * 0.16, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(x, y - r * 0.35, r * 0.1, 0, Math.PI * 2);
    g.fillStyle = "#f5c542";
    g.fill();
  }
}

export function KoiPond() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<{ feed: (x?: number, y?: number) => void; scatter: () => void } | null>(null);
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    let W = 0;
    let H = 0;
    let dark = document.documentElement.classList.contains("dark");
    let theme = pondTheme(dark);
    let fishes: Koi[] = [];
    let ripples: Ripple[] = [];
    let food: Food | null = null;
    let running = false;
    let raf = 0;
    let last = 0;
    let rippleCooldown = 0;

    const spawn = () => {
      const count = W < 560 ? 4 : 7;
      const sizeBase = Math.max(22, Math.min(38, Math.min(W, H) * 0.075));
      fishes = Array.from({ length: count }, (_, i) => {
        const pat = PATTERNS[i % PATTERNS.length];
        return {
          x: W * (0.15 + Math.random() * 0.7),
          y: H * (0.15 + Math.random() * 0.7),
          angle: Math.random() * Math.PI * 2,
          speed: 30 + Math.random() * 22,
          baseSpeed: 30 + Math.random() * 22,
          size: sizeBase * (0.85 + Math.random() * 0.3),
          phase: Math.random() * Math.PI * 2,
          w1: 0.5 + Math.random() * 0.5,
          w2: 0.8 + Math.random() * 0.8,
          p1: Math.random() * Math.PI * 2,
          p2: Math.random() * Math.PI * 2,
          depth: 0.5 + Math.random() * 0.5,
          base: pat.base,
          patches: pat.patches,
        };
      });
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawStatic();
    };

    const drawWater = () => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, theme.waterTop);
      grad.addColorStop(1, theme.waterBottom);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    };

    const drawLeaves = (t: number) => {
      const bob = reduced ? 0 : Math.sin(t * 0.9) * 1.5;
      drawLeaf(g, W * 0.12, H * 0.74 + bob, Math.min(W, H) * 0.075, theme, true);
      drawLeaf(g, W * 0.87, H * 0.28 - bob, Math.min(W, H) * 0.06, theme, false);
    };

    const drawStatic = () => {
      drawWater();
      for (const f of fishes) {
        const s = 0.85 + f.depth * 0.3;
        g.save();
        g.globalAlpha = 0.75 + f.depth * 0.25;
        drawKoi(g, { ...f, phase: f.p1 }, theme, s);
        g.restore();
      }
      drawLeaves(0);
    };

    const feed = (fx?: number, fy?: number) => {
      const x = fx ?? W / 2;
      const y = fy ?? H / 2;
      food = { x, y, ttl: 5 };
      if (ripples.length < 24) ripples.push({ x, y, r: 6, max: 95, alpha: 0.55 });
    };

    const scatter = () => {
      for (const f of fishes) {
        const a = Math.atan2(f.y - H / 2, f.x - W / 2) + (Math.random() - 0.5);
        f.angle = a;
        f.speed = 150;
      }
      if (ripples.length < 24) ripples.push({ x: W / 2, y: H / 2, r: 10, max: 130, alpha: 0.4 });
      food = null;
    };

    apiRef.current = { feed, scatter };

    const step = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const t = now / 1000;

      for (const f of fishes) {
        let desired =
          f.angle + (Math.sin(t * f.w1 + f.p1) + Math.sin(t * f.w2 + f.p2) * 0.5) * 1.7 * dt;
        if (food && food.ttl > 0) {
          const dx = food.x - f.x;
          const dy = food.y - f.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 10 && dist < 440) {
            desired = turnToward(desired, Math.atan2(dy, dx), 3.4 * dt);
            f.speed = Math.min(f.baseSpeed * 1.7, f.speed + 70 * dt);
          }
        }
        const m = 64;
        if (f.x < m || f.x > W - m || f.y < m || f.y > H - m) {
          desired = turnToward(desired, Math.atan2(H / 2 - f.y, W / 2 - f.x), 4.6 * dt);
        }
        f.angle = desired;
        f.speed += (f.baseSpeed - f.speed) * Math.min(1, dt * 1.6);
        f.x += Math.cos(f.angle) * f.speed * dt;
        f.y += Math.sin(f.angle) * f.speed * dt;
        f.x = Math.max(8, Math.min(W - 8, f.x));
        f.y = Math.max(8, Math.min(H - 8, f.y));
        f.phase += dt * (4 + f.speed * 0.055);
        f.depth = 0.5 + 0.5 * Math.sin(t * 0.16 + f.p1);
      }

      for (let i = 0; i < fishes.length; i++) {
        for (let j = i + 1; j < fishes.length; j++) {
          const a = fishes[i];
          const b = fishes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 48 && dist > 0.01) {
            const push = ((48 - dist) / 48) * 26 * dt;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }

      if (food) {
        food.ttl -= dt;
        if (food.ttl <= 0) food = null;
      }

      rippleCooldown -= dt;
      if (rippleCooldown <= 0 && ripples.length < 20) {
        const f = fishes[Math.floor(Math.random() * fishes.length)];
        if (f && f.speed > 40) {
          ripples.push({ x: f.x, y: f.y, r: 4, max: 26, alpha: 0.3 });
          rippleCooldown = 1.6 + Math.random() * 2;
        } else {
          rippleCooldown = 0.8;
        }
      }

      drawWater();

      const sorted = [...fishes].sort((a, b) => a.depth - b.depth);
      for (const f of sorted) {
        const s = 0.85 + f.depth * 0.3;
        g.save();
        g.globalAlpha = 0.72 + f.depth * 0.28;
        drawKoi(g, f, theme, s);
        g.restore();
      }

      if (food) {
        const pulse = 1 + Math.sin(t * 5) * 0.15;
        g.beginPath();
        g.arc(food.x, food.y, 7 * pulse, 0, Math.PI * 2);
        g.fillStyle = theme.food;
        g.globalAlpha = 0.25;
        g.fill();
        g.beginPath();
        g.arc(food.x, food.y, 3, 0, Math.PI * 2);
        g.globalAlpha = 1;
        g.fill();
      }

      ripples = ripples.filter((r) => r.alpha > 0.01);
      for (const r of ripples) {
        r.r += 46 * dt;
        r.alpha *= 1 - 1.6 * dt;
        g.beginPath();
        g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        g.strokeStyle = `rgba(${theme.ripple},${Math.max(0, r.alpha).toFixed(3)})`;
        g.lineWidth = 1.5;
        g.stroke();
      }

      drawLeaves(t);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    let visible = true;
    const onVisible = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible && !document.hidden) start();
        else stop();
        if (reduced) drawStatic();
      },
      { threshold: 0 }
    );

    const mo = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      if (isDark !== dark) {
        dark = isDark;
        theme = pondTheme(dark);
        if (reduced) drawStatic();
      }
    });

    const ro = new ResizeObserver(resize);
    resize();
    spawn();
    if (reduced) {
      drawStatic();
    } else {
      document.addEventListener("visibilitychange", onVisible);
      io.observe(wrap);
      if (!document.hidden) start();
    }
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    ro.observe(wrap);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      io.disconnect();
      mo.disconnect();
      ro.disconnect();
      apiRef.current = null;
    };
  }, [reduced]);

  const pointFromEvent = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-label="Interactive koi pond">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            Interactive · procedural animation
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            The koi pond
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            No keyframes here — every fish steers itself in real time. Click the
            water to drop food and watch them gather.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => apiRef.current?.feed()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            Feed the fish
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.scatter()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted"
          >
            Scatter
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-label="Koi pond. Click to feed the fish. Press Space to scatter them."
        onPointerDown={(e) => {
          const p = pointFromEvent(e);
          if (p) apiRef.current?.feed(p.x, p.y);
        }}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            apiRef.current?.scatter();
          } else if (e.key === "Enter") {
            e.preventDefault();
            apiRef.current?.feed();
          }
        }}
        className="relative mt-10 overflow-hidden rounded-2xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <canvas ref={canvasRef} aria-hidden="true" className="block aspect-[4/5] w-full sm:aspect-[16/8]" />
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/45 px-3 py-1 font-mono text-[11px] text-white backdrop-blur-sm">
          {reduced ? "Still water — motion is off" : "Click the water to feed · Space scatters"}
        </p>
      </div>
    </section>
  );
}

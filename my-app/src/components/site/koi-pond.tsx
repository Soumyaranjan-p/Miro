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
  burst: number;
  burstCd: number;
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

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  wobble: number;
  phase: number;
}

interface Pebble {
  x: number;
  y: number;
  r: number;
  dark: boolean;
}

interface PondTheme {
  waterTop: string;
  waterMid: string;
  waterBottom: string;
  waterDeep: string;
  glow: string;
  caustic: string;
  ripple: string;
  outline: string;
  leaf: string;
  leafShadow: string;
  flower: string;
  flowerCore: string;
  food: string;
  bubble: string;
  bed: string;
  bedDark: string;
  waterTint: string;
}

const PATTERNS: { base: string; patches: KoiPatch[] }[] = [
  { base: "#f4f1ea", patches: [{ at: 0.25, color: "#ff7a33" }, { at: 0.58, color: "#232326" }] },
  { base: "#f4f1ea", patches: [{ at: 0.38, color: "#232326" }] },
  { base: "#ff8a3d", patches: [{ at: 0.32, color: "#f4f1ea" }] },
  { base: "#2a2a2e", patches: [{ at: 0.42, color: "#ff7a33" }] },
  { base: "#f4f1ea", patches: [{ at: 0.22, color: "#ff7a33" }, { at: 0.62, color: "#ff7a33" }] },
];

// Koi body half-width profile (fraction of maxW) sampled nose -> tail base.
const BODY_PROFILE: [number, number][] = [
  [0.0, 0.26],
  [0.1, 0.52],
  [0.2, 0.76],
  [0.3, 0.92],
  [0.4, 0.98],
  [0.5, 0.94],
  [0.6, 0.82],
  [0.7, 0.64],
  [0.8, 0.45],
  [0.9, 0.27],
  [1.0, 0.1],
];

function pondTheme(dark: boolean): PondTheme {
  return dark
    ? {
        waterTop: "#0f2233",
        waterMid: "#0b1a28",
        waterBottom: "#07111c",
        waterDeep: "#040a11",
        glow: "rgba(140,190,225,0.10)",
        caustic: "rgba(150,205,240,0.07)",
        ripple: "210,235,250",
        outline: "rgba(0,0,0,0.5)",
        leaf: "#2f7a4d",
        leafShadow: "#1f5a37",
        flower: "#f0c3d2",
        flowerCore: "#e8b23c",
        food: "#ff4d29",
        bubble: "rgba(190,225,245,0.5)",
        bed: "#0a141d",
        bedDark: "#08111a",
        waterTint: "20,60,90",
      }
    : {
        waterTop: "#dbeef2",
        waterMid: "#c2dde4",
        waterBottom: "#9fc7d0",
        waterDeep: "#86b1bc",
        glow: "rgba(255,255,255,0.30)",
        caustic: "rgba(255,255,255,0.22)",
        ripple: "20,55,70",
        outline: "rgba(20,45,60,0.35)",
        leaf: "#3f9a5f",
        leafShadow: "#2f7d4b",
        flower: "#e79fb3",
        flowerCore: "#e8b23c",
        food: "#c94019",
        bubble: "rgba(255,255,255,0.55)",
        bed: "#8fb0ba",
        bedDark: "#79a0ab",
        waterTint: "36,84,104",
      };
}

function turnToward(angle: number, target: number, maxStep: number): number {
  let d = target - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + Math.max(-maxStep, Math.min(maxStep, d));
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${gg},${b})`;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawKoi(
  g: CanvasRenderingContext2D,
  f: Koi,
  theme: PondTheme,
  scale: number
) {
  const segs = 16;
  const len = f.size * scale;
  const maxW = len * 0.16;
  const dirx = Math.cos(f.angle);
  const diry = Math.sin(f.angle);
  const nx = -diry;
  const ny = dirx;

  const halfWidth = (s: number): number => {
    for (let i = 0; i < BODY_PROFILE.length - 1; i++) {
      const s0 = BODY_PROFILE[i][0];
      const s1 = BODY_PROFILE[i + 1][0];
      if (s <= s1) {
        const u = (s - s0) / (s1 - s0);
        return (BODY_PROFILE[i][1] + (BODY_PROFILE[i + 1][1] - BODY_PROFILE[i][1]) * u) * maxW;
      }
    }
    return maxW * 0.1;
  };

  // Centerline with a richer, less robotic undulation (two harmonics).
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const back = s * len;
    const sway =
      (Math.sin(f.phase - s * 5.2) * 0.6 +
        Math.sin(f.phase * 1.7 - s * 8.1 + 1.2) * 0.28) *
      len *
      0.075 *
      Math.pow(s, 0.8);
    cx.push(f.x - dirx * back - diry * sway);
    cy.push(f.y - diry * back + dirx * sway);
  }

  const nose = { x: cx[0] + dirx * maxW * 0.42, y: cy[0] + diry * maxW * 0.42 };
  const ring: { x: number; y: number }[] = [nose];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const w = halfWidth(s);
    ring.push({ x: cx[i] + nx * w, y: cy[i] + ny * w });
  }
  for (let i = segs; i >= 0; i--) {
    const s = i / segs;
    const w = halfWidth(s);
    ring.push({ x: cx[i] - nx * w, y: cy[i] - ny * w });
  }

  const body = new Path2D();
  body.moveTo(
    (ring[0].x + ring[ring.length - 1].x) / 2,
    (ring[0].y + ring[ring.length - 1].y) / 2
  );
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    body.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  body.closePath();

  // Soft shadow on the pond bed, offset by how deep the fish swims.
  g.save();
  g.beginPath();
  g.ellipse(
    f.x + 4,
    f.y + 6,
    len * 0.5,
    len * 0.16,
    f.angle,
    0,
    Math.PI * 2
  );
  g.fillStyle = `rgba(0,0,0,${(0.1 + (1 - f.depth) * 0.08).toFixed(3)})`;
  g.fill();
  g.restore();

  // Cylindrical body shading: darker flanks, lit back, rounded belly.
  const mi = Math.floor(segs * 0.32);
  const wm = halfWidth(mi / segs);
  const grad = g.createLinearGradient(
    cx[mi] + nx * wm,
    cy[mi] + ny * wm,
    cx[mi] - nx * wm,
    cy[mi] - ny * wm
  );
  grad.addColorStop(0, shade(f.base, -32));
  grad.addColorStop(0.3, shade(f.base, 16));
  grad.addColorStop(0.62, shade(f.base, -2));
  grad.addColorStop(1, shade(f.base, -38));
  g.fillStyle = grad;
  g.fill(body);

  g.save();
  g.clip(body);

  // Color patches (markings).
  for (const pt of f.patches) {
    const i = Math.max(1, Math.min(segs - 1, Math.round(pt.at * segs)));
    const s = i / segs;
    const w = halfWidth(s);
    const ta = Math.atan2(cy[i + 1] - cy[i - 1], cx[i + 1] - cx[i - 1]);
    g.beginPath();
    g.ellipse(cx[i], cy[i], w * 1.25, w * 0.82, ta, 0, Math.PI * 2);
    g.fillStyle = pt.color;
    g.globalAlpha = 0.92;
    g.fill();
    g.globalAlpha = 1;
  }

  // Gill shadow.
  const gi = Math.floor(segs * 0.16);
  g.beginPath();
  g.ellipse(
    cx[gi],
    cy[gi],
    halfWidth(gi / segs) * 0.9,
    maxW * 0.55,
    f.angle,
    0,
    Math.PI * 2
  );
  g.fillStyle = shade(f.base, -30);
  g.globalAlpha = 0.35;
  g.fill();
  g.globalAlpha = 1;

  // Depth tint — fish further from the surface pick up water color.
  const tintA = (1 - f.depth) * 0.5;
  if (tintA > 0.01) {
    g.fillStyle = `rgba(${theme.waterTint},${tintA.toFixed(3)})`;
    g.fill(body);
  }

  g.restore();

  // Spine highlight (dorsal ridge catching the light).
  g.beginPath();
  for (let i = Math.floor(segs * 0.06); i <= Math.floor(segs * 0.9); i++) {
    const s = i / segs;
    const px = cx[i] + nx * halfWidth(s) * 0.12;
    const py = cy[i] + ny * halfWidth(s) * 0.12;
    if (i === Math.floor(segs * 0.06)) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.strokeStyle = "rgba(255,255,255,0.14)";
  g.lineWidth = Math.max(0.8, maxW * 0.16);
  g.lineCap = "round";
  g.stroke();

  g.strokeStyle = theme.outline;
  g.lineWidth = 1;
  g.stroke(body);

  // Pectoral fins — translucent, speed-linked flap.
  const flap = Math.sin(f.phase * 1.0 + 1.3) * (0.16 + f.speed / 300);
  const fi = Math.floor(segs * 0.22);
  const fl = maxW * 1.5;
  for (const side of [1, -1]) {
    const bx = cx[fi] + nx * halfWidth(fi / segs) * 0.7 * side;
    const by = cy[fi] + ny * halfWidth(fi / segs) * 0.7 * side;
    const tipx = bx + nx * side * fl * 0.5 - dirx * fl * 0.8 + nx * side * flap * fl * 0.5;
    const tipy = by + ny * side * fl * 0.5 - diry * fl * 0.8 + ny * side * flap * fl * 0.5;
    g.beginPath();
    g.moveTo(bx - dirx * fl * 0.22, by - diry * fl * 0.22);
    g.quadraticCurveTo(
      bx + nx * side * fl * 0.55 - dirx * fl * 0.5,
      by + ny * side * fl * 0.55 - diry * fl * 0.5,
      tipx,
      tipy
    );
    g.quadraticCurveTo(bx - dirx * fl * 0.55, by - diry * fl * 0.55, bx + dirx * fl * 0.22, by + diry * fl * 0.22);
    g.closePath();
    g.fillStyle = shade(f.base, -8);
    g.globalAlpha = 0.6;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = theme.outline;
    g.lineWidth = 0.75;
    g.stroke();
  }

  // Two-lobed koi tail, speed-linked wag.
  const ex = cx[segs] - cx[segs - 2];
  const ey = cy[segs] - cy[segs - 2];
  const ea = Math.atan2(ey, ex);
  const speedAmp = 0.3 + Math.min(1, f.speed / 120) * 0.25;
  const wag = Math.sin(f.phase - 5.0) * speedAmp;
  const ta = ea + wag;
  const tl = len * 0.42;
  const px0 = cx[segs];
  const py0 = cy[segs];
  const spread = 0.52;
  const lt = { x: px0 + Math.cos(ta + spread) * tl, y: py0 + Math.sin(ta + spread) * tl };
  const rt = { x: px0 + Math.cos(ta - spread) * tl, y: py0 + Math.sin(ta - spread) * tl };
  const notch = { x: px0 + Math.cos(ta) * tl * 0.5, y: py0 + Math.sin(ta) * tl * 0.5 };
  const cl = { x: px0 + Math.cos(ta + spread * 0.5) * tl * 1.15, y: py0 + Math.sin(ta + spread * 0.5) * tl * 1.15 };
  const cr = { x: px0 + Math.cos(ta - spread * 0.5) * tl * 1.15, y: py0 + Math.sin(ta - spread * 0.5) * tl * 1.15 };
  g.beginPath();
  g.moveTo(px0, py0);
  g.quadraticCurveTo(cl.x, cl.y, lt.x, lt.y);
  g.quadraticCurveTo(notch.x, notch.y, rt.x, rt.y);
  g.quadraticCurveTo(cr.x, cr.y, px0, py0);
  g.closePath();
  const tailGrad = g.createLinearGradient(px0, py0, notch.x, notch.y);
  tailGrad.addColorStop(0, shade(f.base, -6));
  tailGrad.addColorStop(1, shade(f.base, -16));
  g.fillStyle = tailGrad;
  g.globalAlpha = 0.92;
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = theme.outline;
  g.lineWidth = 0.75;
  g.stroke();
  // Tail fin rays.
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 0.6;
  for (let i = 1; i <= 3; i++) {
    const a = ta + (i - 2) * spread * 0.5;
    g.beginPath();
    g.moveTo(px0 + Math.cos(ta) * maxW * 0.3, py0 + Math.sin(ta) * maxW * 0.3);
    g.lineTo(px0 + Math.cos(a) * tl * 0.92, py0 + Math.sin(a) * tl * 0.92);
    g.stroke();
  }

  // Eyes — dark with a specular highlight.
  const er = Math.max(1.2, maxW * 0.14);
  for (const side of [1, -1]) {
    const exx = cx[1] + nx * halfWidth(1 / segs) * 0.55 * side;
    const eyy = cy[1] + ny * halfWidth(1 / segs) * 0.55 * side;
    g.beginPath();
    g.arc(exx, eyy, er, 0, Math.PI * 2);
    g.fillStyle = "#201f22";
    g.fill();
    g.beginPath();
    g.arc(exx - er * 0.28, eyy - er * 0.28, er * 0.36, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fill();
  }

  // Mouth and barbels (whiskers).
  g.beginPath();
  g.arc(nose.x + dirx * maxW * 0.1, nose.y + diry * maxW * 0.1, maxW * 0.08, 0, Math.PI * 2);
  g.fillStyle = "#0e0e10";
  g.fill();
  g.strokeStyle = shade(f.base, -40);
  g.lineWidth = 0.6;
  for (const side of [1, -1]) {
    const bx = nose.x + nx * maxW * 0.16 * side;
    const by = nose.y + ny * maxW * 0.16 * side;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + dirx * len * 0.07 + nx * side * maxW * 0.12, by + diry * len * 0.07 + ny * side * maxW * 0.12);
    g.stroke();
  }
}

function drawLeaf(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  theme: PondTheme,
  withFlower: boolean
) {
  const lg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r * 1.02);
  lg.addColorStop(0, shade(theme.leaf, 22));
  lg.addColorStop(0.7, theme.leaf);
  lg.addColorStop(1, shade(theme.leaf, -18));
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = lg;
  g.fill();
  g.strokeStyle = shade(theme.leaf, -24);
  g.lineWidth = 1;
  g.stroke();

  // Veins.
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 0.75;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12);
    g.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
    g.stroke();
  }

  if (withFlower) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const pcx = x + Math.cos(a) * r * 0.28;
      const pcy = y - r * 0.34 + Math.sin(a) * r * 0.28;
      const pg = g.createRadialGradient(pcx, pcy, 0, pcx, pcy, r * 0.3);
      pg.addColorStop(0, shade(theme.flower, 12));
      pg.addColorStop(1, shade(theme.flower, -8));
      g.beginPath();
      g.ellipse(pcx, pcy, r * 0.3, r * 0.13, a, 0, Math.PI * 2);
      g.fillStyle = pg;
      g.fill();
    }
    g.beginPath();
    g.arc(x, y - r * 0.34, r * 0.11, 0, Math.PI * 2);
    g.fillStyle = theme.flowerCore;
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
    let bubbles: Bubble[] = [];
    let pebbles: Pebble[] = [];
    let running = false;
    let raf = 0;
    let last = 0;
    let rippleCooldown = 0;
    let bubbleCooldown = 2;

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
          burst: Math.random() * 2,
          burstCd: 2 + Math.random() * 6,
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

      const rnd = mulberry32(7);
      const pcount = Math.round(W / 55);
      pebbles = [];
      for (let i = 0; i < pcount; i++) {
        pebbles.push({
          x: rnd() * W,
          y: H * (0.82 + rnd() * 0.16),
          r: 2 + rnd() * 5,
          dark: rnd() > 0.5,
        });
      }

      if (reduced) drawStatic();
    };

    const drawCaustics = (t: number) => {
      g.save();
      for (let i = 0; i < 3; i++) {
        const lx = W * (0.2 + 0.6 * ((Math.sin(t * 0.07 + i * 2.1) + 1) / 2));
        const ly = H * (0.25 + 0.5 * ((Math.sin(t * 0.05 + i * 3.3) + 1) / 2));
        const lr = Math.min(W, H) * (0.25 + 0.1 * Math.sin(t * 0.11 + i));
        const pg = g.createRadialGradient(lx, ly, 0, lx, ly, lr);
        pg.addColorStop(0, theme.caustic);
        pg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = pg;
        g.fillRect(0, 0, W, H);
      }
      g.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const baseY = H * (0.12 + 0.16 * i);
        const drift = Math.sin(t * 0.3 + i * 2.2) * 16;
        g.beginPath();
        g.moveTo(-10, baseY + drift);
        for (let x = 0; x <= W; x += 36) {
          const y = baseY + Math.sin(x * 0.014 + t * 0.5 + i * 1.9) * 8 + drift;
          g.lineTo(x, y);
        }
        g.strokeStyle = theme.caustic;
        g.lineWidth = 7 - (i % 3);
        g.stroke();
      }
      g.restore();
    };

    const drawBed = () => {
      const top = H * 0.76;
      const bg = g.createLinearGradient(0, top, 0, H);
      bg.addColorStop(0, "rgba(0,0,0,0)");
      bg.addColorStop(1, theme.bed);
      g.fillStyle = bg;
      g.fillRect(0, top, W, H - top);
      for (const p of pebbles) {
        g.beginPath();
        g.ellipse(p.x, p.y, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
        g.fillStyle = p.dark ? theme.bedDark : theme.bed;
        g.fill();
        g.beginPath();
        g.ellipse(p.x - p.r * 0.25, p.y - p.r * 0.2, p.r * 0.5, p.r * 0.3, 0, 0, Math.PI * 2);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fill();
      }
    };

    const drawVignette = () => {
      const v = g.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.75
      );
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.22)");
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    };

    const drawWater = (t: number) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, theme.waterTop);
      grad.addColorStop(0.45, theme.waterMid);
      grad.addColorStop(0.8, theme.waterBottom);
      grad.addColorStop(1, theme.waterDeep);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      const glow = g.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, H * 1.15);
      glow.addColorStop(0, theme.glow);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);

      if (!reduced) drawCaustics(t);
      drawBed();
      drawVignette();
    };

    const drawLeaves = (t: number) => {
      const bob = reduced ? 0 : Math.sin(t * 0.9) * 1.5;
      drawLeaf(g, W * 0.12, H * 0.74 + bob, Math.min(W, H) * 0.075, theme, true);
      drawLeaf(g, W * 0.87, H * 0.28 - bob, Math.min(W, H) * 0.06, theme, false);
    };

    const drawStatic = () => {
      drawWater(0);
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
        f.burstCd -= dt;
        if (f.burstCd <= 0) {
          f.burst = 0.4 + Math.random() * 0.35;
          f.burstCd = 4 + Math.random() * 8;
        }
        if (f.burst > 0) f.burst -= dt;

        let desired =
          f.angle +
          (Math.sin(t * f.w1 + f.p1) * 0.55 + Math.sin(t * f.w2 + f.p2) * 0.35) * 1.4 * dt;

        let seeking = false;
        if (food && food.ttl > 0) {
          const dx = food.x - f.x;
          const dy = food.y - f.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 10 && dist < 460) {
            desired = turnToward(desired, Math.atan2(dy, dx), 3.6 * dt);
            seeking = true;
          }
        }
        const m = 64;
        if (f.x < m || f.x > W - m || f.y < m || f.y > H - m) {
          desired = turnToward(desired, Math.atan2(H / 2 - f.y, W / 2 - f.x), 4.8 * dt);
        }
        f.angle = desired;

        let target: number;
        if (seeking) target = f.baseSpeed * 1.9;
        else if (f.burst > 0) target = f.baseSpeed * 1.65;
        else target = f.baseSpeed * (1 + 0.2 * Math.sin(t * 0.3 + f.p1 * 1.7));
        f.speed += (target - f.speed) * Math.min(1, dt * 1.4);

        f.x += Math.cos(f.angle) * f.speed * dt;
        f.y += Math.sin(f.angle) * f.speed * dt;
        f.x = Math.max(8, Math.min(W - 8, f.x));
        f.y = Math.max(8, Math.min(H - 8, f.y));
        f.phase += dt * (3 + f.speed * 0.085);
        f.depth = 0.5 + 0.5 * Math.sin(t * 0.14 + f.p1 + f.p2);
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

      bubbleCooldown -= dt;
      if (bubbleCooldown <= 0) {
        if (bubbles.length < 10) {
          const f = fishes[Math.floor(Math.random() * fishes.length)];
          if (f) {
            bubbles.push({
              x: f.x + (Math.random() - 0.5) * 22,
              y: f.y + (Math.random() - 0.5) * 12,
              r: 1 + Math.random() * 2.4,
              vy: 12 + Math.random() * 14,
              wobble: 6 + Math.random() * 8,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
        bubbleCooldown = 0.8 + Math.random() * 1.8;
      }
      for (const b of bubbles) {
        b.y -= b.vy * dt;
        b.x += Math.sin(t * 2 + b.phase) * b.wobble * dt * 4;
      }
      bubbles = bubbles.filter((b) => b.y > -10);

      drawWater(t);

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

      for (const b of bubbles) {
        const fade = Math.min(1, b.y / 40);
        g.beginPath();
        g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        g.strokeStyle = theme.bubble;
        g.globalAlpha = Math.max(0, Math.min(1, fade * 0.7));
        g.lineWidth = 1;
        g.stroke();
        g.beginPath();
        g.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
        g.fillStyle = theme.bubble;
        g.fill();
        g.globalAlpha = 1;
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
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-label="Interactive miro pond">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            Interactive · procedural animation
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            The miro pond
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

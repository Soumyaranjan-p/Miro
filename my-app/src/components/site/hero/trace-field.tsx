"use client";

import { useId } from "react";
import { LogoMark } from "../logo";

/**
 * The hero artwork: a fan of circuit traces that converge on a dark node tile
 * bearing the Mirro mark.
 *
 * Geometry is authored in reference units (one unit === one CSS px at the
 * reference width) inside a fixed `viewBox`, and every layer is positioned with
 * percentages of that same box, so the traces and the HTML node stay locked
 * together at any viewport width.
 *
 * Entrances are CSS animations (`hero-pop`, `trace-draw` in globals.css) rather
 * than scripted ones, so they run on the compositor and are neutralised by the
 * global `prefers-reduced-motion` block.
 */

type Point = readonly [number, number];

type Lane = {
  /** Polyline the trace follows; corners are rounded with `radius`. */
  points: readonly Point[];
  radius: number;
  /** "feed" stays faint where it passes behind the node; "converge" fades out. */
  profile?: "converge" | "feed";
  /** Draws a slow travelling highlight along this lane. */
  pulse?: boolean;
  width?: number;
};

type FieldGeometry = {
  width: number;
  height: number;
  tile: { cx: number; cy: number; size: number };
  lanes: readonly Lane[];
};

/**
 * Desktop: the reference composition, measured from the design.
 *
 * The tile occupies x 715.5–884.5, y 215.5–384.5. Every lane ends *inside* that
 * box — and clear of the 26% corner radius — so the trace tucks under the node
 * instead of stopping short of it or poking through a rounded corner.
 */
const WIDE: FieldGeometry = {
  width: 1600,
  height: 490,
  tile: { cx: 800, cy: 300, size: 169 },
  lanes: [
    // Top-left corner, angling down onto the node.
    { points: [[148, -20], [148, 40], [752, 335]], radius: 100 },
    // Left gutter, a shallow diagonal flattening into the node midline.
    { points: [[-40, 96], [400, 300], [744, 300]], radius: 80 },
    // Steep feeder turning into the vertical rail that runs through the node.
    { points: [[524, -20], [760, 132], [760, 470]], radius: 84, profile: "feed", pulse: true },
    // Staircase climbing out of the lower-left corner.
    { points: [[-30, 470], [152, 364], [390, 364], [470, 294], [744, 294]], radius: 60 },
  ],
};

/**
 * Mobile: the same language, re-balanced for a narrow column.
 *
 * Tile box is x 148–272, y 188–312, and the two rails sit at x 238 / 182 so the
 * descending pair stays clear of the centreline instead of collapsing onto it.
 */
const NARROW: FieldGeometry = {
  width: 420,
  height: 450,
  tile: { cx: 210, cy: 250, size: 124 },
  lanes: [
    { points: [[-30, 150], [104, 250], [196, 250]], radius: 52 },
    { points: [[54, -20], [54, 120], [192, 240]], radius: 58 },
    { points: [[216, -20], [238, 150], [238, 432]], radius: 52, profile: "feed", pulse: true },
    { points: [[-30, 436], [110, 356], [196, 300]], radius: 40 },
  ],
};

/**
 * Stroke ramps. Offsets follow each path's own direction, so a converging lane
 * runs transparent at the outer edge and warms to the accent as it reaches the
 * node. Values are [offset, colour, opacity] — plain colours plus `stop-opacity`
 * are used instead of `color-mix()`, which SVG ignores in presentation attributes.
 */
const TRACE_STOPS: Record<"converge" | "feed", readonly (readonly [number, string, number])[]> = {
  converge: [
    [0, "var(--foreground)", 0],
    [0.3, "var(--foreground)", 0.14],
    [0.62, "var(--accent)", 0.26],
    [0.86, "var(--accent)", 0.42],
    [1, "var(--accent)", 0.5],
  ],
  feed: [
    [0, "var(--foreground)", 0],
    [0.28, "var(--foreground)", 0.12],
    [0.6, "var(--accent)", 0.24],
    [0.8, "var(--accent)", 0.16],
    [1, "var(--foreground)", 0],
  ],
};

function pct(value: number, total: number) {
  return `${(value / total) * 100}%`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Straight runs joined by quadratic fillets, like a routed PCB trace. */
function tracePath(points: readonly Point[], radius: number) {
  const first = points[0];
  let d = `M ${round(first[0])} ${round(first[1])}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLength = Math.hypot(cx - px, cy - py);
    const outLength = Math.hypot(nx - cx, ny - cy);
    if (inLength === 0 || outLength === 0) continue;

    const r = Math.min(radius, inLength / 2, outLength / 2);
    const ax = cx - ((cx - px) / inLength) * r;
    const ay = cy - ((cy - py) / inLength) * r;
    const bx = cx + ((nx - cx) / outLength) * r;
    const by = cy + ((ny - cy) / outLength) * r;

    d += ` L ${round(ax)} ${round(ay)} Q ${round(cx)} ${round(cy)} ${round(bx)} ${round(by)}`;
  }

  const last = points[points.length - 1];
  return `${d} L ${round(last[0])} ${round(last[1])}`;
}

/** Reflects a left-hand lane across the centreline into its right-hand twin. */
function mirrorLane(lane: Lane, width: number): Lane {
  const points = lane.points.map(([x, y]) => [width - x, y] as Point).reverse();
  return { ...lane, points };
}

function TileMark() {
  // The site's own Mirro mark, rendered light so it reads against the dark tile.
  return (
    <span className="block w-[52%] text-white">
      <LogoMark className="h-auto w-full" />
    </span>
  );
}

function NodeTile({ geometry }: { geometry: FieldGeometry }) {
  const { tile, width, height } = geometry;

  return (
    <div
      className="hero-pop absolute"
      style={{
        left: pct(tile.cx - tile.size / 2, width),
        top: pct(tile.cy - tile.size / 2, height),
        width: pct(tile.size, width),
        animationDelay: "0.42s",
      }}
    >
      <div className="aspect-square w-full">
        <div className="relative size-full rounded-[26%] bg-[#0b0b0c] p-[3.4%] shadow-[0_18px_38px_-16px_rgba(0,0,0,0.7)] dark:bg-[#2a2a30]">
          <div className="size-full rounded-[23%] bg-white p-[2.6%] dark:bg-[#f4f4f5]">
            <div className="grid size-full place-items-center rounded-[20%] bg-[linear-gradient(160deg,#6e6e72_0%,#3a3a3f_45%,#1c1c20_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_2px_rgba(0,0,0,0.5)]">
              <TileMark />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceLayer({ geometry, prefix }: { geometry: FieldGeometry; prefix: string }) {
  const lanes = geometry.lanes.flatMap((lane, index) => {
    const order = index;
    return [
      { lane, id: `${prefix}-${index}`, order },
      { lane: mirrorLane(lane, geometry.width), id: `${prefix}-${index}-m`, order },
    ];
  });

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className="absolute inset-0 h-full w-full"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        {lanes.map(({ lane, id }) => {
          const stops = TRACE_STOPS[lane.profile ?? "converge"];
          const start = lane.points[0];
          const end = lane.points[lane.points.length - 1];
          return (
            <linearGradient
              key={id}
              id={id}
              gradientUnits="userSpaceOnUse"
              x1={start[0]}
              y1={start[1]}
              x2={end[0]}
              y2={end[1]}
            >
              {stops.map(([offset, color, opacity]) => (
                <stop key={offset} offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
              ))}
            </linearGradient>
          );
        })}
      </defs>

      {lanes.map(({ lane, id, order }) => (
        <path
          key={id}
          d={tracePath(lane.points, lane.radius)}
          stroke={`url(#${id})`}
          strokeWidth={lane.width ?? 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="trace-draw"
          style={{ animationDelay: `${order * 0.09}s` }}
        />
      ))}

      {lanes
        .filter(({ lane }) => lane.pulse)
        .map(({ lane, id }) => (
          <path
            key={`${id}-pulse`}
            d={tracePath(lane.points, lane.radius)}
            pathLength={1}
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            className="trace-pulse opacity-60"
          />
        ))}
    </svg>
  );
}

export function TraceField({ variant }: { variant: "wide" | "narrow" }) {
  const geometry = variant === "wide" ? WIDE : NARROW;
  // Both variants render at once (one is display:none), so gradient ids must be
  // unique per instance or the hidden field's gradients win the duplicate.
  const prefix = `trace-${variant}-${useId()}`;

  return (
    <div className="@container">
      <div
        className={
          variant === "wide"
            ? "relative mx-auto aspect-[1600/490] w-full max-w-[1760px]"
            : "relative mx-auto aspect-[420/450] w-full"
        }
      >
        <TraceLayer geometry={geometry} prefix={prefix} />
        <NodeTile geometry={geometry} />
      </div>
    </div>
  );
}

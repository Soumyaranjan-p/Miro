"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

function IconReact() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <circle cx="12" cy="12" r="2.2" fill="#61DAFB" />
      <g stroke="#61DAFB" strokeWidth="1.1">
        <ellipse cx="12" cy="12" rx="10" ry="4.1" />
        <ellipse cx="12" cy="12" rx="10" ry="4.1" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4.1" transform="rotate(120 12 12)" />
      </g>
    </svg>
  );
}

function IconMotion() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="M4 12a8 8 0 0 1 16 0"
        stroke="#E879F9"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7 12a5 5 0 0 1 10 0"
        stroke="#C084FC"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 12a2 2 0 0 1 4 0"
        stroke="#A855F7"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.2" fill="#E879F9" />
    </svg>
  );
}

function IconTypeScript() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#3178C6" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="white"
        fontFamily="ui-monospace, monospace"
      >
        TS
      </text>
    </svg>
  );
}

function IconTailwind() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d="M12 6c-2.7 0-4.3 1.3-5 4 1-1.3 2.2-1.8 3.5-1.5.8.2 1.3.8 2 1.5.9.9 2 1.5 3.5 1.5 2.7 0 4.3-1.3 5-4-1 1.3-2.2 1.8-3.5 1.5-.8-.2-1.3-.8-2-1.5-.9-.9-2-1.5-3.5-1.5Z"
        fill="#38BDF8"
      />
      <path
        d="M7 13c-2.7 0-4.3 1.3-5 4 1-1.3 2.2-1.8 3.5-1.5.8.2 1.3.8 2 1.5.9.9 2 1.5 3.5 1.5 2.7 0 4.3-1.3 5-4-1 1.3-2.2 1.8-3.5 1.5-.8-.2-1.3-.8-2-1.5-.9-.9-2-1.5-3.5-1.5Z"
        fill="#38BDF8"
        opacity="0.6"
      />
    </svg>
  );
}

function IconSvg() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="#F97316" strokeWidth="1.6">
      <path d="m8 6-5 6 5 6M16 6l5 6-5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNextjs() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <circle cx="12" cy="12" r="10.5" fill="#181818" stroke="#404040" />
      <path
        d="M8.5 7v10M8.5 7 16 17.2V7"
        stroke="#F5F5F5"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconNode() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path d="M12 2 21 7v10l-9 5-9-5V7Z" stroke="#83CD29" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 7v10M8.5 8.8l7 6.4M15.5 8.8l-7 6.4" stroke="#83CD29" strokeWidth="1" opacity="0.8" />
    </svg>
  );
}

function IconVite() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#A855F7" stroke="#FACC15" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

function IconGit() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="#F05033" strokeWidth="1.6">
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="8" r="2.2" />
      <path d="M6 8.2v7.6M18 10.2c0 4-4 4.8-8.5 5.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNpm() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <rect x="2" y="7" width="20" height="10" rx="1.5" fill="#CB3837" />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="800"
        fill="white"
        fontFamily="ui-monospace, monospace"
      >
        npm
      </text>
    </svg>
  );
}

function IconVercel() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path d="M12 4 22 20H2L12 4Z" fill="#F5F5F5" />
    </svg>
  );
}

function IconFigma() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path d="M8 2h4v7H8a3.5 3.5 0 0 1 0-7Z" fill="#F24E1E" />
      <path d="M12 2h4a3.5 3.5 0 0 1 0 7h-4V2Z" fill="#FF7262" />
      <path d="M8 9h4v7H8a3.5 3.5 0 0 1 0-7Z" fill="#A259FF" />
      <circle cx="16" cy="12.5" r="3.5" fill="#1ABCFE" />
      <path d="M8 16h4v3.5a3.5 3.5 0 1 1-4-3.5Z" fill="#0ACF83" />
    </svg>
  );
}

type IntegrationItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

const LEFT_ITEMS: IntegrationItem[] = [
  { id: "react", label: "React", icon: <IconReact /> },
  { id: "motion", label: "Motion", icon: <IconMotion /> },
  { id: "typescript", label: "TypeScript", icon: <IconTypeScript /> },
  { id: "tailwind", label: "Tailwind", icon: <IconTailwind /> },
  { id: "svg", label: "SVG", icon: <IconSvg /> },
  { id: "nextjs", label: "Next.js", icon: <IconNextjs /> },
];

const RIGHT_ITEMS: IntegrationItem[] = [
  { id: "node", label: "Node.js", icon: <IconNode /> },
  { id: "vite", label: "Vite", icon: <IconVite /> },
  { id: "git", label: "Git", icon: <IconGit /> },
  { id: "npm", label: "npm", icon: <IconNpm /> },
  { id: "vercel", label: "Vercel", icon: <IconVercel /> },
  { id: "figma", label: "Figma", icon: <IconFigma /> },
];

const VIEW_W = 1400;
const VIEW_H = 520;
const NODE_SIZE = 168;
const ICON = 64;
const ROW_GAP = 78;
const COL_OFFSET = 74;
const START_Y = 20;
const ROW_COUNT = 6;
const ICON_LIST_CENTER_Y = START_Y + ((ROW_COUNT - 1) * ROW_GAP) / 2 + ICON / 2;
const CONVERGE = { x: VIEW_W / 2, y: ICON_LIST_CENTER_Y };
const NODE_X = CONVERGE.x - NODE_SIZE / 2;
const NODE_Y = CONVERGE.y - NODE_SIZE / 2;
const SEGMENT = 0.08;
const GAP = 1 - SEGMENT;

function sidePositions(count: number, side: "left" | "right") {
  const nearX = side === "left" ? 40 : VIEW_W - 40 - ICON;
  const farX = side === "left" ? 40 + COL_OFFSET : VIEW_W - 40 - COL_OFFSET - ICON;
  return Array.from({ length: count }, (_, i) => ({
    x: i % 2 === 0 ? nearX : farX,
    y: START_Y + i * ROW_GAP,
  }));
}

function buildPath(from: { x: number; y: number }, side: "left" | "right", fanOffset: number) {
  const startX = side === "left" ? from.x + ICON : from.x;
  const startY = from.y + ICON / 2;
  const endX = CONVERGE.x + (side === "left" ? -fanOffset : fanOffset);
  const endY = CONVERGE.y;
  const bendX = (startX + endX) / 2;
  return `M ${startX} ${startY} L ${bendX} ${startY} L ${endX} ${endY}`;
}

function buildLines(items: IntegrationItem[], side: "left" | "right") {
  const positions = sidePositions(items.length, side);
  const fanSpread = 10;
  return items.map((item, i) => {
    const t = items.length <= 1 ? 0 : i / (items.length - 1) - 0.5;
    return { item, pos: positions[i], d: buildPath(positions[i], side, t * fanSpread) };
  });
}

function AnimatedPath({ d, delay }: { d: string; delay: number }) {
  const reduceMotion = useReducedMotion() ? true : false;

  if (reduceMotion) {
    return <path d={d} stroke="var(--border)" strokeWidth={1.25} fill="none" />;
  }

  return (
    <>
      <path d={d} stroke="var(--border)" strokeWidth={1.25} fill="none" />
      <motion.path
        d={d}
        pathLength={1}
        stroke="var(--accent)"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeDasharray={`${SEGMENT} ${GAP}`}
        fill="none"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -(SEGMENT + GAP) }}
        transition={{ duration: 2.4, ease: "linear", repeat: Infinity, repeatType: "loop", repeatDelay: 0.2, delay }}
      />
    </>
  );
}

function IntegrationTile({ item, pos }: { item: IntegrationItem; pos: { x: number; y: number } }) {
  return (
    <div
      className="absolute flex shrink-0 -translate-y-1/2 items-center justify-center rounded-xl border border-border bg-card"
      style={{
        left: `${(pos.x / VIEW_W) * 100}%`,
        top: `${((pos.y + ICON / 2) / VIEW_H) * 100}%`,
        width: `${(ICON / VIEW_W) * 100}%`,
        height: `${(ICON / VIEW_H) * 100}%`,
      }}
      title={item.label}
    >
      {item.icon}
    </div>
  );
}

function CenterNode() {
  return (
    <div
      className="absolute z-10 flex items-center justify-center rounded-2xl border border-border bg-card"
      style={{
        left: `${(NODE_X / VIEW_W) * 100}%`,
        top: `${(NODE_Y / VIEW_H) * 100}%`,
        width: `${(NODE_SIZE / VIEW_W) * 100}%`,
        height: `${(NODE_SIZE / VIEW_H) * 100}%`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-accent/15 blur-3xl"
      />
      <svg viewBox="0 0 24 24" className="size-1/2 text-accent" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
        <circle
          cx="12"
          cy="12"
          r="8.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="42 10"
          className="logo-orbit"
        />
        <circle cx="12" cy="12" r="2.25" fill="currentColor" />
      </svg>
    </div>
  );
}

function IntegrationsField() {
  const leftLines = buildLines(LEFT_ITEMS, "left");
  const rightLines = buildLines(RIGHT_ITEMS, "right");
  return (
    <div className="relative mx-auto aspect-[1400/520] w-full max-w-5xl">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full" fill="none" role="presentation">
        {[...leftLines, ...rightLines].map(({ item, d }, i) => (
          <AnimatedPath key={item.id} d={d} delay={i * 0.12} />
        ))}
      </svg>
      {[...leftLines, ...rightLines].map(({ item, pos }) => (
        <IntegrationTile key={item.id} item={item} pos={pos} />
      ))}
      <CenterNode />
    </div>
  );
}

export function IntegrationsHero() {
  return (
    <div className="relative isolate w-full overflow-hidden border-b border-border bg-muted/30 py-16 sm:py-20 md:py-24">
      <div
        aria-hidden
        className="dot-grid pointer-events-none absolute inset-0 opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 55%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 75%)",
        }}
      />
      <div className={cn("relative z-10 px-4 sm:px-6")}>
        <IntegrationsField />
      </div>
    </div>
  );
}

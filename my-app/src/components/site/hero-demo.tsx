"use client";

import { HeartDemo, LoaderDemo, ShimmerButton, TextReveal } from "./demos";

const cells = [
  { label: "heart", demo: <HeartDemo /> },
  { label: "shimmer button", demo: <ShimmerButton /> },
  { label: "text reveal", demo: <TextReveal /> },
  { label: "loader", demo: <LoaderDemo /> },
];

export function HeroDemo() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">mirro — live</span>
      </div>
      <div className="dot-grid grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col items-center justify-center gap-4 bg-card px-4 py-10">
            {cell.demo}
            <span className="font-mono text-[11px] text-muted-foreground">{cell.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

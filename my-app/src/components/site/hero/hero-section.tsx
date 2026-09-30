"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { TraceField } from "./trace-field";

const STATS = [
  { value: "42", label: "Components" },
  { value: "22", label: "Icons" },
  { value: "6", label: "UI blocks" },
];

function delay(seconds: number) {
  return { "--hero-delay": `${seconds}s` } as CSSProperties;
}

function PrimaryCta({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}

function GhostCta({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-background/80 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-muted active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <p className="sr-only">
        An AI project tool starter kit: 42 animated React components, 22 icons and 6 UI blocks for
        Motion and Tailwind CSS v4.
      </p>

      {/* Soft wash over the flat backdrop so the field reads as lit, not empty. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 78% at 50% 46%, color-mix(in oklab, var(--foreground) 4%, transparent), transparent 72%)",
        }}
      />

      <div className="relative z-10 pt-2">
        {/* Portrait composition for phones — the fan is redrawn, not cropped. */}
        <div className="hero-reveal pb-2 sm:hidden" style={delay(0.05)}>
          <TraceField variant="narrow" />
        </div>
        <div className="hero-reveal hidden sm:block" style={delay(0.05)}>
          <TraceField variant="wide" />
        </div>
      </div>

      {/*
       * Pulled up over the bottom of the field so the buttons sit just under the
       * node, as in the reference. The negative margin is a percentage, which
       * resolves against the section's inline size, so the clearance scales with
       * the artwork at every viewport instead of drifting into the node.
       */}
      <div className="hero-reveal relative z-20 -mt-[26%] flex flex-wrap items-center justify-center gap-3 px-4 sm:-mt-[5%] sm:gap-4">
        <PrimaryCta href="/components">Explore Components</PrimaryCta>
        <GhostCta href="/blocks">Explore Blocks</GhostCta>
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-16 sm:grid-cols-[1fr_auto] sm:items-end sm:px-6 sm:pb-14 sm:pt-20">
        <div className="hero-reveal" style={delay(0.7)}>
          <h1 className="max-w-xl text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-4xl">
            Motion, indexed and ready to copy.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            A living library of animated React components, icons and page blocks. Every one is tuned
            by vibe-coded, and shipped as source you own.
          </p>
        </div>
        <dl className="hero-reveal flex gap-8 sm:gap-10" style={delay(0.78)}>
          {STATS.map((stat) => (
            <div key={stat.label}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="text-2xl font-semibold tracking-tight text-foreground">{stat.value}</dd>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

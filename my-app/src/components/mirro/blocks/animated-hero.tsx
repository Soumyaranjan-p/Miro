"use client";

import { TextReveal } from "../components/text-reveal";
import { MagneticButton } from "../components/magnetic-button";
import { SpotlightCard } from "../components/spotlight-card";
import { HeartIcon } from "../icons/heart";
import { CheckIcon } from "../icons/check";
import { CopyIcon } from "../icons/copy";
import { SunMoonIcon } from "../icons/sun-moon";

function HeroVisual() {
  return (
    <SpotlightCard className="overflow-hidden" spotlightColor="255, 77, 41">
      <div className="border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">your-app</span>
        </div>
      </div>
      <div className="dot-grid flex flex-col items-center gap-6 px-8 py-12">
        <TextReveal as="h3" className="text-center text-2xl font-semibold tracking-tight text-foreground">
          Ship something great.
        </TextReveal>
        <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
          Animated primitives that feel intentional, dropped straight into your project.
        </p>
        <MagneticButton strength={0.25}>Start building</MagneticButton>
        <div className="mt-2 flex items-center gap-5 text-muted-foreground">
          <HeartIcon size={22} label="Like" />
          <CheckIcon size={22} label="Check" />
          <CopyIcon size={22} label="Copy" />
          <SunMoonIcon size={22} label="Toggle theme" />
        </div>
      </div>
    </SpotlightCard>
  );
}

export function AnimatedHero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 0%, rgba(255, 77, 41, 0.09), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Mirro — Animation UI Library
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              <TextReveal as="span" delay={0}>
                Motion for
              </TextReveal>{" "}
              <TextReveal as="span" delay={0.08}>
                modern
              </TextReveal>{" "}
              <TextReveal as="span" delay={0.16}>
                interfaces.
              </TextReveal>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              Animated icons, components and UI blocks built for React. Copy the source, paste it in, ship it.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <MagneticButton strength={0.35}>Get started</MagneticButton>
              <MagneticButton strength={0.35} variant="outline">
                Browse components
              </MagneticButton>
            </div>
            <p className="mt-8 font-mono text-xs text-muted-foreground">
              Copy, paste, ship.
            </p>
          </div>
          <div>
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

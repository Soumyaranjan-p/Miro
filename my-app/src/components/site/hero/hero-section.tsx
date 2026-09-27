"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { MagneticButton } from "@/components/mirro/components/magnetic-button";
import { HeroHeadline } from "./hero-headline";
import { ShowcasePanel } from "./showcase-panel";

function GhostButton({ children, href }: { children: string; href: string }) {
  return (
    <Link
      href={href}
      className="group relative inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <span className="absolute inset-0 rounded-lg ring-ring/0 transition-shadow duration-150 ease-out group-focus-visible:ring-2 group-focus-visible:ring-ring" />
    </Link>
  );
}

export function HeroSection() {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: panelRef,
    offset: ["start end", "end start"],
  });
  const panelOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.35]);
  const panelY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0 opacity-[0.35]"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.45fr_1fr] lg:gap-10">
          <div>
            <HeroHeadline />
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              Animated icons, components and UI blocks built for React.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <MagneticButton strength={0.3} href="/components">
                Explore Components
              </MagneticButton>
              <GhostButton href="/icons">Browse Icons</GhostButton>
            </div>
          </div>
          <motion.div
            ref={panelRef}
            style={reduceMotion ? undefined : { opacity: panelOpacity, y: panelY }}
          >
            <ShowcasePanel />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

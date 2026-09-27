"use client";

import { SpotlightCard } from "../components/spotlight-card";
import { TextReveal } from "../components/text-reveal";
import { HeartIcon } from "../icons/heart";
import { CheckIcon } from "../icons/check";
import { CopyIcon } from "../icons/copy";
import { SunMoonIcon } from "../icons/sun-moon";
import { MenuIcon } from "../icons/menu";

const FEATURES = [
  {
    icon: HeartIcon,
    title: "Animated icons",
    description:
      "Every icon has its own intentional motion — hover, click, and state transitions that feel right.",
  },
  {
    icon: CheckIcon,
    title: "Production components",
    description:
      "Buttons, cards, tabs and accordions with tuned springs and custom easings. Copy, paste, ship.",
  },
  {
    icon: CopyIcon,
    title: "Copy-paste, not a dependency",
    description:
      "The CLI drops source into your project and resolves dependencies. You own the code, fully.",
  },
  {
    icon: SunMoonIcon,
    title: "Accessible by default",
    description:
      "Reduced motion, keyboard navigation and touch behavior are built in — not bolted on after.",
  },
  {
    icon: MenuIcon,
    title: "UI blocks that feel real",
    description:
      "Heroes, showcases and pricing sections assembled from Mirro components. Drop them into your next build.",
  },
  {
    icon: CheckIcon,
    title: "Performance-first motion",
    description:
      "Transform and opacity only, GPU-friendly, with springs where motion should feel alive.",
  },
];

export function FeatureShowcase() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            <TextReveal as="span">Everything you need to make it move.</TextReveal>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A complete animation toolkit for React — designed to feel intentional, not decorative.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <SpotlightCard key={feature.title} spotlightColor="255, 77, 41" className="group">
              <div className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground transition-colors duration-200 ease-out group-hover:text-accent">
                  <feature.icon size={20} />
                </div>
                <h3 className="mt-5 text-base font-medium text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

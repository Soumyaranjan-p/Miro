"use client";

import { SpotlightCard } from "../components/spotlight-card";
import { StarIcon } from "../icons/star";
import { TextReveal } from "../components/text-reveal";

const TESTIMONIALS = [
  {
    quote: "Mirro made our interface feel alive without us writing a single animation by hand.",
    name: "Maya Chen",
    role: "Staff Engineer, Northwind",
  },
  {
    quote: "The copy-paste model is exactly right. We own the code and the motion is gorgeous.",
    name: "Leo Park",
    role: "Design Engineer, Arcadia",
  },
  {
    quote: "Reduced-motion and accessibility were built in, not bolted on. That's rare.",
    name: "Sofia Reyes",
    role: "Accessibility Lead, Lumen",
  },
];

export function TestimonialsSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            Testimonials
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            <TextReveal as="span">Loved by people who ship.</TextReveal>
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <SpotlightCard key={t.name} spotlightColor="255, 77, 41">
              <div className="flex h-full flex-col p-7">
                <div className="flex gap-1 text-accent">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon key={i} size={16} />
                  ))}
                </div>
                <p className="mt-5 flex-1 text-sm leading-relaxed text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

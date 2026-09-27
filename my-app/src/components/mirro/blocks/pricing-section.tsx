"use client";

import { SpotlightCard } from "../components/spotlight-card";
import { GradientButton } from "../components/gradient-button";
import { CheckIcon } from "../icons/check";
import { TextReveal } from "../components/text-reveal";

const TIERS = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    description: "For side projects and experiments.",
    features: ["10 animated icons", "5 components", "Copy-paste source", "MIT license"],
    featured: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "/mo",
    description: "For production apps and teams.",
    features: ["All animated icons", "All components", "All UI blocks", "Priority updates"],
    featured: true,
  },
  {
    name: "Team",
    price: "$49",
    period: "/mo",
    description: "For organizations at scale.",
    features: ["Everything in Pro", "Custom animations", "Design support", "Team license"],
    featured: false,
  },
];

export function PricingSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            <TextReveal as="span">Simple, honest pricing.</TextReveal>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Pay for the motion. Use it anywhere.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <SpotlightCard
              key={tier.name}
              spotlightColor={tier.featured ? "255, 77, 41" : "255, 77, 41"}
              className={tier.featured ? "border-accent/40" : ""}
            >
              <div className="flex h-full flex-col p-7">
                <h3 className="text-base font-medium text-foreground">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{tier.description}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-foreground">
                      <CheckIcon size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <GradientButton className="w-full">
                    {tier.featured ? "Get started" : `Choose ${tier.name}`}
                  </GradientButton>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { getEntriesByType } from "@/lib/registry";
import { HeroSection } from "@/components/site/hero/hero-section";
import { IconShowcase } from "@/components/site/icon-showcase";
import { ShowcaseSection } from "@/components/site/showcase-section";

export default function Home() {
  const components = getEntriesByType("registry:component");
  const blocks = getEntriesByType("registry:block");

  return (
    <div>
      <HeroSection />

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">Icons</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              Animated icons
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Every icon has its own intentional animation. Hover and click them — they just work.
            </p>
          </div>
          <Link
            href="/icons"
            className="group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
          >
            View all
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        <div className="mt-10">
          <IconShowcase />
        </div>
      </section>

      <ShowcaseSection
        eyebrow="Components"
        title="Animated components"
        description="Buttons, cards, text animations and interactive primitives. Tuned springs, custom easings, production-ready."
        entries={components}
        basePath="/components"
        soonNames={["shimmer-button", "tilt-card", "flip-card"]}
      />

      <ShowcaseSection
        eyebrow="Blocks"
        title="Animated UI blocks"
        description="Complete website sections assembled from Mirro components. Heroes, showcases, pricing and more."
        entries={blocks}
        basePath="/blocks"
        soonNames={["pricing", "testimonials"]}
      />

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Make it move.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Animated icons, components and blocks that feel intentional. Built for React, shipped as source.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/components"
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              Explore Components
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

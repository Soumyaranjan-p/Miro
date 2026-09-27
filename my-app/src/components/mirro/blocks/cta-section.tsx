"use client";

import { MagneticButton } from "../components/magnetic-button";
import { TextReveal } from "../components/text-reveal";

export function CtaSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-28 text-center sm:px-6">
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          <TextReveal as="span">Ready to make it move?</TextReveal>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          Copy your first component and ship something that feels intentional.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <MagneticButton strength={0.35}>Start building</MagneticButton>
          <MagneticButton strength={0.35} variant="outline">
            Browse the library
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}

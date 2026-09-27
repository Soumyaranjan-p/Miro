"use client";

import { TextReveal } from "@/components/mirro/components/text-reveal";
import type { PreviewProps } from "./heart-preview";

export function TextRevealPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-8">
      <TextReveal delay={Number(controls?.delay ?? 0)}>
        <span className="text-lg font-medium text-foreground">Motion for modern interfaces.</span>
      </TextReveal>
    </div>
  );
}

"use client";

import { MagneticButton } from "@/components/mirro/components/magnetic-button";
import type { PreviewProps } from "./heart-preview";

export function MagneticButtonPreview({ controls }: PreviewProps) {
  const variant = controls?.variant === "outline" ? "outline" : "primary";
  return (
    <div className="flex items-center justify-center py-6">
      <MagneticButton
        strength={Number(controls?.strength ?? 0.35)}
        variant={variant}
      >
        Hover me
      </MagneticButton>
    </div>
  );
}

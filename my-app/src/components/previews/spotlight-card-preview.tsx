"use client";

import { SpotlightCard } from "@/components/mirro/components/spotlight-card";
import type { PreviewProps } from "./heart-preview";

export function SpotlightCardPreview({ controls }: PreviewProps) {
  return (
    <div className="p-2">
      <SpotlightCard spotlightColor={String(controls?.spotlightColor ?? "255, 77, 41")}>
        <div className="p-6">
          <h3 className="text-base font-medium text-foreground">Spotlight Card</h3>
          <p className="mt-1 text-sm text-muted-foreground">Move your cursor across this card.</p>
        </div>
      </SpotlightCard>
    </div>
  );
}

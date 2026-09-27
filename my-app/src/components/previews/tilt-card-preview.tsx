"use client";

import { TiltCard } from "@/components/mirro/components/tilt-card";

export function TiltCardPreview() {
  return (
    <div className="flex items-center justify-center p-4 py-8">
      <TiltCard className="w-full max-w-xs">
        <div className="p-6">
          <h3 className="text-base font-medium text-foreground">Tilt Card</h3>
          <p className="mt-1 text-sm text-muted-foreground">Move your cursor across this card.</p>
        </div>
      </TiltCard>
    </div>
  );
}

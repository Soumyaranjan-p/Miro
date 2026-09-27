"use client";

import { FlipCard } from "@/components/mirro/components/flip-card";

export function FlipCardPreview() {
  return (
    <div className="flex items-center justify-center p-4 py-8">
      <FlipCard
        className="w-full max-w-xs"
        front={
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-border bg-card">
            <p className="text-sm font-medium text-foreground">Hover to flip</p>
            <p className="mt-1 text-xs text-muted-foreground">Click to reveal the back</p>
          </div>
        }
        back={
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-accent/40 bg-accent/10">
            <p className="text-sm font-medium text-foreground">Back face</p>
            <p className="mt-1 text-xs text-muted-foreground">Click to flip back</p>
          </div>
        }
      />
    </div>
  );
}

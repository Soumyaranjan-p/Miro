"use client";

import { ScrambleText } from "@/components/mirro/components/scramble-text";

export function ScrambleTextPreview() {
  return (
    <div className="flex items-center justify-center py-8">
      <ScrambleText className="text-lg font-medium text-foreground">
        Decoded from noise.
      </ScrambleText>
    </div>
  );
}

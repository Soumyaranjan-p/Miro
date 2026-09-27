"use client";

import { GradientText } from "@/components/mirro/components/gradient-text";

export function GradientTextPreview() {
  return (
    <div className="flex items-center justify-center py-8">
      <GradientText>
        <span className="text-lg font-semibold">Animated gradient text.</span>
      </GradientText>
    </div>
  );
}

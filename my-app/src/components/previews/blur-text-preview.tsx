"use client";

import { BlurText } from "@/components/mirro/components/blur-text";

export function BlurTextPreview() {
  return (
    <div className="flex items-center justify-center py-8">
      <BlurText>
        <span className="text-lg font-medium text-foreground">Hover to focus.</span>
      </BlurText>
    </div>
  );
}

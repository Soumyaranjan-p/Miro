"use client";

import { TypewriterText } from "@/components/mirro/components/typewriter-text";

export function TypewriterTextPreview() {
  return (
    <div className="flex items-center justify-center py-8">
      <TypewriterText className="text-lg font-medium text-foreground">
        Typed character by character.
      </TypewriterText>
    </div>
  );
}

"use client";

import { SunMoonIcon } from "@/components/mirro/icons/sun-moon";
import type { PreviewProps } from "./heart-preview";

export function SunMoonPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center gap-6 py-4">
      <SunMoonIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

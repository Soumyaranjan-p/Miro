"use client";

import { ArrowIcon } from "@/components/mirro/icons/arrow";
import type { PreviewProps } from "./heart-preview";

export function ArrowPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <ArrowIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
        direction={controls?.direction === "up" || controls?.direction === "down" || controls?.direction === "left" ? controls.direction : "right"}
      />
    </div>
  );
}

"use client";

import { StarIcon } from "@/components/mirro/icons/star";
import type { PreviewProps } from "./heart-preview";

export function StarPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <StarIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
        fillColor={String(controls?.fillColor ?? "#ff4d29")}
      />
    </div>
  );
}

"use client";

import { BookmarkIcon } from "@/components/mirro/icons/bookmark";
import type { PreviewProps } from "./heart-preview";

export function BookmarkPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <BookmarkIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
        fillColor={String(controls?.fillColor ?? "#ff4d29")}
      />
    </div>
  );
}

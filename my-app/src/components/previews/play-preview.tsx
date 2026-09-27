"use client";

import { PlayIcon } from "@/components/mirro/icons/play";
import type { PreviewProps } from "./heart-preview";

export function PlayPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <PlayIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
      />
    </div>
  );
}

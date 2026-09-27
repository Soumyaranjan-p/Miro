"use client";

import { XIcon } from "@/components/mirro/icons/x";
import type { PreviewProps } from "./heart-preview";

export function XPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <XIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
      />
    </div>
  );
}

"use client";

import { EyeIcon } from "@/components/mirro/icons/eye";
import type { PreviewProps } from "./heart-preview";

export function EyePreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <EyeIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
      />
    </div>
  );
}

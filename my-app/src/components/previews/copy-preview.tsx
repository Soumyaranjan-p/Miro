"use client";

import { CopyIcon } from "@/components/mirro/icons/copy";
import type { PreviewProps } from "./heart-preview";

export function CopyPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center gap-6 py-4">
      <CopyIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
        checkColor={String(controls?.checkColor ?? "#ff4d29")}
      />
    </div>
  );
}

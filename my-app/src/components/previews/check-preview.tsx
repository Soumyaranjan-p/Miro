"use client";

import { CheckIcon } from "@/components/mirro/icons/check";
import type { PreviewProps } from "./heart-preview";

export function CheckPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center gap-6 py-4">
      <CheckIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

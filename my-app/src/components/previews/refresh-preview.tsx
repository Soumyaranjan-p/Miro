"use client";

import { RefreshIcon } from "@/components/mirro/icons/refresh";
import type { PreviewProps } from "./heart-preview";

export function RefreshPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <RefreshIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

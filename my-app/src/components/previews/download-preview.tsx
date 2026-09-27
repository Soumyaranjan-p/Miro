"use client";

import { DownloadIcon } from "@/components/mirro/icons/download";
import type { PreviewProps } from "./heart-preview";

export function DownloadPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <DownloadIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
      />
    </div>
  );
}

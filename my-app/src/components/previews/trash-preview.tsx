"use client";

import { TrashIcon } from "@/components/mirro/icons/trash";
import type { PreviewProps } from "./heart-preview";

export function TrashPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <TrashIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

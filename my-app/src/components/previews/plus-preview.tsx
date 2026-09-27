"use client";

import { PlusIcon } from "@/components/mirro/icons/plus";
import type { PreviewProps } from "./heart-preview";

export function PlusPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <PlusIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
      />
    </div>
  );
}

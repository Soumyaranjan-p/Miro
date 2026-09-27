"use client";

import { BellIcon } from "@/components/mirro/icons/bell";
import type { PreviewProps } from "./heart-preview";

export function BellPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <BellIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

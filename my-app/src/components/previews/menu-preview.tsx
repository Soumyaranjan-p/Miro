"use client";

import { MenuIcon } from "@/components/mirro/icons/menu";
import type { PreviewProps } from "./heart-preview";

export function MenuPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center gap-6 py-4">
      <MenuIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
      />
    </div>
  );
}

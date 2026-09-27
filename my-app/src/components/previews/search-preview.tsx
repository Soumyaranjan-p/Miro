"use client";

import { SearchIcon } from "@/components/mirro/icons/search";
import type { PreviewProps } from "./heart-preview";

export function SearchPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <SearchIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

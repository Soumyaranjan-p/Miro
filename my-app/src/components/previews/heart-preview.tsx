"use client";

import { HeartIcon } from "@/components/mirro/icons/heart";
import type { ControlValues } from "./control-panel";

export interface PreviewProps {
  controls?: ControlValues;
}

export function HeartPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <HeartIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "currentColor")}
        fillColor={String(controls?.fillColor ?? "#ff4d29")}
      />
    </div>
  );
}

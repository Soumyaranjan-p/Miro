"use client";

import { SendIcon } from "@/components/mirro/icons/send";
import type { PreviewProps } from "./heart-preview";

export function SendPreview({ controls }: PreviewProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <SendIcon
        size={Number(controls?.size ?? 24)}
        strokeWidth={Number(controls?.strokeWidth ?? 1.5)}
        color={String(controls?.color ?? "#fafafa")}
      />
    </div>
  );
}

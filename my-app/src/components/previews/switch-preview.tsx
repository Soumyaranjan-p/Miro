"use client";

import { Switch } from "@/components/mirro/components/switch";

export function SwitchPreview() {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <Switch label="Toggle" />
      <span className="text-sm text-muted-foreground">Switch</span>
    </div>
  );
}

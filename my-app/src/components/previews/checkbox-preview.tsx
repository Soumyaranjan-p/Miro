"use client";

import { Checkbox } from "@/components/mirro/components/checkbox";

export function CheckboxPreview() {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <Checkbox label="Check" />
      <span className="text-sm text-muted-foreground">Checkbox</span>
    </div>
  );
}

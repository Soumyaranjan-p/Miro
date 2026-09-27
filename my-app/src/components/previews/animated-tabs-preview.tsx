"use client";

import { AnimatedTabs } from "@/components/mirro/components/animated-tabs";

const TABS = [
  { label: "Overview", value: "overview" },
  { label: "Settings", value: "settings" },
  { label: "Activity", value: "activity" },
];

export function AnimatedTabsPreview() {
  return (
    <div className="flex items-center justify-center py-6">
      <AnimatedTabs tabs={TABS} />
    </div>
  );
}

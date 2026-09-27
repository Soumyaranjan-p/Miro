import type { Metadata } from "next";
import { getEntriesByType } from "@/lib/registry";
import { EntryGrid, IndexHeader } from "@/components/site/entry-grid";

export const metadata: Metadata = {
  title: "Components",
  description: "Animated UI components for React. Copy, paste, ship.",
};

export default function ComponentsPage() {
  const entries = getEntriesByType("registry:component");

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <IndexHeader
        eyebrow="Components"
        title="Animated components"
        description="Production-ready animated components. Tune them in the playground, copy the source, ship them anywhere."
      />
      <div className="mt-12">
        <EntryGrid entries={entries} basePath="/components" />
      </div>
    </div>
  );
}

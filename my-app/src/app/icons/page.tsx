import type { Metadata } from "next";
import { getEntriesByType } from "@/lib/registry";
import { EntryGrid, IndexHeader } from "@/components/site/entry-grid";

export const metadata: Metadata = {
  title: "Icons",
  description: "Animated SVG icons for React. Each with its own intentional motion.",
};

export default function IconsPage() {
  const entries = getEntriesByType("registry:icon");

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <IndexHeader
        eyebrow="Icons"
        title="Animated SVG icons"
        description="Every icon has its own intentional animation. Copy them into your project and they just work."
      />
      <div className="mt-12">
        <EntryGrid entries={entries} basePath="/icons" />
      </div>
    </div>
  );
}

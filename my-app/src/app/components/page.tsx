import type { Metadata } from "next";
import { getEntriesByType } from "@/lib/registry";
import { EntryGrid, IndexHeader } from "@/components/site/entry-grid";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Animated React Components",
  description:
    "17 free animated React components built on Motion and Tailwind CSS v4 — typewriter text, magnetic buttons, tilt cards, spotlight cards, animated tabs and more. Copy, paste, ship.",
  path: "/components",
  keywords: [
    "animated react components",
    "react animation components",
    "copy paste react components",
    "framer motion components",
    "tailwind animation components",
    "react ui components",
  ],
});

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

import type { Metadata } from "next";
import { getEntriesByType } from "@/lib/registry";
import { EntryGrid, IndexHeader } from "@/components/site/entry-grid";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Animated SVG Icons for React",
  description:
    "18 free animated SVG icons for React that ship as source — heart, bell, check, menu, sun/moon and more. Each has its own intentional motion with reduced-motion support. Copy and paste, no dependencies.",
  path: "/icons",
  keywords: [
    "animated svg icons react",
    "animated icons react",
    "react icon library",
    "svg icon animation",
    "framer motion icons",
    "copy paste react icons",
  ],
});

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

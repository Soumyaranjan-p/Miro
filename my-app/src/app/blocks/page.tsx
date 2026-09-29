import type { Metadata } from "next";
import { getEntriesByType } from "@/lib/registry";
import { EntryGrid, IndexHeader } from "@/components/site/entry-grid";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Animated UI Blocks for React",
  description:
    "6 free animated UI blocks for React — hero sections, pricing tables, testimonials, feature showcases and CTAs. Complete website sections built from Mirro components with Motion and Tailwind CSS v4.",
  path: "/blocks",
  keywords: [
    "animated ui blocks",
    "react hero section",
    "react pricing section",
    "react landing page blocks",
    "tailwind ui blocks",
    "react sections copy paste",
  ],
});

export default function BlocksPage() {
  const entries = getEntriesByType("registry:block");

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <IndexHeader
        eyebrow="Blocks"
        title="Animated UI blocks"
        description="Complete, production-quality website sections built from Mirro components. Drop them into your next project."
      />
      <div className="mt-12">
        <EntryGrid entries={entries} basePath="/blocks" />
      </div>
    </div>
  );
}

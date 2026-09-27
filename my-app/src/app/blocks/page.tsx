import type { Metadata } from "next";
import { getEntriesByType } from "@/lib/registry";
import { EntryGrid, IndexHeader } from "@/components/site/entry-grid";

export const metadata: Metadata = {
  title: "Blocks",
  description: "Complete animated UI blocks for React. Heroes, showcases, pricing and more.",
};

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

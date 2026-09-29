import type { Metadata } from "next";
import { getRegistryEntry } from "@/lib/registry";
import { DetailPage } from "@/components/site/detail-page";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRegistryEntry(slug);
  if (!entry) {
    return pageMetadata({
      title: "Animated UI Block",
      description: "An animated UI block for React from the Mirro library.",
      path: `/blocks/${slug}`,
    });
  }
  return pageMetadata({
    title: `${entry.title} — Animated React UI Block`,
    description: `${entry.description} A free, copy-paste React section built from Mirro components with Motion and Tailwind CSS v4.`,
    path: `/blocks/${slug}`,
    keywords: [
      `${entry.title.toLowerCase()} react`,
      `${entry.name.replace(/-/g, " ")}`,
      "animated ui blocks",
      "react landing page sections",
      ...entry.categories.map((c) => `react ${c.replace("/", " ")}`),
    ],
  });
}

export default async function BlockDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DetailPage name={slug} type="registry:block" />;
}

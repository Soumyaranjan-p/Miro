import type { Metadata } from "next";
import { getRegistryEntry } from "@/lib/registry";
import { DetailPage } from "@/components/site/detail-page";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRegistryEntry(slug);
  if (!entry) {
    return pageMetadata({
      title: "Animated React Icon",
      description: "An animated SVG icon for React from the Mirro library.",
      path: `/icons/${slug}`,
    });
  }
  return pageMetadata({
    title: `${entry.title} Icon — Animated SVG for React`,
    description: `${entry.description} Free animated ${entry.title.toLowerCase()} SVG icon for React and Tailwind, shipped as copy-paste source with reduced-motion support.`,
    path: `/icons/${slug}`,
    keywords: [
      `animated ${entry.title.toLowerCase()} icon`,
      `${entry.title.toLowerCase()} icon react`,
      "animated svg icons react",
      "react icon animation",
      ...entry.categories.map((c) => `react ${c} icons`),
    ],
  });
}

export default async function IconDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DetailPage name={slug} type="registry:icon" />;
}

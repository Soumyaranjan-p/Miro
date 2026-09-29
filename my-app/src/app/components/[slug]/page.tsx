import type { Metadata } from "next";
import { getRegistryEntry } from "@/lib/registry";
import { DetailPage } from "@/components/site/detail-page";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRegistryEntry(slug);
  if (!entry) {
    return pageMetadata({
      title: "Animated React Component",
      description: "An animated React component from the Mirro library.",
      path: `/components/${slug}`,
    });
  }
  return pageMetadata({
    title: `${entry.title} — Animated React Component`,
    description: `${entry.description} Free copy-paste React component built with Motion and Tailwind CSS v4, including props, accessibility notes and reduced-motion behaviour.`,
    path: `/components/${slug}`,
    keywords: [
      `${entry.name.replace(/-/g, " ")} react`,
      `${entry.title.toLowerCase()} react`,
      `${entry.title.toLowerCase()} component`,
      "animated react components",
      "copy paste react components",
      ...entry.categories.map((c) => `react ${c.replace("/", " ")}`),
    ],
  });
}

export default async function ComponentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DetailPage name={slug} type="registry:component" />;
}

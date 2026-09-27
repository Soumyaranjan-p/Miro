import type { Metadata } from "next";
import { getRegistryEntry } from "@/lib/registry";
import { DetailPage } from "@/components/site/detail-page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRegistryEntry(slug);
  return {
    title: entry?.title ?? "Block",
    description: entry?.description,
  };
}

export default async function BlockDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DetailPage name={slug} type="registry:block" />;
}

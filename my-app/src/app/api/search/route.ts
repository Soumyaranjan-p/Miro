import { NextResponse } from "next/server";
import { getRegistryEntries } from "@/lib/registry";

export const dynamic = "force-static";

interface SearchEntry {
  name: string;
  title: string;
  type: string;
  description: string;
  categories: string[];
}

let cached: SearchEntry[] | null = null;

export function GET() {
  if (!cached) {
    cached = getRegistryEntries().map((e) => ({
      name: e.name,
      title: e.title,
      type: e.type.replace("registry:", ""),
      description: e.description,
      categories: e.categories,
    }));
  }
  return NextResponse.json({ entries: cached });
}

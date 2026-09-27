import { NextResponse } from "next/server";
import { getRegistryEntries } from "@/lib/registry";

export const dynamic = "force-dynamic";

export function GET() {
  const entries = getRegistryEntries().map((e) => ({
    name: e.name,
    title: e.title,
    type: e.type.replace("registry:", ""),
    description: e.description,
    categories: e.categories,
  }));
  return NextResponse.json({ entries });
}

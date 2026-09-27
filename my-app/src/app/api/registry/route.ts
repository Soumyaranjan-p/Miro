import { NextResponse } from "next/server";
import { getRegistryEntries } from "@/lib/registry";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ entries: getRegistryEntries() });
}

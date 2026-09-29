import type { Metadata } from "next";
import { getRegistryEntries, type ControlSpec } from "@/lib/registry";
import { Playground, type PlaygroundEntry } from "@/components/site/playground";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Motion Playground",
  description:
    "Tune Mirro's animated React components live — adjust spring stiffness, easing, size and color, then copy the configured component code straight into your project.",
  path: "/playground",
  keywords: [
    "react animation playground",
    "motion playground",
    "animate react components online",
    "framer motion playground",
    "tailwind component playground",
  ],
});

export default function PlaygroundPage() {
  const entries: PlaygroundEntry[] = getRegistryEntries()
    .filter((e) => (e.playground?.length ?? 0) > 0)
    .map((e) => ({
      name: e.name,
      title: e.title,
      type: e.type,
      playground: e.playground as ControlSpec[],
    }));

  return <Playground entries={entries} />;
}

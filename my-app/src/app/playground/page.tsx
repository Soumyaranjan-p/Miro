import type { Metadata } from "next";
import { getRegistryEntries, type ControlSpec } from "@/lib/registry";
import { Playground, type PlaygroundEntry } from "@/components/site/playground";

export const metadata: Metadata = {
  title: "Playground",
  description: "Customize Mirro animations in real time and copy the configured code.",
};

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

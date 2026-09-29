import type { MetadataRoute } from "next";
import { getRegistryEntries } from "@/lib/registry";
import { SITE_URL } from "@/lib/seo";

type ChangeFrequency = "daily" | "weekly" | "monthly";

/**
 * Sitemap generated from the registry, so every icon/component/block detail
 * page is discoverable without maintaining a list by hand.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries = getRegistryEntries();

  const staticRoutes: { path: string; priority: number; freq: ChangeFrequency }[] = [
    { path: "/", priority: 1, freq: "weekly" },
    { path: "/components", priority: 0.9, freq: "weekly" },
    { path: "/icons", priority: 0.9, freq: "weekly" },
    { path: "/blocks", priority: 0.8, freq: "weekly" },
    { path: "/docs", priority: 0.7, freq: "monthly" },
    { path: "/playground", priority: 0.7, freq: "monthly" },
  ];

  const base = staticRoutes.map((route) => ({
    url: `${SITE_URL}${route.path === "/" ? "" : route.path}`,
    lastModified: new Date(),
    changeFrequency: route.freq,
    priority: route.priority,
  }));

  const segmentFor = (type: string): string =>
    type === "registry:icon" ? "icons" : type === "registry:block" ? "blocks" : "components";

  const entryRoutes = entries
    // Only user-facing entry types have detail pages.
    .filter((entry) => entry.type !== "registry:lib")
    .map((entry) => ({
      url: `${SITE_URL}/${segmentFor(entry.type)}/${entry.name}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [...base, ...entryRoutes];
}

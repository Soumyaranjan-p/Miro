import type { Metadata } from "next";

/**
 * Single source of truth for site-level SEO. The canonical origin can be
 * overridden per deployment via NEXT_PUBLIC_SITE_URL.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mirro-ui.com"
).replace(/\/$/, "");

export const SITE_NAME = "Mirro";

export const SITE_TAGLINE = "Motion for modern interfaces";

export const SITE_DESCRIPTION =
  "Mirro is a free, open-source React animation library of copy-paste components, animated SVG icons and UI blocks. Built for React 19, Tailwind CSS v4 and Motion — install with npx mirro-ui add.";

/**
 * Core keyword set. Mirro cannot win the generic head terms ("react ui
 * library" is owned by MUI/Chakra/shadcn), so the primary targets are the
 * effect-name mid-tail terms its components actually satisfy, plus the
 * distribution-model terms (copy-paste, shadcn-style CLI, Tailwind v4).
 */
export const CORE_KEYWORDS = [
  // Category + distribution model (the realistic head terms)
  "react animation library",
  "animated react components",
  "copy paste react components",
  "tailwind animation library",
  "react motion components",
  "open source react ui components",
  // Effect-name mid-tail — one per shipped component/icon
  "typewriter text react",
  "scramble text animation",
  "text reveal animation",
  "blur text react",
  "gradient text react",
  "magnetic button react",
  "shimmer button react",
  "ripple button react",
  "border beam button",
  "gradient button react",
  "spotlight card react",
  "tilt card react",
  "flip card react",
  "animated accordion react",
  "animated tabs react",
  "animated checkbox react",
  "animated svg icons react",
  // Stack qualifiers
  "framer motion components",
  "motion react components",
  "tailwind css v4 components",
  "react 19 components",
  "shadcn cli components",
];

export interface PageSeoOptions {
  title: string;
  description: string;
  /** Path beginning with "/" — used for the canonical URL. */
  path: string;
  keywords?: string[];
  type?: "website" | "article";
  /** Omit the "%s — Mirro" template (used by the home page). */
  absoluteTitle?: boolean;
}

/**
 * Builds consistent per-page metadata: canonical URL, Open Graph, Twitter
 * card and keywords. Every indexable route should use this so canonicals and
 * social cards never drift apart.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  type = "website",
  absoluteTitle = false,
}: PageSeoOptions): Metadata {
  const url = `${SITE_URL}${path === "/" ? "" : path}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

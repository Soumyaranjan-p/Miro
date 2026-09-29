import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryEntry, type RegistryType } from "@/lib/registry";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { ComponentDetail } from "./component-detail";

const SEGMENT: Record<string, string> = {
  "registry:icon": "icons",
  "registry:component": "components",
  "registry:block": "blocks",
};

export function DetailPage({ name, type }: { name: string; type: RegistryType }) {
  const entry = getRegistryEntry(name);

  if (!entry || entry.type !== type) {
    notFound();
  }

  // Structured data so each entry can surface as a rich result for its own
  // effect-name query (e.g. "typewriter text react").
  const segment = SEGMENT[type] ?? "components";
  const url = `${SITE_URL}/${segment}/${entry.name}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        name: `${entry.title} — ${SITE_NAME}`,
        description: entry.description,
        url,
        codeRepository: "https://github.com/mirro-ui/mirro",
        programmingLanguage: "TypeScript",
        runtimePlatform: "React",
        license: "https://opensource.org/licenses/MIT",
        keywords: entry.categories.join(", "),
        author: { "@type": "Person", name: "Saroz" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: segment === "icons" ? "Icons" : segment === "blocks" ? "Blocks" : "Components",
            item: `${SITE_URL}/${segment}`,
          },
          { "@type": "ListItem", position: 3, name: entry.title, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ComponentDetail entry={entry} />
    </>
  );
}

export function NotFoundMessage({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-foreground">Not found</h1>
      <p className="mt-3 text-muted-foreground">
        &quot;{name}&quot; isn&apos;t in the registry yet.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
      >
        Back to home
      </Link>
    </div>
  );
}

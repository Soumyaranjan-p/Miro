import Link from "next/link";
import type { RegistryEntry } from "@/lib/registry";

export function IndexHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{title}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function EntryGrid({ entries, basePath }: { entries: RegistryEntry[]; basePath: string }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-20 text-center">
        <p className="text-sm text-muted-foreground">Nothing here yet — check back soon.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <Link
          key={entry.name}
          href={`${basePath}/${entry.name}`}
          className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/20"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-foreground">{entry.title}</h3>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{entry.description}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {entry.categories.slice(0, 3).map((cat) => (
              <span key={cat} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {cat}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

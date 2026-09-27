import Link from "next/link";
import type { RegistryEntry } from "@/lib/registry";

function SoonCard({ name }: { name: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-dashed border-border p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{name}</span>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          soon
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">In the workshop.</p>
    </div>
  );
}

export function ShowcaseSection({
  eyebrow,
  title,
  description,
  entries,
  basePath,
  soonNames,
}: {
  eyebrow: string;
  title: string;
  description: string;
  entries: RegistryEntry[];
  basePath: string;
  soonNames: string[];
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Link
          href={basePath}
          className="group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
        >
          View all
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          </Link>
        ))}
        {soonNames.map((name) => (
          <SoonCard key={name} name={name} />
        ))}
      </div>
    </section>
  );
}

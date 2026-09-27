import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryEntry, type RegistryType } from "@/lib/registry";
import { ComponentDetail } from "./component-detail";

export function DetailPage({ name, type }: { name: string; type: RegistryType }) {
  const entry = getRegistryEntry(name);

  if (!entry || entry.type !== type) {
    notFound();
  }

  return <ComponentDetail entry={entry} />;
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

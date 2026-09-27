"use client";

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import type { RegistryEntry } from "@/lib/registry";
import { CodeTabs } from "./code-block";
import { ControlPanel, coerceControlValue, type ControlValues } from "../previews/control-panel";
import { previews } from "../previews";

function defaultValues(entry: RegistryEntry): ControlValues {
  const values: ControlValues = {};
  for (const spec of entry.playground ?? []) {
    values[spec.key] = spec.default;
  }
  return values;
}

function InstallCommand({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const cmd = `npx mirro-ui add ${name}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="code-theme flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <code className="font-mono text-sm text-zinc-300">
        <span className="text-zinc-500">$ </span>
        {cmd}
      </code>
      <button
        type="button"
        onClick={copy}
        className="ml-4 shrink-0 font-mono text-xs text-zinc-400 transition-colors duration-150 ease-out hover:text-zinc-200"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

export function ComponentDetail({ entry }: { entry: RegistryEntry }) {
  const [values, setValues] = useState<ControlValues>(() => defaultValues(entry));
  const hasControls = (entry.playground?.length ?? 0) > 0;

  const files = useMemo(
    () =>
      entry.files.map((f) => ({
        name: f.path.split("/").pop() ?? f.path,
        code: f.content,
        language: f.path.endsWith(".css") ? "css" : f.path.endsWith(".json") ? "json" : "tsx",
      })),
    [entry]
  );

  const typeLabel = entry.type.replace("registry:", "");

  return (
    <div>
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">Mirro</Link>
        <span>/</span>
        <Link
          href={typeLabel === "icon" ? "/icons" : typeLabel === "block" ? "/blocks" : "/components"}
          className="transition-colors hover:text-foreground"
        >
          {typeLabel === "icon" ? "Icons" : typeLabel === "block" ? "Blocks" : "Components"}
        </Link>
        <span>/</span>
        <span className="text-foreground">{entry.name}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{entry.title}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{entry.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {entry.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Preview</span>
              <span className="font-mono text-[11px] text-muted-foreground">live</span>
            </div>
            <div className="dot-grid flex min-h-[280px] items-center justify-center bg-muted/40 p-8">
              {previews[entry.name] ? (
                createElement(previews[entry.name].component, { controls: values })
              ) : (
                <p className="text-sm text-muted-foreground">Preview not available.</p>
              )}
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle>Code</SectionTitle>
            <div className="mt-3">
              <CodeTabs files={files} />
            </div>
          </div>

          {entry.props && entry.props.length > 0 && (
            <div className="mt-10">
              <SectionTitle>Props</SectionTitle>
              <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Prop</th>
                      <th className="px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Default</th>
                      <th className="px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.props.map((prop) => (
                      <tr key={prop.name} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 font-mono text-[13px] text-accent">{prop.name}</td>
                        <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">{prop.type}</td>
                        <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">{prop.default ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{prop.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-8">
          <div>
            <SectionTitle>Install</SectionTitle>
            <div className="mt-3">
              <InstallCommand name={entry.name} />
            </div>
          </div>

          {hasControls && (
            <div>
              <SectionTitle>Customize</SectionTitle>
              <div className="mt-3 rounded-xl border border-border p-4">
                <ControlPanel
                  specs={entry.playground ?? []}
                  values={values}
                  onChange={(key, value) => {
                    const spec = (entry.playground ?? []).find((s) => s.key === key);
                    setValues((prev) => ({ ...prev, [key]: spec ? coerceControlValue(spec, value) : value }));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setValues(defaultValues(entry))}
                  className="mt-5 w-full rounded-md border border-border py-2 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          )}

          {entry.accessibility && (
            <div>
              <SectionTitle>Accessibility</SectionTitle>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.accessibility}</p>
            </div>
          )}

          {entry.reducedMotion && (
            <div>
              <SectionTitle>Reduced motion</SectionTitle>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.reducedMotion}</p>
            </div>
          )}

          {entry.touch && (
            <div>
              <SectionTitle>Touch & mobile</SectionTitle>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.touch}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

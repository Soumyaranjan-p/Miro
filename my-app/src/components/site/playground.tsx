"use client";

import { useState, createElement } from "react";
import type { ControlSpec } from "@/lib/registry";
import { ControlPanel, coerceControlValue, type ControlValues } from "../previews/control-panel";
import { previews, getPreviewDefinition } from "../previews";
import { CodeBlock } from "./code-block";

export interface PlaygroundEntry {
  name: string;
  title: string;
  type: string;
  playground: ControlSpec[];
}

function defaultValues(entry: PlaygroundEntry): ControlValues {
  const values: ControlValues = {};
  for (const spec of entry.playground ?? []) {
    values[spec.key] = spec.default;
  }
  return values;
}

export function Playground({ entries }: { entries: PlaygroundEntry[] }) {
  const [activeName, setActiveName] = useState<string | null>(entries[0]?.name ?? null);
  const [values, setValues] = useState<ControlValues>(() =>
    entries[0] ? defaultValues(entries[0]) : {}
  );
  const [copied, setCopied] = useState(false);

  const active = entries.find((e) => e.name === activeName) ?? null;
  const definition = active ? getPreviewDefinition(active.name) : null;

  const generatedCode =
    active && definition?.generateCode
      ? definition.generateCode(values)
      : active
        ? `// ${active.title}`
        : "";

  const selectEntry = (name: string) => {
    const entry = entries.find((e) => e.name === name);
    if (!entry) return;
    setActiveName(name);
    setValues(defaultValues(entry));
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">Playground</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">Animation playground</h1>
        <div className="mt-12 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">No customizable components yet — check back soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">Playground</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">Tune the motion</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Adjust the controls and watch the animation update in real time. Copy the configured code when it feels right.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {entries.map((entry) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => selectEntry(entry.name)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors duration-150 ease-out ${
              entry.name === activeName
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.title}
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Preview</span>
                <span className="font-mono text-[11px] text-muted-foreground">live</span>
              </div>
              <div className="dot-grid flex min-h-[320px] items-center justify-center bg-muted/40 p-8">
                {previews[active.name] ? (
                  createElement(previews[active.name].component, { controls: values })
                ) : (
                  <p className="text-sm text-muted-foreground">No preview.</p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Configured code
                </span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <CodeBlock code={generatedCode} language="tsx" filename={`${active.name}.tsx`} />
            </div>
          </div>

          <aside>
            <div className="rounded-xl border border-border p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Controls
                </span>
                <button
                  type="button"
                  onClick={() => setValues(defaultValues(active))}
                  className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reset
                </button>
              </div>
              <ControlPanel
                specs={active.playground ?? []}
                values={values}
                onChange={(key, value) => {
                  const spec = (active.playground ?? []).find((s) => s.key === key);
                  setValues((prev) => ({ ...prev, [key]: spec ? coerceControlValue(spec, value) : value }));
                }}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

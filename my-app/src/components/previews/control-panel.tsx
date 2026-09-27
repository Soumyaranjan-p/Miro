"use client";

import type { ControlSpec } from "@/lib/registry";

export type ControlValues = Record<string, string | number | boolean>;

export function coerceControlValue(spec: ControlSpec, value: string | number | boolean): string | number | boolean {
  if (spec.type === "slider") return Number(value);
  if (spec.type === "toggle") return Boolean(value);
  return String(value);
}

export function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "255, 77, 41";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

interface ControlPanelProps {
  specs: ControlSpec[];
  values: ControlValues;
  onChange: (key: string, value: string | number | boolean) => void;
}

export function ControlPanel({ specs, values, onChange }: ControlPanelProps) {
  if (specs.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {specs.map((spec) => {
        const value = values[spec.key];

        if (spec.type === "slider") {
          const num = Number(value);
          return (
            <div key={spec.key}>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor={`ctrl-${spec.key}`} className="text-sm text-foreground">
                  {spec.label}
                </label>
                <span className="font-mono text-xs text-muted-foreground">{num}</span>
              </div>
              <input
                id={`ctrl-${spec.key}`}
                type="range"
                min={spec.min ?? 0}
                max={spec.max ?? 100}
                step={spec.step ?? 1}
                value={num}
                onChange={(e) => onChange(spec.key, Number(e.target.value))}
                className="mirro-range w-full"
              />
            </div>
          );
        }

        if (spec.type === "select") {
          return (
            <div key={spec.key} className="flex items-center justify-between gap-4">
              <label htmlFor={`ctrl-${spec.key}`} className="text-sm text-foreground">
                {spec.label}
              </label>
              <select
                id={`ctrl-${spec.key}`}
                value={String(value)}
                onChange={(e) => onChange(spec.key, e.target.value)}
                className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm text-foreground outline-none"
              >
                {spec.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (spec.type === "color") {
          const raw = String(value);
          const pickerValue = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "#808080";
          return (
            <div key={spec.key} className="flex items-center justify-between gap-4">
              <label htmlFor={`ctrl-${spec.key}`} className="text-sm text-foreground">
                {spec.label}
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{raw}</span>
                <input
                  id={`ctrl-${spec.key}`}
                  type="color"
                  value={pickerValue}
                  onChange={(e) => onChange(spec.key, e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
              </div>
            </div>
          );
        }

        if (spec.type === "toggle") {
          return (
            <div key={spec.key} className="flex items-center justify-between gap-4">
              <label htmlFor={`ctrl-${spec.key}`} className="text-sm text-foreground">
                {spec.label}
              </label>
              <button
                id={`ctrl-${spec.key}`}
                type="button"
                role="switch"
                aria-checked={Boolean(value)}
                onClick={() => onChange(spec.key, !value)}
                className={`relative w-10 rounded-full transition-colors duration-200 ease-out ${
                  value ? "bg-accent" : "bg-muted"
                }`}
                style={{ height: 22 }}
              >
                <span
                  className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200 ease-out ${
                    value ? "translate-x-[20px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

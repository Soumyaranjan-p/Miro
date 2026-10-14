import type { ReactNode } from "react";

export function Section({
  title,
  description,
  children,
  icon,
  aside,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="miro-card px-4 py-3.5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {icon && <span className="mt-0.5 text-faint">{icon}</span>}
          <div>
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description && <p className="mt-0.5 max-w-[52ch] text-[12px] leading-[1.5] text-muted">{description}</p>}
          </div>
        </div>
        {aside}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5">
        <div>
          <div className="text-[12.5px] font-medium text-ink">{label}</div>
          {hint && <div className="mt-0.5 text-[11.5px] leading-[1.5] text-muted">{hint}</div>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 max-w-[46ch] text-[11.5px] leading-[1.5] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-150 ${
        checked ? "border-transparent bg-accent" : "border-line bg-surface-2"
      } ${disabled ? "opacity-45" : "cursor-pointer"}`}
    >
      <span
        className={`ml-[2px] block h-[16px] w-[16px] rounded-full shadow-sm transition-transform duration-150 ${
          checked ? "translate-x-[16px] bg-accent-ink" : "translate-x-0 bg-surface"
        }`}
        style={checked ? undefined : { border: "1px solid var(--miro-line-strong)" }}
      />
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-[10px] border border-line bg-surface-2 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`h-[26px] rounded-[8px] px-2.5 text-[12px] font-medium transition-colors duration-120 ${
              active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            } ${option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  size = "md",
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "ghost" | "danger";
  disabled?: boolean;
  size?: "md" | "sm";
  title?: string;
}) {
  const variantClass =
    variant === "primary" ? "miro-btn-primary" : variant === "ghost" ? "miro-btn-ghost" : "";
  const dangerStyle = variant === "danger" ? { color: "var(--miro-danger)" } : undefined;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={dangerStyle}
      className={`miro-btn ${size === "sm" ? "miro-btn-sm" : ""} ${variantClass}`}
    >
      {children}
    </button>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const palette = {
    info: { bg: "var(--miro-track)", fg: "var(--miro-ink)" },
    warn: { bg: "var(--miro-warn-soft)", fg: "var(--miro-warn)" },
    danger: { bg: "var(--miro-danger-soft)", fg: "var(--miro-danger)" },
    success: { bg: "var(--miro-success-soft)", fg: "var(--miro-success)" },
  }[tone];

  return (
    <div className="flex items-start gap-3 rounded-[10px] px-3 py-2" style={{ background: palette.bg }}>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold" style={{ color: palette.fg }}>
          {title}
        </div>
        {children && <div className="mt-0.5 text-[11.5px] leading-[1.55] text-muted">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "neutral" | "success" | "warn" | "danger" | "accent";
  children: ReactNode;
  title?: string;
}) {
  const palette = {
    neutral: { bg: "var(--miro-track)", fg: "var(--miro-muted)" },
    success: { bg: "var(--miro-success-soft)", fg: "var(--miro-success)" },
    warn: { bg: "var(--miro-warn-soft)", fg: "var(--miro-warn)" },
    danger: { bg: "var(--miro-danger-soft)", fg: "var(--miro-danger)" },
    accent: { bg: "var(--miro-accent-soft)", fg: "var(--miro-accent)" },
  }[tone];
  return (
    <span className="miro-chip" title={title} style={{ background: palette.bg, color: palette.fg }}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className="h-[6px] w-full overflow-hidden rounded-full bg-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="miro-keys text-muted">{children}</span>;
}

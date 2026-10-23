import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStats } from "../../lib/hooks";
import { Banner, Pill } from "../settings/Controls";

/**
 * The Statistics page: every number comes from local aggregates only, drawn
 * dark with the app's ember accent. No network, no history of text — the day
 * buckets carry counts and durations, nothing else.
 */
export function PageStatistics() {
  const { stats, error } = useStats(20_000);

  const days = useMemo(() => stats?.days ?? [], [stats]);

  const barData = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        label: day.date.slice(5),
        wpm: day.speechMs > 0 ? Math.round((day.words / day.speechMs) * 60_000) : 0,
      })),
    [days],
  );

  const modeData = useMemo(() => {
    const normal = (stats?.normalMs ?? 0) / 3_600_000;
    const incident = (stats?.incidentMs ?? 0) / 3_600_000;
    if (normal <= 0 && incident <= 0) return [];
    return [
      { name: "Normal mode", value: normal, color: "#f28c3b" },
      { name: "Incident mode", value: incident, color: "#e5484d" },
    ];
  }, [stats]);

  const wpm = stats?.wordsPerMinute ?? null;
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];

  if (error) {
    return (
      <div className="msh-page">
        <header className="msh-page__head">
          <h1>Statistics</h1>
          <p>The numbers could not be read.</p>
        </header>
        <Banner tone="danger" title="Stats file refused">
          {error}
        </Banner>
      </div>
    );
  }

  return (
    <div className="msh-page">
      <header className="msh-page__head">
        <h1>Statistics</h1>
        <p>
          Everything counted here is numeric: how much you dictated, how fast you spoke, and where the app spent its
          time. Words are counted, never kept.
        </p>
      </header>

      <div className="msh-kpis">
        <Kpi value={stats ? String(stats.totalDictations) : "\u2013"} label="dictations" />
        <Kpi value={stats ? String(stats.totalWords) : "\u2013"} label="words dictated" />
        <Kpi value={wpm === null ? "\u2013" : wpm.toFixed(0)} label="words / minute" />
        <Kpi
          value={stats ? (stats.streakDays > 0 ? `${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}` : "\u2013") : "\u2013"}
          label="current streak"
        />
      </div>

      <section className="miro-card px-4 py-3.5">
        <ChartHead
          title="Dictations per day"
          hint={today ? `Today: ${today.dictations}${yesterday ? ` \u00b7 yesterday: ${yesterday.dictations}` : ""}` : undefined}
        />
        <div className="msh-chart">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="msh-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f28c3b" />
                    <stop offset="100%" stopColor="#c75f1d" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--miro-line)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                <Tooltip content={DictationTooltip} cursor={{ fill: "var(--miro-line)", opacity: 0.35 }} />
                <Bar dataKey="dictations" fill="url(#msh-bar)" radius={[6, 6, 2, 2]} maxBarSize={26} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Dictate once and the first bar appears here." />
          )}
        </div>
      </section>

      <div className="msh-grid">
        <section className="miro-card px-4 py-3.5">
          <ChartHead title="Words over time" hint="Per-day totals" />
          <div className="msh-chart">
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={barData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="msh-words" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f28c3b" stopOpacity={0.45} />
                      <stop offset="90%" stopColor="#f28c3b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--miro-line)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={WordsTooltip} />
                  <Area
                    type="monotone"
                    dataKey="words"
                    stroke="#f28c3b"
                    strokeWidth={2}
                    fill="url(#msh-words)"
                    dot={false}
                    activeDot={{ r: 3.5, fill: "#f28c3b", stroke: "var(--miro-bg)" }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Words show up after the first dictation." />
            )}
          </div>
        </section>

        <section className="miro-card px-4 py-3.5">
          <ChartHead title="Words per minute" hint="Speaking speed by day" />
          <div className="msh-chart">
            {barData.some((day) => day.wpm > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={barData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--miro-line)" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={WpmTooltip} />
                  <Area
                    type="monotone"
                    dataKey="wpm"
                    stroke="#8f9d8f"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    fill="transparent"
                    dot={{ r: 2, fill: "#8f9d8f", strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Words per minute shows once speech length is known." />
            )}
          </div>
        </section>
      </div>

      <section className="miro-card px-4 py-3.5">
        <ChartHead
          title="Time spent by mode"
          hint="Aggregated first-class, from when Miro was running"
        />
        <div className="msh-chart-sm">
          {modeData.length > 0 ? (
            <>
              <ResponsiveContainer width="46%" height="100%">
                <PieChart>
                  <Tooltip content={ModeTooltip} />
                  <Pie
                    data={modeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    strokeWidth={2}
                    stroke="var(--miro-bg)"
                    isAnimationActive={false}
                  >
                    {modeData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {modeData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 text-[12px] text-muted">
                    <span
                      aria-hidden
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 3,
                        background: entry.color,
                        display: "inline-block",
                      }}
                    />
                    {entry.name}
                    <Pill tone="neutral">{formatHours(entry.value)}</Pill>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart text="Mode time appears after Miro has run a while." />
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="msh-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChartHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
    </header>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div
      className="flex h-full items-center justify-center rounded-[10px] border border-dashed text-[12px] text-faint"
      style={{ borderColor: "var(--miro-line)" }}
    >
      {text}
    </div>
  );
}

const AXIS_TICK = { fill: "var(--miro-faint)", fontSize: 10.5 };

/** Thin dark tooltips: the default Recharts one is white and loud. */
function TooltipFrame({ rows, title }: { title?: string; rows: Array<[string, string]> }) {
  return (
    <div
      className="rounded-[8px] border px-2.5 py-2 text-[11.5px] leading-[1.6]"
      style={{
        background: "var(--miro-surface)",
        borderColor: "var(--miro-line-strong)",
        color: "var(--miro-ink)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
      {rows.map(([key, value]) => (
        <div key={key}>
          <span className="text-muted">{key}: </span>
          <span className="miro-keys">{value}</span>
        </div>
      ))}
    </div>
  );
}

type TooltipEntry = {
  readonly value?: unknown;
  readonly name?: unknown;
  readonly payload?: Record<string, unknown>;
};
type TooltipProps = { active?: boolean; payload?: readonly TooltipEntry[] };

function DictationTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length || !payload[0]) return null;
  const day = payload[0].payload as { date: string; dictations: number; words: number };
  return (
    <TooltipFrame
      title={day.date}
      rows={[
        ["Dictations", String(day.dictations)],
        ["Words", String(day.words)],
      ]}
    />
  );
}

function WordsTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length || !payload[0]) return null;
  const day = payload[0].payload as { date: string; words: number };
  return <TooltipFrame title={day.date} rows={[["Words", String(day.words)]]} />;
}

function WpmTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length || !payload[0]) return null;
  const day = payload[0].payload as { date: string; wpm: number };
  return <TooltipFrame title={day.date} rows={[["Words per minute", String(day.wpm)]]} />;
}

function ModeTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length || !payload[0]) return null;
  const entry = payload[0];
  const name = typeof entry.name === "string" ? entry.name : "";
  const value = typeof entry.value === "number" ? entry.value : 0;
  return <TooltipFrame title={name} rows={[["Time in mode", formatHours(value)]]} />;
}

function formatHours(hours: number): string {
  if (hours >= 100) {
    return `${Math.round(hours)} h`;
  }
  if (hours >= 1) {
    return `${hours.toFixed(1)} h`;
  }
  const minutes = Math.max(1, Math.round(hours * 60));
  return `${minutes} min`;
}

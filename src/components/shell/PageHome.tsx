import { useCallback, useEffect, useState } from "react";
import { errorText } from "../../lib/errors";
import { formatShortcut } from "../../lib/format";
import { useLevelHistory, useMicLevel, useModelProgress, useRuntimeStatus, useSettings, useStats } from "../../lib/hooks";
import { EVENTS, asOverlayState, ipc } from "../../lib/ipc";
import type { OverlayState } from "../../lib/types";
import { LiveFox, type FoxState } from "./LiveFox";
import { IconCheck, IconHome, IconIncident } from "./Icons";
import { Button, Mono, Pill } from "../settings/Controls";

/**
 * The Home page: greeting + the fox, mode selection, the transcript panel
 * (the one place words are allowed to appear, by deliberate design decision),
 * the model card so downloads never need digging through settings, and the
 * numbers that make the streak visible.
 */
export function PageHome({
  greeting,
  onNavigateToStatistics,
}: {
  greeting: string;
  onNavigateToStatistics: () => void;
}) {
  const { settings } = useSettings();
  const { status } = useRuntimeStatus();
  const { stats } = useStats();
  const [overlay, setOverlay] = useState<OverlayState>({ kind: "hidden" });

  useEffect(() => {
    const off = ipc.on<unknown>(EVENTS.overlay, (payload) => setOverlay(asOverlayState(payload)));
    return off;
  }, []);

  const incidentMode = settings?.homeMode === "intent";
  const recording = overlay.kind === "recording";
  const dictation = status?.hotkeys.find((entry) => entry.role === "dictation");

  const foxState: FoxState = incidentMode
    ? "incident"
    : recording
      ? "listening"
      : overlay.kind === "processing"
        ? "processing"
        : overlay.kind === "error"
          ? "error"
          : "normal";
  const level = useMicLevel(recording && !incidentMode);

  return (
    <div className="msh-page">
      <Hero
        greeting={greeting}
        foxState={foxState}
        level={level}
        incidentMode={incidentMode}
        shortcut={settings?.shortcut}
        registered={dictation?.registered ?? false}
      />

      <ModeCard incidentActive={incidentMode} />

      <section className="miro-card px-4 py-3.5">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Transcript</h2>
            <p className="mt-0.5 max-w-[52ch] text-[12px] leading-[1.5] text-muted">
              {"Hold "}
              <Mono>{settings ? formatShortcut(settings.shortcut) : "the dictation key"}</Mono>
              {" anywhere, speak, and let go. The words appear here and can go straight into the app you were typing in."}
            </p>
          </div>
          {status?.engine.state === "ready" || status?.engine.state === "loading" ? (
            <Pill tone={status.engine.state === "ready" ? "success" : "warn"}>
              {status.engine.state === "ready" ? "Model ready" : "Loading model"}
            </Pill>
          ) : null}
        </header>
        <TranscriptBody overlay={overlay} />
      </section>

      <section className="msh-grid">
        <ModelDownloadCard />
        <StatsCard stats={stats} streak={stats?.streakDays ?? 0} onOpenStatistics={onNavigateToStatistics} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({
  greeting,
  foxState,
  level,
  incidentMode,
  shortcut,
  registered,
}: {
  greeting: string;
  foxState: FoxState;
  level: number;
  incidentMode: boolean;
  shortcut: string | undefined;
  registered: boolean;
}) {
  return (
    <section className="msh-hero">
      <HeroFox foxState={foxState} level={level} />
      <div className="msh-hero__body">
        <h1>{greeting}</h1>
        <p>
          {incidentMode ? (
            <>Incident mode is on: dictation is paused and the fox is on guard.</>
          ) : registered ? (
            <>
              Hold <Mono>{shortcut ? formatShortcut(shortcut) : "the dictation key"}</Mono> in any app, speak, release —
              Miro types for you.
            </>
          ) : (
            <>The dictation key could not be registered. Open Shortcuts to pick another one.</>
          )}
        </p>
      </div>
    </section>
  );
}

function HeroFox({ foxState, level }: { foxState: FoxState; level: number }) {
  return (
    <div style={{ flex: "none", width: 116, height: 116 }}>
      <LiveFox size={116} state={foxState} level={level} trackMouse />
    </div>
  );
}

/* ------------------------------------------------------------------ modes */

function ModeCard({ incidentActive }: { incidentActive: boolean }) {
  const [pending, setPending] = useState(false);

  const switchTo = useCallback(async (mode: "home" | "intent") => {
    setPending(true);
    try {
      await ipc.switchMode(mode);
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <section className="miro-card px-4 py-3.5">
      <header className="mb-3">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Mode</h2>
        <p className="mt-0.5 text-[12px] leading-[1.5] text-muted">
          Global, and switchable from the keyboard with the mode hotkeys on the Shortcuts page.
        </p>
      </header>
      <div className="msh-modes">
        <button
          type="button"
          className={`msh-mode${incidentActive ? "" : " is-active"}`}
          disabled={pending || !incidentActive || undefined}
          onClick={() => void switchTo("home")}
          aria-pressed={!incidentActive}
        >
          <span className="msh-mode__name">
            <IconHome /> Normal mode
          </span>
          <span className="msh-mode__desc">
            Dictation as it lives: hold the key, speak, release, words land where you type.
          </span>
        </button>
        <button
          type="button"
          className={`msh-mode${incidentActive ? " is-active is-incident" : ""}`}
          disabled={pending || incidentActive || undefined}
          onClick={() => void switchTo("intent")}
          aria-pressed={incidentActive}
        >
          {incidentActive && <span className="msh-mode__check"><IconCheck /></span>}
          <span className="msh-mode__name">
            <IconIncident /> Incident mode
          </span>
          <span className="msh-mode__desc">
            For on-call focus: dictation paused so nothing interrupts you, statistics keep running, switch back with one
            tap.
          </span>
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- transcript */

function TranscriptBody({ overlay }: { overlay: OverlayState }) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const retryId = overlay.kind === "inserted" || overlay.kind === "error" ? (overlay.retryId ?? null) : null;

  useEffect(() => {
    if (retryId === null) {
      setTranscript(null);
      setMeta(null);
      setError(null);
      return;
    }
    let cancelled = false;
    void ipc
      .getPendingTranscript(retryId)
      .then((text) => {
        if (!cancelled) {
          setTranscript(text);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setTranscript(null);
          setError(errorText(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryId]);

  if (overlay.kind === "recording") {
    return (
      <div className="msh-transcript">
        <RecordingWave />
        <div className="text-[12px] text-muted">{"Listening\u2026 hold the keys and speak."}</div>
      </div>
    );
  }

  if (overlay.kind === "processing") {
    return (
      <div className="msh-transcript">
        <div className="msh-transcript__text is-placeholder">{"Transcribing\u2026"}</div>
      </div>
    );
  }

  if (overlay.kind === "error" && !transcript) {
    return (
      <div className="msh-transcript">
        <div className="text-[12.5px] leading-[1.55] text-danger">
          {overlay.code === "model_missing"
            ? "No speech model is installed yet. Download one below, then dictate again."
            : overlay.code === "mic_permission_denied"
              ? "Windows is blocking the microphone: Settings > Privacy > Microphone."
              : overlay.code === "mic_missing" || overlay.code === "mic_disconnected"
                ? "No microphone is reachable. Plug one in, or pick another on Shortcuts."
                : (overlay.detail ?? "Dictation failed this once — try again.")}
        </div>
      </div>
    );
  }

  if (transcript === null && !error) {
    return (
      <div className="msh-transcript">
        <div className="msh-transcript__text is-placeholder">{"Nothing yet. Your last dictation lands here."}</div>
      </div>
    );
  }

  // Copy goes through Rust first: the pending text lives in memory there and
  // the clipboard is restored afterwards. The webview clipboard is the
  // fallback when the command is gone (retry window expired while reading).
  const copy = async () => {
    if (transcript === null) return;
    setBusy(true);
    try {
      if (retryId !== null) {
        await ipc.copyPendingTranscript(retryId);
      } else {
        await navigator.clipboard.writeText(transcript);
      }
      setMeta("Copied to the clipboard");
    } catch {
      try {
        await navigator.clipboard.writeText(transcript);
        setMeta("Copied to the clipboard");
      } catch {
        setError("The clipboard refused the text. Select it and copy manually.");
      }
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    if (retryId === null) return;
    setBusy(true);
    setError(null);
    try {
      await ipc.pastePending(retryId);
      setMeta("Typed into the active app");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="msh-transcript">
      {error ? (
        <div className="text-[12px] text-danger">{error}</div>
      ) : (
        <div className="msh-transcript__text">{transcript}</div>
      )}
      <div className="msh-transcript__actions">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || retryId === null || transcript === null}
          onClick={() => void paste()}
        >
          Paste into the active app
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || retryId === null || transcript === null}
          onClick={() => void copy()}
        >
          Copy
        </Button>
        <span className="msh-transcript__meta">{meta}</span>
      </div>
    </div>
  );
}

function RecordingWave() {
  const frames = useLevelHistory(true, 28);
  return (
    <div className="msh-wave" aria-hidden>
      {frames.map((value, index) => (
        <span
          key={index}
          className="msh-wave__bar"
          style={{ height: `${Math.max(3, value * 100)}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ model */

function ModelDownloadCard() {
  const { status } = useRuntimeStatus(10_000);
  const progress = useModelProgress();
  const [models, setModels] = useState<{ id: string; name: string; sizeBytes: number | null }[]>([]);

  useEffect(() => {
    void ipc
      .listModels()
      .then((list) => setModels(list.map((m) => ({ id: m.id, name: m.name, sizeBytes: m.sizeBytes }))))
      .catch(() => setModels([]));
  }, []);

  const engine = status?.engine;
  const current = models.find((model) => model.id === engine?.modelId);
  const downloading = progress?.status === "downloading" || progress?.status === "verifying";
  const fraction =
    progress && progress.totalBytes ? Math.min(1, progress.receivedBytes / progress.totalBytes) : 0;

  return (
    <section className="miro-card px-4 py-3.5">
      <header className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Speech model</h2>
        <Pill
          tone={
            engine?.state === "ready" ? "success" : engine?.state === "failed" ? "danger" : "warn"
          }
        >
          {engine?.state === "ready"
            ? "Ready"
            : engine?.state === "loading"
              ? "Loading"
              : engine?.state === "failed"
                ? "Failed"
                : "No model"}
        </Pill>
      </header>
      <div className="text-[12px] text-muted">
        {current ? (
          <>
            {current.name}
            {current.sizeBytes !== null ? ` \u00b7 ${Math.round(current.sizeBytes / 1_000_000)} MB` : ""}
          </>
        ) : (
          "No model selected yet."
        )}
      </div>
      {downloading && progress && (
        <div className="mt-2.5">
          <div
            role="progressbar"
            aria-label="Model download"
            aria-valuenow={Math.round(fraction * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-track"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-faint">
            {progress.status === "verifying" ? "Verifying integrity\u2026" : "Downloading\u2026"}
          </div>
        </div>
      )}
      {!downloading && engine?.state !== "ready" && (
        <div className="mt-2 text-[11.5px] leading-[1.5] text-muted">
          A model download is needed once. It happens inside Settings with a size you confirm.
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ stats */

function StatsCard({
  stats,
  streak,
  onOpenStatistics,
}: {
  stats: { totalDictations: number; totalWords: number } | null;
  streak: number;
  onOpenStatistics: () => void;
}) {
  return (
    <section className="miro-card px-4 py-3.5">
      <header className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Usage</h2>
        <button
          type="button"
          className="cursor-pointer text-[11.5px] text-muted underline decoration-dotted"
          onClick={onOpenStatistics}
        >
          Open statistics
        </button>
      </header>
      <div className="msh-kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="msh-kpi" style={{ border: "none", background: "transparent", padding: 0, boxShadow: "none" }}>
          <strong>{stats ? stats.totalDictations : 0}</strong>
          <span>dictations total</span>
        </div>
        <div className="msh-kpi" style={{ border: "none", background: "transparent", padding: 0, boxShadow: "none" }}>
          <strong>{streak}</strong>
          <span>day streak</span>
        </div>
      </div>
    </section>
  );
}

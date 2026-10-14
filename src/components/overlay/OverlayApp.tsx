import { useEffect, useMemo } from "react";
import { describeError } from "../../lib/errors";
import { formatDuration, formatDurationWords } from "../../lib/format";
import { useLevelHistory, useOverlayState, useTick } from "../../lib/hooks";
import { autoHideDelayMs, primaryAction } from "../../lib/overlayState";
import { ipc, isPreview } from "../../lib/ipc";
import type { OverlayState } from "../../lib/types";
import { IconAlert, IconCheck, IconClose, IconCopy, IconRetry, IconStop } from "../icons";
import { LevelMeter } from "./LevelMeter";

/** Buttons in a non-activating window must never grab focus. */
function OverlayButton({
  onClick,
  variant = "ghost",
  children,
  title,
}: {
  onClick: () => void;
  variant?: "primary" | "ghost";
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`miro-btn miro-btn-sm ${variant === "primary" ? "miro-btn-primary" : "miro-btn-ghost"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusDot({ tone }: { tone: "accent" | "success" | "danger" }) {
  const color =
    tone === "accent" ? "bg-accent" : tone === "success" ? "bg-success" : "bg-danger";
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
      <span
        className={`h-2.5 w-2.5 rounded-full ${color}`}
        style={tone === "accent" ? { animation: "miro-pulse 1.6s ease-in-out infinite" } : undefined}
      />
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-line-strong border-t-accent"
      style={{ animation: "miro-spin 900ms linear infinite" }}
    />
  );
}

export function OverlayApp() {
  const { state } = useOverlayState();
  const recording = state.kind === "recording";
  const frames = useLevelHistory(recording);
  const now = useTick(recording, 100);

  const action = primaryAction(state);

  // Escape and Enter live here as a safety net; the real Escape gesture is a
  // global shortcut registered by Rust, because a window that never takes
  // focus never receives the key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void ipc.dismissOverlay();
      } else if (event.key === "Enter" && action === "stop") {
        event.preventDefault();
        void ipc.stopRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action]);

  // If the hide event from Rust never arrives, the overlay still gets out of
  // the way instead of floating over the user's work forever.
  useEffect(() => {
    const delay = autoHideDelayMs(state);
    if (delay === null) return;
    const id = window.setTimeout(() => void ipc.dismissOverlay(), delay + 1500);
    return () => window.clearTimeout(id);
  }, [state]);

  const elapsedMs = useMemo(() => {
    if (state.kind === "recording") return now - state.startedAtMs;
    return 0;
  }, [now, state]);

  return (
    <div className="h-full w-full p-2">
      <div className="miro-card miro-animate-rise flex h-full flex-col justify-between px-3.5 py-3">
        <div className="flex min-h-0 flex-1 items-center gap-2.5">
          {state.kind === "recording" && (
            <>
              <StatusDot tone="accent" />
              <div className="min-w-0 flex-1">
                <LevelMeter frames={frames} height={44} />
              </div>
              <span className="miro-keys shrink-0 text-right text-ink tabular-nums">
                {formatDuration(elapsedMs)}
              </span>
            </>
          )}

          {state.kind === "processing" && (
            <>
              <Spinner />
              <span className="shrink-0 text-[13px] font-medium text-ink">Transcribing</span>
              <div className="min-w-0 flex-1">
                <LevelMeter frames={frames} height={44} tone="muted" />
              </div>
            </>
          )}

          {state.kind === "inserted" && (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <IconCheck size={14} />
              </span>
              <span className="text-[13px] font-semibold text-ink">Inserted</span>
              <span className="truncate text-[12.5px] text-muted">
                {state.characters.toLocaleString()} characters {"\u00b7"} {formatDurationWords(state.audioMs)} of speech
              </span>
            </>
          )}

          {state.kind === "copied" && (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <IconCopy size={14} />
              </span>
              <span className="text-[13px] font-semibold text-ink">Copied</span>
              <span className="truncate text-[12.5px] text-muted">
                {state.characters.toLocaleString()} characters on the clipboard
              </span>
            </>
          )}

          {state.kind === "error" && <ErrorRow state={state} />}

          {state.kind === "hidden" && <span className="text-[13px] text-muted">Ready</span>}
        </div>

        <div className="mt-2 flex h-8 items-center justify-between gap-3">
          <span className="truncate text-[11.5px] text-faint">{footerHint(state)}</span>
          <div className="flex shrink-0 items-center gap-1">
            {state.kind === "recording" && (
              <>
                <OverlayButton variant="primary" onClick={() => void ipc.stopRecording()} title="Stop and insert (Enter)">
                  <IconStop size={13} />
                  Stop
                </OverlayButton>
                <OverlayButton onClick={() => void ipc.dismissOverlay()} title="Cancel (Esc)">
                  <IconClose size={14} />
                </OverlayButton>
              </>
            )}

            {state.kind === "processing" && (
              <OverlayButton onClick={() => void ipc.dismissOverlay()} title="Cancel (Esc)">
                <IconClose size={14} />
                Cancel
              </OverlayButton>
            )}

            {state.kind === "error" && <ErrorActions state={state} />}

            {state.kind === "inserted" && <DrainBar />}
          </div>
        </div>
      </div>
      {isPreview && (
        <span className="miro-chip pointer-events-none absolute top-3 right-3 h-4 px-1.5 text-[10px]">
          preview
        </span>
      )}
    </div>
  );
}

/**
 * Retry and Copy exist only while Rust still holds the transcript. The text
 * itself never reaches this window: both commands act on the Rust side.
 */
function ErrorActions({ state }: { state: Extract<OverlayState, { kind: "error" }> }) {
  const retryId: number | null = state.retryable ? state.retryId : null;

  return (
    <>
      {retryId !== null && (
        <OverlayButton
          variant="primary"
          onClick={() => void ipc.retryInsertion(retryId)}
          title="Try to type the text again"
        >
          <IconRetry size={13} />
          Retry
        </OverlayButton>
      )}
      {retryId !== null && (
        <OverlayButton
          onClick={() => void ipc.copyPendingTranscript(retryId)}
          title="Put the text on the clipboard instead"
        >
          <IconCopy size={13} />
          Copy
        </OverlayButton>
      )}
      <OverlayButton onClick={() => void ipc.dismissOverlay()} title="Dismiss (Esc)">
        <IconClose size={14} />
      </OverlayButton>
    </>
  );
}

function ErrorRow({ state }: { state: Extract<OverlayState, { kind: "error" }> }) {
  const copy = describeError(state.code);
  return (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
        <IconAlert size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{copy.title}</div>
        {state.detail && <div className="truncate text-[11.5px] text-muted">{state.detail}</div>}
      </div>
    </>
  );
}

function DrainBar() {
  return (
    <span className="relative block h-[3px] w-16 overflow-hidden rounded-full bg-track">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-success"
        style={{ animation: "miro-drain 1100ms linear forwards", width: "100%" }}
      />
    </span>
  );
}

function footerHint(state: OverlayState): string {
  switch (state.kind) {
    case "recording":
      return "Esc cancels \u00b7 text is typed into the app you were in";
    case "processing":
      return "Esc cancels";
    case "inserted":
      return "In memory only \u2014 nothing was written to disk";
    case "copied":
      return "The text is on your clipboard";
    case "error":
      return describeError(state.code).hint ?? "";
    case "hidden":
      return "";
  }
}

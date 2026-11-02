import { useEffect, useMemo } from "react";
import { describeError } from "../../lib/errors";
import { formatDuration, formatDurationWords } from "../../lib/format";
import { useLevelHistory, useOverlayState, useTick } from "../../lib/hooks";
import { autoHideDelayMs, primaryAction } from "../../lib/overlayState";
import { ipc, isPreview } from "../../lib/ipc";
import { IconAlert, IconCheck, IconClose, IconCopy, IconRetry, IconStop } from "../icons";
import { LevelMeter } from "./LevelMeter";

/** Committed words solid, unstable tail dimmed. Last ~2 lines visible. */
function LiveTextLine({
  committed,
  unstable,
}: {
  committed: string;
  unstable: string;
}) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <div className="text-[13px] font-medium text-ink truncate">
        {committed}
      </div>
      {unstable && (
        <div className="text-[12.5px] text-muted truncate mt-0.5">
          {unstable}
        </div>
      )}
    </div>
  );
}

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

export function OverlayApp() {
  const { state } = useOverlayState();
  const recording = state.kind === "recording";
  const frames = useLevelHistory(recording);
  const now = useTick(recording, 100);

  const action = primaryAction(state);
  const liveText = state.kind === "recording" ? state.liveText : null;

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

  const open = state.kind !== "hidden";
  const processing = state.kind === "processing";
  const inserted = state.kind === "inserted";
  const copied = state.kind === "copied";
  const error = state.kind === "error";

  const chars =
    state.kind === "inserted"
      ? state.characters
      : state.kind === "copied"
        ? state.characters
        : 0;
  const audioMs = state.kind === "inserted" ? state.audioMs : 0;

  return (
    <div className="h-full w-full p-2">
      <div
        className="mo-overlay"
        data-kind={state.kind}
        style={{
          transform: open ? "translateY(0)" : "translateY(10px)",
          opacity: open ? 1 : 0,
        }}
      >
        {/* Lead: level meter + status icons */}
        <div className="mo-lead">
          <div className="mo-meter-wrap">
            <LevelMeter frames={frames} height={22} tone={recording ? "accent" : "muted"} />
          </div>

          {/* Mutually exclusive icons: crossfade without layout shift */}
          <span className={`mo-icon ${recording ? "on" : ""}`}>
            <span className="mo-dot on" />
          </span>
          <span className={`mo-icon ${processing ? "on" : ""}`}>
            <span className="mo-spinner" />
          </span>
          <span className={`mo-icon ${inserted || copied ? "on" : ""}`}>
            <span className="mo-check">
              <IconCheck size={12} />
            </span>
          </span>
        </div>

        {/* Centre: words — state groups stacked as overlapping layers */}
        <div className="mo-body">
          {error && (
            <div className="mo-state on">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <IconAlert size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">
                  {describeError(state.code).title}
                </div>
                {state.detail && (
                  <div className="truncate text-[11.5px] text-muted">{state.detail}</div>
                )}
              </div>
            </div>
          )}
          {!error && (
            <>
              <div className={`mo-state ${recording ? "on" : ""}`}>
                <div className="mo-label">Dictating…</div>
                <div className="mo-timer" aria-label="Recording timer">
                  {formatDuration(elapsedMs)}
                </div>
                {liveText && (
                  <div className="mo-live">
                    <LiveTextLine
                      committed={liveText.committed}
                      unstable={liveText.unstable ?? ""}
                    />
                  </div>
                )}
              </div>
              <div className={`mo-state ${processing ? "on" : ""}`}>
                <div className="mo-label mo-label--muted">Transcribing</div>
              </div>
              <div className={`mo-state ${(inserted || copied) ? "on" : ""}`}>
                <div className="mo-label mo-label--tone">
                  {inserted || copied ? (copied ? "Copied" : "Inserted") : "Inserted"}
                </div>
                <div className="mo-meta">
                  {inserted
                    ? `${chars.toLocaleString()} characters · ${formatDurationWords(audioMs)} of speech`
                    : copied
                      ? `${chars.toLocaleString()} characters on the clipboard`
                      : ""}
                </div>
              </div>
              {/* Idle state: shown when the panel is open but not in a
                   specific flow (e.g. Normal mode toast). */}
              {!recording && !processing && !inserted && !copied && (
                <div className="mo-state on">
                  <div className="mo-label mo-label--muted">Ready</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: hint or drain */}
        <div className="mo-trail">
          <span className={`mo-hint ${recording ? "on" : ""}`}>Esc cancels</span>
          <div className={`mo-drain ${inserted ? "on" : ""}`} />
        </div>

        {/* Actions: Stop / Cancel / Retry / Copy / Dismiss */}
        <div className="mo-actions">
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
            </OverlayButton>
          )}
          {error && (
            <>
              {state.retryable && state.retryId !== null && (
                <OverlayButton variant="primary" onClick={() => void ipc.retryInsertion(state.retryId!)} title="Try to type the text again">
                  <IconRetry size={13} />
                  Retry
                </OverlayButton>
              )}
              {state.retryable && state.retryId !== null && (
                <OverlayButton onClick={() => void ipc.copyPendingTranscript(state.retryId!)} title="Put the text on the clipboard instead">
                  <IconCopy size={13} />
                  Copy
                </OverlayButton>
              )}
              <OverlayButton onClick={() => void ipc.dismissOverlay()} title="Dismiss (Esc)">
                <IconClose size={14} />
              </OverlayButton>
            </>
          )}
        </div>
      </div>
      {isPreview && (
        <span className="mo-chip pointer-events-none absolute top-3 right-3 h-4 px-1.5 text-[10px]">
          preview
        </span>
      )}
    </div>
  );
}

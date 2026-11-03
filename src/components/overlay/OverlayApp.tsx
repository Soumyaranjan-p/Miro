import { useEffect } from "react";
import { describeError } from "../../lib/errors";
import { useLevelHistory, useOverlayState } from "../../lib/hooks";
import { autoHideDelayMs, primaryAction } from "../../lib/overlayState";
import { ipc, isPreview } from "../../lib/ipc";
import { IconAlert, IconCheck, IconClose, IconCopy, IconRetry } from "../icons";
import { LevelMeter } from "./LevelMeter";

/** Two lines of light gray text — the dictated words. */
function LiveTextLine({
  committed,
  unstable,
}: {
  committed: string;
  unstable: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="text-[15px] leading-[1.35] font-[450] text-[#d1d1d6] truncate">
        {committed}
      </div>
      {unstable && (
        <div className="text-[14px] leading-[1.35] text-[#8e8e93] truncate mt-0.5">
          {unstable}
        </div>
      )}
    </div>
  );
}

/** macOS-style circular button. */
function DictationButton({
  onClick,
  children,
  title,
  variant,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  variant?: "close" | "check";
}) {
  return (
    <button
      type="button"
      title={title}
      className="miro-dictation-btn"
      data-variant={variant}
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

  const action = primaryAction(state);
  const liveText = state.kind === "recording" ? state.liveText : null;

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

  useEffect(() => {
    const delay = autoHideDelayMs(state);
    if (delay === null) return;
    const id = window.setTimeout(() => void ipc.dismissOverlay(), delay + 1500);
    return () => window.clearTimeout(id);
  }, [state]);

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

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div
        className="miro-dictation"
        data-kind={state.kind}
        style={{
          transform: open ? "translateY(0) scale(1)" : "translateY(8px) scale(0.96)",
          opacity: open ? 1 : 0,
        }}
      >
        {/* Top pill: text bubble */}
        <div className="miro-dictation__text-pill">
          {error && (
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#ff453a]">
                <IconAlert size={12} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-[#e5e5ea] leading-[1.3]">
                  {describeError(state.code).title}
                </div>
                {state.detail && (
                  <div className="text-[12px] text-[#8e8e93] leading-[1.35] mt-0.5">
                    {state.detail}
                  </div>
                )}
              </div>
            </div>
          )}
          {!error && recording && (
            <div className="miro-dictation__text-pill-inner">
              {liveText ? (
                <LiveTextLine
                  committed={liveText.committed}
                  unstable={liveText.unstable ?? ""}
                />
              ) : (
                <div className="text-[15px] leading-[1.35] font-[450] text-[#d1d1d6]">
                  Dictating…
                </div>
              )}
            </div>
          )}
          {processing && (
            <div className="text-[14px] text-[#8e8e93]">Transcribing…</div>
          )}
          {(inserted || copied) && (
            <div className="text-[14px] font-semibold text-[#34c759]">
              {inserted || copied ? (copied ? "Copied" : "Inserted") : "Inserted"}
              <span className="font-normal text-[#8e8e93] text-[13px]">
                {" · "}{chars.toLocaleString()} characters
              </span>
            </div>
          )}
          {!recording && !processing && !inserted && !copied && !error && (
            <div className="text-[14px] text-[#8e8e93]">Ready</div>
          )}
        </div>

        {/* Bottom pill: X | waveform |  ✓ */}
        <div className="miro-dictation__control-pill">
          {recording && (
            <>
              <DictationButton onClick={() => void ipc.dismissOverlay()} title="Cancel (Esc)" variant="close">
                <IconClose size={16} />
              </DictationButton>
              <div className="miro-dictation__waveform-wrap">
                <LevelMeter frames={frames} height={14} tone="light" />
              </div>
              <DictationButton onClick={() => void ipc.stopRecording()} title="Stop and insert (Enter)" variant="check">
                <IconCheck size={17} />
              </DictationButton>
            </>
          )}
          {processing && (
            <>
              <DictationButton onClick={() => void ipc.dismissOverlay()} title="Cancel (Esc)" variant="close">
                <IconClose size={16} />
              </DictationButton>
              <div className="miro-dictation__waveform-wrap">
                <LevelMeter frames={frames} height={14} tone="muted" />
              </div>
              <DictationButton onClick={() => void ipc.stopRecording()} title="Stop" variant="close">
                <IconClose size={16} />
              </DictationButton>
            </>
          )}
          {(inserted || copied) && (
            <>
              <DictationButton onClick={() => void ipc.dismissOverlay()} title="Dismiss (Esc)" variant="close">
                <IconClose size={16} />
              </DictationButton>
              <div className="miro-dictation__waveform-wrap" />
              <DictationButton onClick={() => void ipc.dismissOverlay()} title="Dismiss (Esc)" variant="check">
                <IconCheck size={17} />
              </DictationButton>
            </>
          )}
          {error && (
            <>
              {state.retryable && state.retryId !== null ? (
                <>
                  <DictationButton onClick={() => void ipc.retryInsertion(state.retryId!)} title="Retry" variant="check">
                    <IconRetry size={15} />
                  </DictationButton>
                  <div className="miro-dictation__waveform-wrap" />
                  <DictationButton onClick={() => void ipc.copyPendingTranscript(state.retryId!)} title="Copy" variant="close">
                    <IconCopy size={15} />
                  </DictationButton>
                </>
              ) : (
                <>
                  <DictationButton onClick={() => void ipc.dismissOverlay()} title="Dismiss (Esc)" variant="close">
                    <IconClose size={16} />
                  </DictationButton>
                  <div className="miro-dictation__waveform-wrap" />
                  <DictationButton onClick={() => void ipc.dismissOverlay()} title="Dismiss (Esc)" variant="close">
                    <IconClose size={16} />
                  </DictationButton>
                </>
              )}
            </>
          )}
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

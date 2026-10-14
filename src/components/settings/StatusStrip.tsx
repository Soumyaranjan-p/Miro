import { formatShortcut } from "../../lib/format";
import type { RuntimeStatus } from "../../lib/types";
import { Pill } from "./Controls";

/**
 * The honest status of everything that can fail silently: which model the
 * engine actually holds, whether the global shortcut is really registered,
 * whether a microphone was found, and whether the temp directory is clean.
 */
export function StatusStrip({ status }: { status: RuntimeStatus | null }) {
  if (!status) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="neutral">{"Checking status\u2026"}</Pill>
      </div>
    );
  }

  const engineTone =
    status.engine.state === "ready" ? "success" : status.engine.state === "failed" ? "danger" : "warn";
  const engineText =
    status.engine.state === "ready"
      ? `Model ${status.engine.modelId ?? "-"} ready`
      : status.engine.state === "loading"
        ? "Loading model"
        : status.engine.state === "no_model"
          ? "No model installed"
          : "Engine failed";

  const shortcutTone = status.shortcut.registered ? "success" : "danger";
  const shortcutText = status.shortcut.registered
    ? `${formatShortcut(status.shortcut.shortcut)}${status.shortcut.mechanism === "keyboard_hook" ? " (hook)" : ""}`
    : "Shortcut not registered";

  const micTone =
    status.microphone.state === "available"
      ? "success"
      : status.microphone.state === "unknown"
        ? "neutral"
        : "danger";
  const micText =
    status.microphone.state === "available"
      ? "Microphone ready"
      : status.microphone.state === "permission_denied"
        ? "Microphone blocked by Windows"
        : status.microphone.state === "missing"
          ? "No microphone"
          : "Microphone unknown";

  const tempTone = status.temp.state === "failed" ? "warn" : "success";
  const tempText =
    status.temp.state === "clean"
      ? "No temp files"
      : status.temp.state === "cleaned"
        ? "Temp cleaned at start"
        : "Temp cleanup failed";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill tone={engineTone} title={status.engine.backend}>
        {engineText}
      </Pill>
      <Pill tone={shortcutTone} title={status.shortcut.detail ?? undefined}>
        {shortcutText}
      </Pill>
      <Pill tone={micTone} title={status.microphone.detail ?? undefined}>
        {micText}
      </Pill>
      <Pill tone={tempTone} title={status.temp.detail ?? undefined}>
        {tempText}
      </Pill>
      <Pill tone="neutral" title={`${status.platform} \u00b7 ${status.modelsDir}`}>
        Miro {status.version}
      </Pill>
    </div>
  );
}

import type { ErrorCode } from "./types";

/**
 * Errors from the Rust core arrive as `{ code, detail }`. Anything else (a
 * thrown string, a network-shaped failure) is reported verbatim, because
 * hiding it would make a real problem harder to diagnose.
 */
export interface WireError {
  code: ErrorCode;
  detail: string | null;
}

export function toWireError(cause: unknown): WireError {
  if (cause && typeof cause === "object" && "code" in cause) {
    const candidate = cause as { code?: unknown; detail?: unknown };
    if (typeof candidate.code === "string") {
      return {
        code: candidate.code as ErrorCode,
        detail: typeof candidate.detail === "string" ? candidate.detail : null,
      };
    }
  }
  return { code: "internal_error", detail: typeof cause === "string" ? cause : null };
}

/** One line for an inline message: the translated headline plus any detail. */
export function errorText(cause: unknown): string {
  const wire = toWireError(cause);
  const copy = describeError(wire.code);
  return wire.detail ? `${copy.title} (${wire.detail})` : copy.title;
}

export interface ErrorCopy {
  /** Short, content-free headline shown in the overlay. */
  title: string;
  /** One sentence of what the user can do, or null when nothing helps. */
  hint: string | null;
}

/**
 * Every failure the user can meet, with plain-language copy.
 *
 * These messages never include dictation content, file contents or device
 * payloads - only what is needed to act on the problem.
 */
const COPY: Record<ErrorCode, ErrorCopy> = {
  model_missing: {
    title: "No speech model installed",
    hint: "Open Settings to download a model before dictating.",
  },
  model_corrupt: {
    title: "The speech model is damaged",
    hint: "Delete it in Settings and download it again.",
  },
  model_unavailable: {
    title: "The speech model is not available",
    hint: "Check that the model file still exists in the models folder.",
  },
  download_failed: {
    title: "The download did not finish",
    hint: "Check your connection and resume the download in Settings.",
  },
  download_cancelled: {
    title: "Download cancelled",
    hint: "You can resume the download at any time.",
  },
  mic_permission_denied: {
    title: "Windows is blocking microphone access",
    hint: "Settings > Privacy & security > Microphone > let desktop apps use it.",
  },
  mic_missing: {
    title: "No microphone found",
    hint: "Connect a microphone and choose it in Settings.",
  },
  mic_disconnected: {
    title: "The microphone was disconnected",
    hint: "Recording stopped. Reconnect it, or pick another device in Settings.",
  },
  mic_unsupported_format: {
    title: "That microphone offered no usable audio format",
    hint: "Try another device or another sample rate in Windows sound settings.",
  },
  engine_failed: {
    title: "Transcription failed",
    hint: "Retry, or restart Miro if it keeps happening.",
  },
  engine_timeout: {
    title: "Transcription took too long",
    hint: "Shorter clips or a faster model will help.",
  },
  engine_unavailable: {
    title: "The local speech engine is not built into this copy of Miro",
    hint: "Install a build that includes the whisper.cpp engine.",
  },
  audio_empty: {
    title: "No speech detected",
    hint: "Check the input device level and try again.",
  },
  audio_too_long: {
    title: "Recording reached the maximum length",
    hint: "Miro stopped and transcribed what it had. Raise the limit in Settings.",
  },
  shortcut_conflict: {
    title: "That shortcut is taken",
    hint: "Pick another combination in Settings.",
  },
  shortcut_invalid: {
    title: "That shortcut cannot be used",
    hint: "Add a letter, number or function key to the combination.",
  },
  focus_changed: {
    title: "Focus moved to another window",
    hint: "Nothing was typed. Click back into the target app and retry.",
  },
  insertion_failed: {
    title: "The text could not be typed into that app",
    hint: "Copy it instead, or try the clipboard fallback in Settings.",
  },
  insertion_blocked: {
    title: "That app does not accept typed input from Miro",
    hint: "Windows blocks non-elevated apps from typing into elevated windows. Copy instead.",
  },
  clipboard_failed: {
    title: "The clipboard is busy",
    hint: "Another app is holding the clipboard. Retry in a moment.",
  },
  temp_cleanup_failed: {
    title: "A temporary file could not be removed",
    hint: "Miro will try again on the next start.",
  },
  config_write_failed: {
    title: "Settings could not be saved",
    hint: "Check that the Miro folder in your AppData is writable.",
  },
  cancelled: {
    title: "Cancelled",
    hint: null,
  },
  internal_error: {
    title: "Something went wrong inside Miro",
    hint: "Retry. If it repeats, restart Miro.",
  },
};

export function describeError(code: ErrorCode): ErrorCopy {
  return COPY[code] ?? COPY.internal_error;
}

/** Short label used by the diagnostics strip in Settings. */
export function errorLabel(code: ErrorCode): string {
  return code.replace(/_/g, " ");
}

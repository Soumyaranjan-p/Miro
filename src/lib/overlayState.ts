import type { ErrorCode, OverlayState } from "./types";

export type OverlayAction =
  | { type: "startRecording"; deviceLabel: string; startedAtMs: number; maxSeconds: number }
  | { type: "startProcessing"; startedAtMs: number }
  | { type: "inserted"; characters: number; audioMs: number; retryId: number | null }
  | { type: "copied"; characters: number }
  | { type: "failed"; code: ErrorCode; detail: string | null; retryable: boolean; retryId: number | null }
  | { type: "hide" };

/** The overlay is hidden whenever nothing is in flight; Rust drives the real state. */
export const initialOverlayState: OverlayState = { kind: "hidden" };

/**
 * The overlay's reducer. Kept pure so the transitions the product promises -
 * never showing two recordings at once, always returning to `hidden` - are
 * testable without a webview or a microphone.
 */
export function reduceOverlayState(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "startRecording":
      if (state.kind === "recording") return state;
      return {
        kind: "recording",
        deviceLabel: action.deviceLabel,
        startedAtMs: action.startedAtMs,
        maxSeconds: action.maxSeconds,
      };
    case "startProcessing":
      if (state.kind !== "recording") return state;
      return { kind: "processing", startedAtMs: action.startedAtMs };
    case "inserted":
      if (state.kind === "hidden") return state;
      return { kind: "inserted", characters: action.characters, audioMs: action.audioMs, retryId: action.retryId };
    case "copied":
      if (state.kind === "hidden") return state;
      return { kind: "copied", characters: action.characters };
    case "failed":
      if (state.kind === "hidden") return state;
      return {
        kind: "error",
        code: action.code,
        detail: action.detail,
        retryable: action.retryable,
        retryId: action.retryId,
      };
    case "hide":
      return initialOverlayState;
  }
}

/** Transient states the overlay hides itself after, without waiting for Rust. */
export function autoHideDelayMs(state: OverlayState): number | null {
  switch (state.kind) {
    case "inserted":
    case "copied":
      return 1100;
    case "mode":
      return 2200;
    case "hidden":
      return null;
    case "error":
      return state.retryable ? null : 3200;
    case "recording":
    case "processing":
      return null;
  }
}

/** Which key the overlay treats as "primary" for Enter. */
export function primaryAction(state: OverlayState): "stop" | "retry" | "none" {
  switch (state.kind) {
    case "recording":
      return "stop";
    case "error":
      return state.retryable ? "retry" : "none";
    default:
      return "none";
  }
}

export function isBusy(state: OverlayState): boolean {
  return state.kind === "recording" || state.kind === "processing";
}

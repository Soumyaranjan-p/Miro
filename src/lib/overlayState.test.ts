import { describe, expect, it } from "vitest";
import {
  autoHideDelayMs,
  initialOverlayState,
  isBusy,
  primaryAction,
  reduceOverlayState,
  type OverlayAction,
} from "./overlayState";
import type { OverlayState } from "./types";

const recording: OverlayAction = {
  type: "startRecording",
  deviceLabel: "Microphone Array",
  startedAtMs: 1_000,
  maxSeconds: 300,
};

function apply(state: OverlayState, ...actions: OverlayAction[]): OverlayState {
  return actions.reduce(reduceOverlayState, state);
}

describe("overlay state machine", () => {
  it("starts hidden", () => {
    expect(initialOverlayState).toEqual({ kind: "hidden" });
  });

  it("records, then processes, then reports what was inserted", () => {
    const state = apply(
      initialOverlayState,
      recording,
      { type: "startProcessing", startedAtMs: 2_000 },
      { type: "inserted", characters: 42, audioMs: 3_100, retryId: null },
    );
    expect(state).toEqual({ kind: "inserted", characters: 42, audioMs: 3_100, retryId: null });
  });

  it("ignores a second recording request while one is running", () => {
    const first = apply(initialOverlayState, recording);
    const second = reduceOverlayState(first, { ...recording, deviceLabel: "Other" });
    expect(second).toBe(first);
  });

  it("cannot start processing without a recording", () => {
    const state = reduceOverlayState(initialOverlayState, { type: "startProcessing", startedAtMs: 5 });
    expect(state).toEqual({ kind: "hidden" });
  });

  it("returns to hidden on hide from any state", () => {
    const states = [
      apply(initialOverlayState, recording),
      apply(initialOverlayState, recording, { type: "startProcessing", startedAtMs: 2 }),
      apply(initialOverlayState, recording, { type: "inserted", characters: 1, audioMs: 1, retryId: null }),
      apply(initialOverlayState, recording, {
        type: "failed",
        code: "focus_changed",
        detail: null,
        retryable: true,
        retryId: 4,
      }),
    ];
    for (const state of states) {
      expect(reduceOverlayState(state, { type: "hide" })).toEqual({ kind: "hidden" });
    }
  });

  it("keeps the retry id so Rust can still find the transcript", () => {
    const state = apply(initialOverlayState, recording, {
      type: "failed",
      code: "insertion_failed",
      detail: "target refused input",
      retryable: true,
      retryId: 9,
    });
    expect(state).toEqual({
      kind: "error",
      code: "insertion_failed",
      detail: "target refused input",
      retryable: true,
      retryId: 9,
    });
  });

  it("never reports success or failure while hidden", () => {
    expect(reduceOverlayState(initialOverlayState, { type: "inserted", characters: 5, audioMs: 10, retryId: null })).toEqual({
      kind: "hidden",
    });
    expect(
      reduceOverlayState(initialOverlayState, {
        type: "failed",
        code: "internal_error",
        detail: null,
        retryable: false,
        retryId: null,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("hides successes quickly and retryable errors never", () => {
    expect(autoHideDelayMs({ kind: "inserted", characters: 1, audioMs: 1, retryId: null })).toBe(1100);
    expect(autoHideDelayMs({ kind: "copied", characters: 1 })).toBe(1100);
    expect(
      autoHideDelayMs({ kind: "error", code: "audio_empty", detail: null, retryable: false, retryId: null }),
    ).toBeGreaterThan(0);
    expect(
      autoHideDelayMs({ kind: "error", code: "focus_changed", detail: null, retryable: true, retryId: 1 }),
    ).toBeNull();
    expect(autoHideDelayMs({ kind: "recording", deviceLabel: "x", startedAtMs: 0, maxSeconds: 60 })).toBeNull();
    expect(autoHideDelayMs(initialOverlayState)).toBeNull();
  });

  it("maps Enter to the action a user expects", () => {
    expect(primaryAction({ kind: "recording", deviceLabel: "x", startedAtMs: 0, maxSeconds: 60 })).toBe("stop");
    expect(
      primaryAction({ kind: "error", code: "focus_changed", detail: null, retryable: true, retryId: 2 }),
    ).toBe("retry");
    expect(
      primaryAction({ kind: "error", code: "audio_empty", detail: null, retryable: false, retryId: null }),
    ).toBe("none");
    expect(primaryAction(initialOverlayState)).toBe("none");
  });

  it("treats recording and processing as busy", () => {
    expect(isBusy(initialOverlayState)).toBe(false);
    expect(isBusy({ kind: "recording", deviceLabel: "x", startedAtMs: 0, maxSeconds: 60 })).toBe(true);
    expect(isBusy({ kind: "processing", startedAtMs: 0 })).toBe(true);
    expect(isBusy({ kind: "inserted", characters: 1, audioMs: 1, retryId: null })).toBe(false);
  });
});

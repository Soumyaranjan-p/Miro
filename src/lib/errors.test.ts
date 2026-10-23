import { describe, expect, it } from "vitest";
import { describeError, errorLabel, errorText, toWireError } from "./errors";
import type { ErrorCode } from "./types";

/**
 * Mirrors the Rust `ErrorCode` enum in `src-tauri/src/errors.rs`. If a code is
 * added there and not here, or here and not there, this list is the reminder.
 */
const ALL_CODES: ErrorCode[] = [
  "model_missing",
  "model_corrupt",
  "model_unavailable",
  "download_failed",
  "download_cancelled",
  "mic_permission_denied",
  "mic_missing",
  "mic_disconnected",
  "mic_unsupported_format",
  "engine_failed",
  "engine_timeout",
  "engine_unavailable",
  "audio_empty",
  "audio_silent",
  "transcript_empty",
  "audio_too_long",
  "shortcut_conflict",
  "shortcut_invalid",
  "focus_changed",
  "insertion_failed",
  "insertion_blocked",
  "clipboard_failed",
  "temp_cleanup_failed",
  "config_write_failed",
  "cancelled",
  "internal_error",
];

describe("error copy", () => {
  it("has a human sentence for every code", () => {
    for (const code of ALL_CODES) {
      const copy = describeError(code);
      expect(copy.title.length, code).toBeGreaterThan(3);
      expect(copy.title.endsWith("."), `${code} should read as a sentence`).toBe(false);
    }
  });

  it("never promises content in a message", () => {
    for (const code of ALL_CODES) {
      const copy = describeError(code);
      expect(copy.title.toLowerCase()).not.toContain("transcript:");
      expect(copy.title.toLowerCase()).not.toContain("you said");
    }
  });

  it("explains the Windows limit rather than blaming the user", () => {
    expect(describeError("insertion_blocked").hint).toContain("elevated");
  });

  it("labels codes for diagnostics", () => {
    expect(errorLabel("mic_permission_denied")).toBe("mic permission denied");
  });
});

describe("wire errors", () => {
  it("reads the { code, detail } shape the Rust commands return", () => {
    const wire = toWireError({ code: "model_corrupt", detail: "checksum mismatch" });
    expect(wire).toEqual({ code: "model_corrupt", detail: "checksum mismatch" });
  });

  it("falls back to a generic code for anything else", () => {
    expect(toWireError(new Error("boom"))).toEqual({ code: "internal_error", detail: null });
    expect(toWireError("plain string")).toEqual({ code: "internal_error", detail: "plain string" });
    expect(toWireError(undefined)).toEqual({ code: "internal_error", detail: null });
    expect(toWireError({ code: 42 })).toEqual({ code: "internal_error", detail: null });
  });

  it("builds one line for an inline message", () => {
    expect(errorText({ code: "focus_changed", detail: null })).toBe(describeError("focus_changed").title);
    expect(errorText({ code: "focus_changed", detail: "window closed" })).toContain("window closed");
  });
});

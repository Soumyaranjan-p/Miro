/**
 * Wire contract between the React windows and the Rust core.
 *
 * Every type here mirrors a Rust type in `src-tauri/src/config.rs` or
 * `src-tauri/src/ipc.rs`. Rust is the single source of truth: the webview owns
 * no persistent state and never receives transcript text.
 */

export type DictationMode = "toggle" | "push_to_talk";
export type ThemePreference = "system" | "light" | "dark";
export type OverlayPosition = "bottom-center" | "bottom-right" | "center";
/** Which screen the home window opens on: the dictation home or Intent Mode. */
export type HomeMode = "home" | "intent";

/** Deterministic, LLM-free text cleanup. `enabled: false` means raw engine text. */
export interface CleanupOptions {
  enabled: boolean;
  normalizeWhitespace: boolean;
  capitalizeSentences: boolean;
  removeFillerWords: boolean;
  fillerWords: string[];
}

export interface Settings {
  version: number;
  /** Canonical `Ctrl+Alt+Space` form, stored as the plugin's shortcut string. */
  shortcut: string;
  mode: DictationMode;
  /** Normal-mode hotkey: switches the home window to Normal mode. */
  normalShortcut: string;
  /** Incident-mode hotkey: switches the home window to Incident mode. */
  incidentShortcut: string;
  /** Home window: last selected mode - Normal ("home") or Incident ("intent"). */
  homeMode: HomeMode;
  /** Home window sound toggle. */
  soundOn: boolean;
  /** cpal device id, or null for the system default device. */
  microphone: string | null;
  modelId: string;
  /** Engine language hint: "en", "auto", or an ISO code for multilingual models. */
  language: string;
  maxRecordingSeconds: number;
  cleanup: CleanupOptions;
  theme: ThemePreference;
  overlayPosition: OverlayPosition;
  showTranscriptPreview: boolean;
  startOnLogin: boolean;
}

/** Non-sensitive operator detail. Rust guarantees this never carries transcript or audio content. */
export type SafeDetail = string | null;

export type ErrorCode =
  | "model_missing"
  | "model_corrupt"
  | "model_unavailable"
  | "download_failed"
  | "download_cancelled"
  | "mic_permission_denied"
  | "mic_missing"
  | "mic_disconnected"
  | "mic_unsupported_format"
  | "engine_failed"
  | "engine_timeout"
  | "engine_unavailable"
  | "audio_empty"
  | "audio_silent"
  | "transcript_empty"
  | "audio_too_long"
  | "shortcut_conflict"
  | "shortcut_invalid"
  | "focus_changed"
  | "insertion_failed"
  | "insertion_blocked"
  | "clipboard_failed"
  | "temp_cleanup_failed"
  | "config_write_failed"
  | "cancelled"
  | "internal_error";

/**
 * The overlay's state. Transcript text is deliberately absent: the retryable
 * transcript stays inside the Rust process and is only reached through the
 * `retryInsertion` / `copyPendingTranscript` commands.
 */
export type OverlayState =
  | { kind: "hidden" }
  | { kind: "mode"; homeMode: "home" | "intent" }
  | { kind: "recording"; deviceLabel: string; startedAtMs: number; maxSeconds: number }
  | { kind: "processing"; startedAtMs: number }
  | { kind: "inserted"; characters: number; audioMs: number; retryId: number | null }
  | { kind: "copied"; characters: number }
  | {
      kind: "error";
      code: ErrorCode;
      detail: SafeDetail;
      retryable: boolean;
      retryId: number | null;
    };

export type ModelStatus =
  | "not_installed"
  | "partial"
  | "downloading"
  | "verifying"
  | "installed"
  | "corrupt";

export interface ModelDownloadState {
  receivedBytes: number;
  totalBytes: number | null;
  resumable: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  fileName: string;
  /** null until the source has been asked: Miro shows the real number, never a guess. */
  sizeBytes: number | null;
  /** null when no published integrity value is known for this file. */
  integrity: string | null;
  sourceUrl: string;
  sourceLabel: string;
  license: string;
  languages: string;
  parameters: string;
  quality: "fast" | "balanced" | "accurate";
  recommended: boolean;
  status: ModelStatus;
  installedBytes: number | null;
  /** Where the model file lives, shown so manual/offline install is possible. */
  targetPath: string;
  download: ModelDownloadState | null;
}

/**
 * One configured global hotkey and how it ended up registered. `role` is the
 * stable label the dispatcher uses: "dictation", "normal", "incident".
 */
export interface HotkeyStatus {
  role: string;
  registered: boolean;
  shortcut: string;
  mechanism: "plugin" | "keyboard_hook" | "none";
  detail: SafeDetail;
}

export interface RuntimeStatus {
  version: string;
  platform: string;
  modelsDir: string;
  engine: {
    state: "no_model" | "loading" | "ready" | "failed";
    modelId: string | null;
    backend: string;
    detail: SafeDetail;
  };
  /** All three rebindable hotkeys, one entry each. */
  hotkeys: HotkeyStatus[];
  microphone: {
    state: "unknown" | "available" | "missing" | "permission_denied";
    detail: SafeDetail;
  };
  temp: {
    state: "clean" | "cleaned" | "failed";
    detail: SafeDetail;
  };
}

export interface MicrophoneInfo {
  id: string;
  label: string;
  isDefault: boolean;
  sampleRate: number | null;
  channels: number | null;
}

export interface ShortcutCheck {
  ok: boolean;
  normalized: string | null;
  reason: SafeDetail;
  conflictWith: SafeDetail;
}

/** Overlay level frames, ~30-60 Hz while recording. */
export interface LevelFrame {
  /** 0..1 RMS level, already smoothed by the audio thread. */
  level: number;
  /** 0..1 peak since the last frame, for the meter's falling edge. */
  peak: number;
}

/**
 * One day of usage aggregates. Numeric only: no transcripts, no word lists.
 * `date` is the local ISO calendar day the numbers belong to.
 */
export interface StatsDay {
  date: string;
  dictations: number;
  words: number;
  speechMs: number;
  /** Time spent in Normal mode, beginning on that local day. */
  normalMs: number;
  /** Time spent in Incident mode, beginning on that local day. */
  incidentMs: number;
}

/** Aggregated numbers for the Statistics page. Read-only, from `stats.json`. */
export interface StatsSummary {
  totalDictations: number;
  totalWords: number;
  totalSpeechMs: number;
  normalMs: number;
  incidentMs: number;
  /** Average words per minute over all recorded speech, or null without data. */
  wordsPerMinute: number | null;
  /** Consecutive days ending today (or yesterday) with at least one dictation. */
  streakDays: number;
  days: StatsDay[];
}

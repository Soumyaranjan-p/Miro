import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LevelFrame,
  MicrophoneInfo,
  ModelInfo,
  RuntimeStatus,
  Settings,
  ShortcutCheck,
  OverlayState,
  StatsSummary,
} from "./types";

export const EVENTS = {
  overlay: "miro://overlay",
  settings: "miro://settings",
  runtime: "miro://runtime-status",
  modelProgress: "miro://model-progress",
  micLevel: "miro://mic-level",
} as const;

export type MiroEventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface ModelProgress {
  modelId: string;
  status: "downloading" | "verifying" | "installed" | "failed" | "cancelled";
  receivedBytes: number;
  totalBytes: number | null;
  detail: string | null;
}

export type SettingsPatch = Partial<Omit<Settings, "cleanup">> & {
  cleanup?: Partial<Settings["cleanup"]>;
};

/**
 * Everything the UI is allowed to ask the Rust core for.
 *
 * The webview has no filesystem, shell or network permission, so any operation
 * that touches the machine has to travel through one of these commands.
 */
export interface MiroBridge {
  getSettings(): Promise<Settings>;
  setSettings(patch: SettingsPatch): Promise<Settings>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
  listModels(): Promise<ModelInfo[]>;
  /** Asks the source how large a model is, before the user confirms anything. */
  probeModel(modelId: string): Promise<number | null>;
  startModelDownload(modelId: string): Promise<void>;
  cancelModelDownload(modelId: string): Promise<void>;
  deleteModel(modelId: string): Promise<void>;
  listMicrophones(): Promise<MicrophoneInfo[]>;
  checkShortcut(shortcut: string): Promise<ShortcutCheck>;
  suspendShortcut(): Promise<void>;
  resumeShortcut(): Promise<void>;
  startMicProbe(): Promise<void>;
  stopMicProbe(): Promise<void>;
  dismissOverlay(): Promise<void>;
  stopRecording(): Promise<void>;
  retryInsertion(retryId: number): Promise<void>;
  copyPendingTranscript(retryId: number): Promise<void>;
  toggleDictation(): Promise<void>;
  /** Switch the whole app between Normal ("home") and Incident ("intent"). */
  switchMode(mode: "home" | "intent"): Promise<void>;
  /** Reads the in-memory transcript the events referenced. Rust-only state. */
  getPendingTranscript(retryId: number): Promise<string>;
  /** Types the pending transcript into whatever app the user has front. */
  pastePending(retryId: number): Promise<void>;
  /** Usage statistics: numeric aggregates only. */
  getStats(): Promise<StatsSummary>;
  openModelsFolder(): Promise<void>;
  openAppDataFolder(): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** The Windows user's display name for the Home greeting. */
  getUserName(): Promise<string>;
  on<T>(event: MiroEventName, handler: (payload: T) => void): () => void;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** True when the UI runs in a plain browser (no Tauri) and should use the preview harness. */
export const isPreview = !inTauri;

function subscribe<T>(event: MiroEventName, handler: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | undefined;
  let disposed = false;
  void listen<T>(event, (e) => handler(e.payload))
    .then((u) => {
      if (disposed) u();
      else unlisten = u;
    })
    .catch(() => {
      /* Losing an event subscription only degrades live updates. */
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

const tauriBridge: MiroBridge = {
  getSettings: () => invoke("get_settings"),
  setSettings: (patch) => invoke("set_settings", { patch }),
  getRuntimeStatus: () => invoke("get_runtime_status"),
  listModels: () => invoke("list_models"),
  probeModel: (modelId) => invoke("probe_model", { modelId }),
  startModelDownload: (modelId) => invoke("start_model_download", { modelId }),
  cancelModelDownload: (modelId) => invoke("cancel_model_download", { modelId }),
  deleteModel: (modelId) => invoke("delete_model", { modelId }),
  listMicrophones: () => invoke("list_microphones"),
  checkShortcut: (shortcut) => invoke("check_shortcut", { shortcut }),
  suspendShortcut: () => invoke("suspend_shortcut"),
  resumeShortcut: () => invoke("resume_shortcut"),
  startMicProbe: () => invoke("start_mic_probe"),
  stopMicProbe: () => invoke("stop_mic_probe"),
  dismissOverlay: () => invoke("dismiss_overlay"),
  stopRecording: () => invoke("stop_recording"),
  retryInsertion: (retryId) => invoke("retry_insertion", { retryId }),
  copyPendingTranscript: (retryId) => invoke("copy_pending_transcript", { retryId }),
  toggleDictation: () => invoke("toggle_dictation"),
  switchMode: (mode) => invoke("switch_home_mode_command", { mode }),
  getPendingTranscript: (retryId) => invoke("get_pending_transcript", { retryId }),
  pastePending: (retryId) => invoke("paste_pending", { retryId }),
  getStats: () => invoke("get_stats"),
  openModelsFolder: () => invoke("open_models_folder"),
  openAppDataFolder: () => invoke("open_app_data_folder"),
  openExternal: (url) => invoke("open_external", { url }),
  getUserName: () => invoke("get_user_display_name"),
  on: subscribe,
};

let resolved: Promise<MiroBridge> | null = null;

/**
 * Resolves the bridge once. Outside Tauri (plain-browser preview harness) the
 * preview bridge is loaded; inside the Tauri webview the tauri bridge is used.
 */
function bridge(): Promise<MiroBridge> {
  if (!resolved) {
    resolved =
      inTauri
        ? Promise.resolve(tauriBridge)
        : import("./previewBridge").then((m) => m.previewBridge);
  }
  return resolved;
}

export const ipc: MiroBridge = {
  getSettings: async () => (await bridge()).getSettings(),
  setSettings: async (p) => (await bridge()).setSettings(p),
  getRuntimeStatus: async () => (await bridge()).getRuntimeStatus(),
  listModels: async () => (await bridge()).listModels(),
  probeModel: async (id) => (await bridge()).probeModel(id),
  startModelDownload: async (id) => (await bridge()).startModelDownload(id),
  cancelModelDownload: async (id) => (await bridge()).cancelModelDownload(id),
  deleteModel: async (id) => (await bridge()).deleteModel(id),
  listMicrophones: async () => (await bridge()).listMicrophones(),
  checkShortcut: async (s) => (await bridge()).checkShortcut(s),
  suspendShortcut: async () => (await bridge()).suspendShortcut(),
  resumeShortcut: async () => (await bridge()).resumeShortcut(),
  startMicProbe: async () => (await bridge()).startMicProbe(),
  stopMicProbe: async () => (await bridge()).stopMicProbe(),
  dismissOverlay: async () => (await bridge()).dismissOverlay(),
  stopRecording: async () => (await bridge()).stopRecording(),
  retryInsertion: async (id) => (await bridge()).retryInsertion(id),
  copyPendingTranscript: async (id) => (await bridge()).copyPendingTranscript(id),
  toggleDictation: async () => (await bridge()).toggleDictation(),
  switchMode: async (mode) => (await bridge()).switchMode(mode),
  getPendingTranscript: async (id) => (await bridge()).getPendingTranscript(id),
  pastePending: async (id) => (await bridge()).pastePending(id),
  getStats: async () => (await bridge()).getStats(),
  openModelsFolder: async () => (await bridge()).openModelsFolder(),
  openAppDataFolder: async () => (await bridge()).openAppDataFolder(),
  openExternal: async (url) => (await bridge()).openExternal(url),
  getUserName: async () => (await bridge()).getUserName(),
  on: <T,>(event: MiroEventName, handler: (payload: T) => void) => subscribe<T>(event, handler),
};

/** Narrow a payload that arrived as `unknown` from the event bus. */
export function asOverlayState(payload: unknown): OverlayState {
  const value = payload as OverlayState | null;
  if (!value || typeof value !== "object" || !("kind" in value)) return { kind: "hidden" };
  return value;
}

export function asLevelFrame(payload: unknown): LevelFrame {
  const value = payload as LevelFrame | null;
  if (!value || typeof value !== "object") return { level: 0, peak: 0 };
  return {
    level: clamp01(value.level),
    peak: clamp01(value.peak),
  };
}

function clamp01(n: unknown): number {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, value));
}

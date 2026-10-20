/**
 * DEV-ONLY preview harness.
 *
 * `npm run dev` and open the Vite URL in a browser to work on the interface
 * without a Rust build. It answers the same commands as the real core with
 * fixture data, so every state can be reviewed visually.
 *
 * A release build never loads this file: `ipc.ts` only imports it inside an
 * `import.meta.env.DEV` branch. It is not a fallback for the real app - if the
 * Tauri bridge is missing in a release build, calls fail instead of pretending.
 */
import type { MiroBridge, MiroEventName, ModelProgress, SettingsPatch } from "./ipc";
import { EVENTS } from "./ipc";
import type {
  LevelFrame,
  MicrophoneInfo,
  ModelInfo,
  OverlayState,
  RuntimeStatus,
  Settings,
  ShortcutCheck,
} from "./types";

const settings: Settings = {
  version: 1,
  shortcut: "Ctrl+Alt",
  mode: "push_to_talk",
  homeMode: "home",
  soundOn: true,
  microphone: null,
  modelId: "small.en",
  language: "en",
  maxRecordingSeconds: 300,
  cleanup: {
    enabled: true,
    normalizeWhitespace: true,
    capitalizeSentences: true,
    removeFillerWords: true,
    fillerWords: [
      "um",
      "umm",
      "uh",
      "uhh",
      "er",
      "erm",
      "hmm",
      "you know",
      "i mean",
      "like",
    ],
  },
  theme: "system",
  overlayPosition: "bottom-center",
  showTranscriptPreview: false,
  startOnLogin: false,
};

const models: ModelInfo[] = [
  {
    id: "tiny.en",
    name: "Tiny English",
    fileName: "ggml-tiny.en-q5_1.bin",
    sizeBytes: null,
    integrity: null,
    sourceUrl: "https://huggingface.co/ggerganov/whisper.cpp",
    sourceLabel: "huggingface.co/ggerganov/whisper.cpp",
    license: "MIT",
    languages: "English",
    parameters: "39 M",
    quality: "fast",
    recommended: false,
    status: "not_installed",
    installedBytes: null,
    targetPath: "models/ggml-tiny.en.bin",
    download: null,
  },
  {
    id: "base.en",
    name: "Base English",
    fileName: "ggml-base.en-q5_1.bin",
    sizeBytes: null,
    integrity: null,
    sourceUrl: "https://huggingface.co/ggerganov/whisper.cpp",
    sourceLabel: "huggingface.co/ggerganov/whisper.cpp",
    license: "MIT",
    languages: "English",
    parameters: "74 M",
    quality: "balanced",
    recommended: false,
    status: "installed",
    installedBytes: 147_964_211,
    targetPath: "models/ggml-base.en-q5_1.bin",
    download: null,
  },
  {
    id: "small.en",
    name: "Small English",
    fileName: "ggml-small.en-q5_1.bin",
    sizeBytes: null,
    integrity: null,
    sourceUrl: "https://huggingface.co/ggerganov/whisper.cpp",
    sourceLabel: "huggingface.co/ggerganov/whisper.cpp",
    license: "MIT",
    languages: "English",
    parameters: "244 M",
    quality: "accurate",
    recommended: true,
    status: "not_installed",
    installedBytes: null,
    targetPath: "models/ggml-small.en-q5_1.bin",
    download: null,
  },
];

const microphones: MicrophoneInfo[] = [
  { id: "default", label: "System default", isDefault: true, sampleRate: 48_000, channels: 2 },
  { id: "Microphone Array (AMD Audio Device)", label: "Microphone Array (AMD Audio Device)", isDefault: false, sampleRate: 48_000, channels: 2 },
];

type Listener<T> = (payload: T) => void;

const listeners = new Map<string, Set<Listener<never>>>();

function emit<T>(event: MiroEventName, payload: T): void {
  const set = listeners.get(event) as Set<Listener<T>> | undefined;
  if (!set) return;
  for (const handler of set) handler(payload);
}

function on<T>(event: MiroEventName, handler: (payload: T) => void): () => void {
  let set = listeners.get(event) as Set<Listener<T>> | undefined;
  if (!set) {
    set = new Set();
    listeners.set(event, set as Set<Listener<never>>);
  }
  set.add(handler);
  return () => set.delete(handler);
}

const forcedState = new URLSearchParams(window.location.search).get("state");

function overlay(state: OverlayState): void {
  emit(EVENTS.overlay, state);
}

let levelTimer: number | null = null;

function startLevels(): void {
  stopLevels();
  let t = 0;
  levelTimer = window.setInterval(() => {
    t += 1;
    const envelope = 0.35 + 0.3 * Math.sin(t / 7) + 0.18 * Math.sin(t / 2.3);
    const jitter = Math.random() * 0.22;
    const frame: LevelFrame = {
      level: Math.max(0, Math.min(1, envelope * 0.7 + jitter)),
      peak: Math.max(0, Math.min(1, envelope + jitter * 0.6)),
    };
    emit(EVENTS.micLevel, frame);
  }, 33);
}

function stopLevels(): void {
  if (levelTimer !== null) {
    window.clearInterval(levelTimer);
    levelTimer = null;
  }
}

function scriptedCycle(): void {
  const startedAtMs = Date.now();
  overlay({ kind: "recording", deviceLabel: "Microphone Array", startedAtMs, maxSeconds: 300 });
  startLevels();
  window.setTimeout(() => {
    stopLevels();
    overlay({ kind: "processing", startedAtMs: Date.now() });
    window.setTimeout(() => {
      overlay({ kind: "inserted", characters: 148, audioMs: 6400 });
      window.setTimeout(() => overlay({ kind: "hidden" }), 1200);
    }, 1400);
  }, 4200);
}

let demoCounter = 0;

export const previewBridge: MiroBridge = {
  async getSettings() {
    return structuredClone(settings);
  },
  async setSettings(patch: SettingsPatch) {
    Object.assign(settings, patch);
    if (patch.cleanup) Object.assign(settings.cleanup, patch.cleanup);
    emit(EVENTS.settings, structuredClone(settings));
    return structuredClone(settings);
  },
  async getRuntimeStatus(): Promise<RuntimeStatus> {
    return {
      version: "0.1.0",
      platform: "dev preview",
      modelsDir: "%APPDATA%\\app.miro.dictation\\models",
      engine: { state: "ready", modelId: settings.modelId, backend: "preview", detail: null },
      shortcut: { registered: true, shortcut: settings.shortcut, mechanism: "plugin", detail: "preview harness" },
      microphone: { state: "available", detail: null },
      temp: { state: "clean", detail: null },
    };
  },
  async listModels() {
    return structuredClone(models);
  },
  // Fixture sizes, so the confirmation dialog can be reviewed without a network.
  async probeModel(modelId: string) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    const known: Record<string, number> = {
      "tiny.en": 32_000_000,
      "base.en": 60_000_000,
      "small.en": 190_000_000,
    };
    return known[modelId] ?? null;
  },
  async startModelDownload(modelId: string) {
    const model = models.find((m) => m.id === modelId);
    if (!model) return;
    model.status = "downloading";
    const total = model.sizeBytes ?? 60_000_000;
    let received = 0;
    const tick = window.setInterval(() => {
      received = Math.min(total, received + total / 24);
      const payload: ModelProgress = {
        modelId,
        status: received >= total ? "verifying" : "downloading",
        receivedBytes: Math.round(received),
        totalBytes: total,
        detail: null,
      };
      emit(EVENTS.modelProgress, payload);
      if (received >= total) {
        window.clearInterval(tick);
        model.status = "installed";
        model.installedBytes = total;
        emit(EVENTS.modelProgress, { ...payload, status: "installed" } satisfies ModelProgress);
      }
    }, 220);
  },
  async cancelModelDownload(modelId: string) {
    const model = models.find((m) => m.id === modelId);
    if (model) model.status = "not_installed";
    emit(EVENTS.modelProgress, {
      modelId,
      status: "cancelled",
      receivedBytes: 0,
      totalBytes: model?.sizeBytes ?? null,
      detail: null,
    } satisfies ModelProgress);
  },
  async deleteModel(modelId: string) {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      model.status = "not_installed";
      model.installedBytes = null;
      model.download = null;
    }
  },
  async listMicrophones() {
    return structuredClone(microphones);
  },
  async checkShortcut(shortcut: string): Promise<ShortcutCheck> {
    return { ok: true, normalized: shortcut, reason: null, conflictWith: null };
  },
  async suspendShortcut() {},
  async resumeShortcut() {},
  async startMicProbe() {
    startLevels();
  },
  async stopMicProbe() {
    stopLevels();
  },
  async dismissOverlay() {
    stopLevels();
    overlay({ kind: "hidden" });
  },
  async stopRecording() {
    stopLevels();
    overlay({ kind: "processing", startedAtMs: Date.now() });
    window.setTimeout(() => {
      overlay({ kind: "inserted", characters: 96, audioMs: 3100 });
      window.setTimeout(() => overlay({ kind: "hidden" }), 1200);
    }, 1200);
  },
  async retryInsertion() {
    overlay({ kind: "inserted", characters: 96, audioMs: 3100 });
  },
  async copyPendingTranscript() {
    overlay({ kind: "inserted", characters: 96, audioMs: 3100 });
  },
  async toggleDictation() {
    demoCounter += 1;
    if (forcedState === "recording" || (forcedState === null && demoCounter % 2 === 1)) {
      scriptedCycle();
    } else {
      stopLevels();
      overlay({ kind: "hidden" });
    }
  },
  async openModelsFolder() {},
  async openAppDataFolder() {},
  async openExternal(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  on,
};

// Pin a single state for screenshots: ?state=recording|processing|inserted|error
if (forcedState) {
  window.setTimeout(() => {
    switch (forcedState) {
      case "recording":
        overlay({ kind: "recording", deviceLabel: "Microphone Array", startedAtMs: Date.now() - 7400, maxSeconds: 300 });
        startLevels();
        break;
      case "processing":
        overlay({ kind: "processing", startedAtMs: Date.now() });
        break;
      case "inserted":
        overlay({ kind: "inserted", characters: 148, audioMs: 6400 });
        break;
      case "error":
        overlay({ kind: "error", code: "focus_changed", detail: null, retryable: true, retryId: 1 });
        break;
      default:
        break;
    }
  }, 50);
}

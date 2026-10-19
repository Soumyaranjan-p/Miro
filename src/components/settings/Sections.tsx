import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText } from "../../lib/errors";
import { formatBytes, formatPercent, formatShortcut } from "../../lib/format";
import { useLevelHistory } from "../../lib/hooks";
import { ipc, type ModelProgress, type SettingsPatch } from "../../lib/ipc";
import type { MicrophoneInfo, ModelInfo, RuntimeStatus, Settings } from "../../lib/types";
import { IconDownload, IconFolder, IconKey, IconMic, IconTrash, IconWaveform } from "../icons";
import { LevelMeter } from "../overlay/LevelMeter";
import { Banner, Button, Mono, Pill, ProgressBar, Row, Section, Segmented } from "./Controls";
import { ShortcutField } from "./ShortcutField";

const DEFAULT_SHORTCUT = "Ctrl+Alt";

interface SectionProps {
  settings: Settings;
  update: (patch: SettingsPatch) => Promise<Settings>;
}

export function DictationSection({ settings, update }: SectionProps) {
  const commitShortcut = useCallback(
    async (shortcut: string) => {
      const check = await ipc.checkShortcut(shortcut);
      if (!check.ok) {
        return { ok: false, message: check.reason ?? "That shortcut is not available." };
      }
      await update({ shortcut: check.normalized ?? shortcut });
      return { ok: true };
    },
    [update],
  );

  return (
    <Section
      title="Dictation"
      icon={<IconKey size={16} />}
      description="Choose how Miro starts listening. The shortcut works while any other app is in front."
    >
      <Row
        label="Shortcut"
        hint={
          <>
            Default is <Mono>{formatShortcut(DEFAULT_SHORTCUT)}</Mono>. Miro reports a conflict instead of failing silently.
          </>
        }
      >
        <ShortcutField
          value={settings.shortcut}
          mode={settings.mode}
          defaultShortcut={DEFAULT_SHORTCUT}
          onCommit={commitShortcut}
        />
      </Row>

      <Row
        label="Mode"
        hint={
          settings.mode === "toggle"
            ? "Press once to start recording, press again to stop and insert."
            : "Hold the keys to record, release to transcribe and insert."
        }
      >
        <Segmented
          ariaLabel="Dictation mode"
          value={settings.mode}
          onChange={(mode) => void update({ mode })}
          options={[
            { value: "toggle", label: "Toggle" },
            { value: "push_to_talk", label: "Push to talk" },
          ]}
        />
      </Row>

      {settings.mode === "push_to_talk" && (
        <Banner tone="info" title="Push to talk uses a keyboard hook">
          While this mode is on, Miro watches key down and key up with the Windows low-level keyboard hook so releasing
          the keys stops the recording. It compares what it sees against your shortcut only, keeps nothing, and the hook
          is removed when you switch back to toggle mode.
        </Banner>
      )}
    </Section>
  );
}

export function MicrophoneSection({ settings, update }: SectionProps) {
  const [devices, setDevices] = useState<MicrophoneInfo[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const frames = useLevelHistory(probing, 32);
  const level = frames[frames.length - 1] ?? 0;

  const refresh = useCallback(async () => {
    try {
      setDevices(await ipc.listMicrophones());
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      void ipc.stopMicProbe();
    };
  }, []);

  const toggleProbe = useCallback(async () => {
    setProbeError(null);
    if (probing) {
      await ipc.stopMicProbe();
      setProbing(false);
      return;
    }
    try {
      await ipc.startMicProbe();
      setProbing(true);
    } catch (cause) {
      setProbing(false);
      setProbeError(String(cause));
    }
  }, [probing]);

  return (
    <Section
      title="Microphone"
      icon={<IconMic size={16} />}
      description="Audio is captured on its own thread, converted to 16 kHz mono in memory, and never written to disk."
      aside={
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>
          Refresh
        </Button>
      }
    >
      <Row label="Input device" hint="Windows default follows whatever you plug in next.">
        <select
          className="miro-field miro-select w-[240px]"
          value={settings.microphone ?? "default"}
          onChange={(event) =>
            void update({ microphone: event.target.value === "default" ? null : event.target.value })
          }
        >
          <option value="default">System default</option>
          {(devices ?? [])
            .filter((device) => !device.isDefault)
            .map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
        </select>
      </Row>

      <Row label="Input level" hint="Speak normally: the meter should move well past the small idle floor.">
        <div className="flex items-center gap-3">
          <div className="w-[180px]">
            <LevelMeter frames={probing ? frames : new Array(32).fill(0)} height={28} tone="accent" />
          </div>
          <Button size="sm" onClick={() => void toggleProbe()}>
            {probing ? "Stop test" : "Test"}
          </Button>
        </div>
      </Row>

      {probing && (
        <div className="text-[11.5px] text-muted">
          {"Listening\u2026 level "}{(level * 100).toFixed(0)}%. Nothing is recorded, transcribed or saved by this test.
        </div>
      )}

      {probeError && (
        <Banner tone="danger" title="The microphone could not be opened">
          {probeError}
        </Banner>
      )}

      <div className="text-[11.5px] leading-[1.55] text-muted">
        If the list is empty or Windows blocks access, check{" "}
        <Mono>Settings &gt; Privacy &amp; security &gt; Microphone</Mono> and allow desktop apps to use the microphone.
      </div>
    </Section>
  );
}

export function ModelSection({ settings, update, status }: SectionProps & { status: RuntimeStatus | null }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [consentFor, setConsentFor] = useState<ConsentRequest | null>(null);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setModels(await ipc.listModels());
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = ipc.on<ModelProgress>("miro://model-progress", (payload) => {
      setProgress(payload);
      void refresh();
    });
    return off;
  }, [refresh]);

  const selected = models?.find((model) => model.id === settings.modelId) ?? null;
  const englishOnly = selected ? selected.languages === "English" : true;

  const startDownload = useCallback(
    async (model: ModelInfo) => {
      setError(null);
      setConsentFor(null);
      try {
        await ipc.startModelDownload(model.id);
      } catch (cause) {
        setError(errorText(cause));
      }
    },
    [],
  );

  // The size shown in the confirmation dialog is the one the source reports,
  // asked for at the moment the user asks to download - never a stale number
  // compiled into the application.
  const askDownload = useCallback(async (model: ModelInfo) => {
    setError(null);
    setProbingId(model.id);
    try {
      const size = await ipc.probeModel(model.id);
      setConsentFor({ model, sizeBytes: size ?? model.sizeBytes });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setProbingId(null);
    }
  }, []);

  const languageOptions = useMemo(
    () => [
      { value: "auto", label: "Detect automatically" },
      { value: "en", label: "English" },
      { value: "es", label: "Spanish" },
      { value: "fr", label: "French" },
      { value: "de", label: "German" },
      { value: "it", label: "Italian" },
      { value: "pt", label: "Portuguese" },
      { value: "nl", label: "Dutch" },
      { value: "ru", label: "Russian" },
      { value: "ja", label: "Japanese" },
      { value: "ko", label: "Korean" },
      { value: "zh", label: "Chinese" },
    ],
    [],
  );

  return (
    <Section
      title="Speech model"
      icon={<IconWaveform size={16} />}
      description="Transcription runs entirely on this machine. A model has to be downloaded once, with your explicit confirmation."
      aside={
        <Button size="sm" variant="ghost" onClick={() => void ipc.openModelsFolder()}>
          <IconFolder size={14} />
          Open folder
        </Button>
      }
    >
      {error && (
        <Banner tone="danger" title="The model list could not be read">
          {error}
        </Banner>
      )}

      <Row
        label="Language"
        hint={
          englishOnly
            ? "The selected model is English-only, so the language is fixed."
            : "Pin the spoken language, or let the engine detect it."
        }
      >
        <select
          className="miro-field miro-select w-[220px]"
          disabled={englishOnly}
          value={englishOnly ? "en" : settings.language}
          onChange={(event) => void update({ language: event.target.value })}
        >
          {englishOnly ? (
            <option value="en">English</option>
          ) : (
            languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          )}
        </select>
      </Row>

      <div className="flex flex-col gap-2">
        {(models ?? []).map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            selected={model.id === settings.modelId}
            progress={progress?.modelId === model.id ? progress : null}
            onSelect={() => void update({ modelId: model.id })}
            onAskDownload={() => void askDownload(model)}
            probing={probingId === model.id}
            onCancel={() => void ipc.cancelModelDownload(model.id).then(refresh)}
            onDelete={() => void ipc.deleteModel(model.id).then(refresh)}
          />
        ))}
        {models === null && <div className="text-[11.5px] text-muted">Reading the models folder…</div>}      </div>

      {consentFor && (
        <ConsentPanel
          request={consentFor}
          onCancel={() => setConsentFor(null)}
          onConfirm={() => void startDownload(consentFor.model)}
        />
      )}

      <div className="text-[11.5px] leading-[1.55] text-muted">
        Files are stored in <Mono>{status?.modelsDir ?? "the Miro models folder"}</Mono>. To install a model offline,
        drop a <Mono>ggml-*.bin</Mono> file with the matching name into that folder: Miro verifies it and picks it up.
      </div>
    </Section>
  );
}

function ModelCard({
  model,
  selected,
  progress,
  probing,
  onSelect,
  onAskDownload,
  onCancel,
  onDelete,
}: {
  model: ModelInfo;
  selected: boolean;
  progress: ModelProgress | null;
  probing: boolean;
  onSelect: () => void;
  onAskDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const downloading = model.status === "downloading";
  const fraction = progress?.totalBytes ? progress.receivedBytes / progress.totalBytes : 0;
  const sizeLabel = model.sizeBytes === null ? "size checked with the source" : formatBytes(model.sizeBytes);

  return (
    <div
      className="rounded-[10px] border px-3 py-2.5"
      style={{
        borderColor: selected ? "var(--miro-accent)" : "var(--miro-line)",
        background: selected ? "var(--miro-accent-soft)" : "var(--miro-surface-2)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-ink">{model.name}</span>
            {model.recommended && <Pill tone="accent">Recommended</Pill>}
            {selected && <Pill tone="accent">In use</Pill>}
            {model.status === "corrupt" && <Pill tone="danger">Damaged</Pill>}
            {model.status === "partial" && <Pill tone="warn">Incomplete</Pill>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
            <span>{model.parameters} parameters</span>
            <span>·</span>
            <span>{sizeLabel}</span>
            <span>·</span>
            <span>{model.languages}</span>
            <span>·</span>
            <span>{model.quality}</span>
            <span>·</span>
            <span title={model.sourceUrl}>{model.sourceLabel}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {model.status === "installed" && !selected && (
            <Button size="sm" onClick={onSelect}>
              Use
            </Button>
          )}
          {model.status === "installed" && (
            <Button size="sm" variant="ghost" onClick={onDelete} title="Delete this model file">
              <IconTrash size={14} />
            </Button>
          )}
          {model.status === "not_installed" && (
            <Button size="sm" variant="primary" onClick={onAskDownload} disabled={probing}>
              <IconDownload size={14} />
              {probing ? "Checking size" : "Download"}
            </Button>
          )}
          {(model.status === "partial" || model.status === "corrupt") && (
            <>
              <Button size="sm" variant="primary" onClick={onAskDownload} disabled={probing}>
                {model.status === "partial" ? "Resume" : "Re-download"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} title="Delete this model file">
                <IconTrash size={14} />
              </Button>
            </>
          )}
          {downloading && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {downloading && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1">
            <ProgressBar
              value={fraction}
              label={`Downloading ${model.name}`}
            />
          </div>
          <span className="miro-keys shrink-0 text-[11px] text-muted">
            {formatBytes(progress?.receivedBytes ?? 0)} / {formatBytes(progress?.totalBytes ?? model.sizeBytes)}{" "}
            {formatPercent(progress?.receivedBytes ?? 0, progress?.totalBytes ?? model.sizeBytes)}
          </span>
        </div>
      )}
    </div>
  );
}

export interface ConsentRequest {
  model: ModelInfo;
  sizeBytes: number | null;
}

function ConsentPanel({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConsentRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { model, sizeBytes } = request;
  return (
    <div
      className="rounded-[10px] border p-3"
      style={{ borderColor: "var(--miro-line-strong)", background: "var(--miro-surface)" }}
    >
      <div className="text-[12.5px] font-semibold text-ink">Download {model.name}?</div>
      <dl className="mt-2 grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 text-[11.5px]">
        <dt className="text-muted">Model</dt>
        <dd className="text-ink">{model.name}</dd>
        <dt className="text-muted">Size on disk</dt>
        <dd className="text-ink">
          {sizeBytes === null ? "reported by the source when the download starts" : formatBytes(sizeBytes)}
        </dd>
        <dt className="text-muted">Source</dt>
        <dd className="truncate text-ink" title={model.sourceUrl}>
          {model.sourceLabel}/{model.fileName}
        </dd>
        <dt className="text-muted">Licence</dt>
        <dd className="text-ink">{model.license}</dd>
        <dt className="text-muted">SHA-256</dt>
        <dd className="miro-keys truncate text-ink" title={model.integrity ?? undefined}>
          {model.integrity ?? "not published for this file"}
        </dd>
      </dl>
      <p className="mt-2 text-[11.5px] leading-[1.55] text-muted">
        Miro downloads this file from the address above and nothing else. When it finishes, the file is checked before
        it is used: exact byte count and the file's own header always, and a SHA-256 whenever a digest is known for it.
        You can cancel at any time and resume later.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Not now
        </Button>
        <Button size="sm" variant="primary" onClick={onConfirm}>
          <IconDownload size={14} />
          {sizeBytes === null ? "Download" : `Download ${formatBytes(sizeBytes)}`}
        </Button>
      </div>
    </div>
  );
}

export function PrivacySection() {
  return (
    <Section
      title="Privacy"
      icon={<IconKey size={16} />}
      description="These are design constraints in the code, not settings you can accidentally turn off."
    >
      <ul className="flex flex-col gap-1.5 text-[11.5px] leading-[1.55] text-muted">
        <li>Audio lives in memory while you speak and is dropped the moment transcription ends.</li>
        <li>Transcripts are never written to disk, never cached between sessions and never sent anywhere.</li>
        <li>There is no database and no history screen, by design.</li>
        <li>
          Stored on disk: your settings and any model files you downloaded. Nothing else. See{" "}
          <Mono>docs/PRIVACY.md</Mono>.
        </li>
        <li>The only network request Miro can make is the model download you confirm above.</li>
        <li>A failed insertion keeps the text in memory for a short retry window, then zeroes it.</li>
      </ul>
      <Banner tone="info" title="What Miro does not claim">
        Miro minimises retention and cleans up after itself; it does not promise cryptographic erasure of memory.
      </Banner>
    </Section>
  );
}

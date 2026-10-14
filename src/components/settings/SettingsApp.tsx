import { Logo } from "../Logo";
import { useRuntimeStatus, useSettings } from "../../lib/hooks";
import { isPreview } from "../../lib/ipc";
import { Banner } from "./Controls";
import { AppearanceSection, SystemSection, TextSection } from "./Preferences";
import { DictationSection, MicrophoneSection, ModelSection, PrivacySection } from "./Sections";
import { StatusStrip } from "./StatusStrip";

export function SettingsApp() {
  const { settings, error, update } = useSettings();
  const { status } = useRuntimeStatus();

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-[12.5px] text-muted">
        {error ? `Settings could not be read: ${error}` : "Loading settings\u2026"}
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto flex max-w-[760px] flex-col gap-3.5 px-6 py-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Miro</h1>
              <p className="text-[12px] text-muted">{"Speak naturally. Type everywhere."}</p>
            </div>
          </div>
          <div className="text-right text-[11.5px] leading-[1.6] text-muted">
            <div>Settings save as you change them.</div>
            <div>Audio and transcripts stay in memory.</div>
          </div>
        </header>

        {isPreview && (
          <Banner tone="warn" title="Browser preview harness">
            This page is running outside the Miro app, so every value is fixture data from{" "}
            <span className="miro-keys">src/lib/previewBridge.ts</span>. Nothing here talks to your machine.
          </Banner>
        )}

        {error && (
          <Banner tone="danger" title="Settings could not be read">
            {error}
          </Banner>
        )}

        <StatusStrip status={status} />

        <DictationSection settings={settings} update={update} />
        <MicrophoneSection settings={settings} update={update} />
        <ModelSection settings={settings} update={update} status={status} />
        <TextSection settings={settings} update={update} />
        <AppearanceSection settings={settings} update={update} />
        <SystemSection settings={settings} update={update} status={status} />
        <PrivacySection />

        <footer className="flex items-center justify-between px-1 pt-0.5 pb-2 text-[11px] text-faint">
          <span>
            Miro {status?.version ?? "0.1.0"} {"\u00b7"} {status?.platform ?? "Windows"}
          </span>
          <span>Local-only dictation {"\u00b7"} no history, no account, no cloud</span>
        </footer>
      </div>
    </div>
  );
}

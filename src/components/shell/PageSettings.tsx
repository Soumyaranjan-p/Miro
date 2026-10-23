import { useRuntimeStatus, useSettings } from "../../lib/hooks";
import { isPreview } from "../../lib/ipc";
import { Banner } from "../settings/Controls";
import { AppearanceSection, SystemSection, TextSection } from "../settings/Preferences";
import { DictationSection, MicrophoneSection, ModelSection, PrivacySection } from "../settings/Sections";
import { StatusStrip } from "../settings/StatusStrip";

/**
 * The Settings page: the same sections the standalone settings window used to
 * render, living inside the shell. Values save as they change; audio and
 * transcripts stay in memory.
 */
export function PageSettings() {
  const { settings, error, update } = useSettings();
  const { status } = useRuntimeStatus();

  return (
    <div className="msh-page" style={{ maxWidth: 780 }}>
      <header className="msh-page__head">
        <div>
          <h1>Settings</h1>
          <p>Settings save as you change them. Audio and transcripts stay in memory.</p>
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

      {settings ? (
        <>
          <DictationSection settings={settings} update={update} />
          <MicrophoneSection settings={settings} update={update} />
          <ModelSection settings={settings} update={update} status={status} />
          <TextSection settings={settings} update={update} />
          <AppearanceSection settings={settings} update={update} />
          <SystemSection settings={settings} update={update} status={status} />
          <PrivacySection />
        </>
      ) : (
        <div className="text-[12.5px] text-muted">{"Loading settings\u2026"}</div>
      )}

      <footer className="flex items-center justify-between px-1 pb-2 pt-1 text-[11px] text-faint">
        <span>
          Miro {status?.version ?? "0.1.0"} {"\u00b7"} {status?.platform ?? "Windows"}
        </span>
        <span>{"Local-only dictation \u00b7 no history, no account, no cloud"}</span>
      </footer>
    </div>
  );
}

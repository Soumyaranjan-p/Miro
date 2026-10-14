import { useEffect, useState } from "react";
import { positionLabel, themeLabel } from "../../lib/format";
import { ipc, type SettingsPatch } from "../../lib/ipc";
import type { RuntimeStatus, Settings } from "../../lib/types";
import { IconFolder, IconMonitor, IconMoon, IconSparkle, IconSun } from "../icons";
import { Banner, Button, Mono, Row, Section, Segmented, Toggle } from "./Controls";

interface SectionProps {
  settings: Settings;
  update: (patch: SettingsPatch) => Promise<Settings>;
}

const FILLER_DEFAULT = "um, uh, erm, you know, like";

export function TextSection({ settings, update }: SectionProps) {
  const cleanup = settings.cleanup;
  const [draftFillers, setDraftFillers] = useState(cleanup.fillerWords.join(", "));

  useEffect(() => {
    setDraftFillers(cleanup.fillerWords.join(", "));
  }, [cleanup.fillerWords]);

  const commitFillers = () => {
    const words = draftFillers
      .split(",")
      .map((word) => word.trim())
      .filter((word) => word.length > 0);
    void update({ cleanup: { ...cleanup, fillerWords: words } });
  };

  return (
    <Section
      title="Text"
      icon={<IconSparkle size={16} />}
      description="Clean-up is a fixed set of rules with no model, no network call and no surprises. With it off you get exactly what the engine produced, trimmed."
    >
      <Row label="Clean up text" hint="Off means raw engine output, trimmed only.">
        <Toggle
          label="Clean up text"
          checked={cleanup.enabled}
          onChange={(enabled) => void update({ cleanup: { ...cleanup, enabled } })}
        />
      </Row>

      {cleanup.enabled && (
        <div className="ml-0 flex flex-col gap-3 border-l pl-3" style={{ borderColor: "var(--miro-line)" }}>
          <Row label="Normalise whitespace" hint="Collapse double spaces and stray line breaks.">
            <Toggle
              label="Normalise whitespace"
              checked={cleanup.normalizeWhitespace}
              onChange={(normalizeWhitespace) => void update({ cleanup: { ...cleanup, normalizeWhitespace } })}
            />
          </Row>
          <Row label="Capitalise sentences" hint="Uppercase the first letter of a sentence, and the word 'I'.">
            <Toggle
              label="Capitalise sentences"
              checked={cleanup.capitalizeSentences}
              onChange={(capitalizeSentences) => void update({ cleanup: { ...cleanup, capitalizeSentences } })}
            />
          </Row>
          <Row
            label="Remove filler words"
            hint="Off by default. Terms that look like fillers inside real words are left alone."
          >
            <Toggle
              label="Remove filler words"
              checked={cleanup.removeFillerWords}
              onChange={(removeFillerWords) => void update({ cleanup: { ...cleanup, removeFillerWords } })}
            />
          </Row>
          {cleanup.removeFillerWords && (
            <Row label="Filler list" stacked hint="Comma separated. Matched as whole words, case-insensitively.">
              <div className="flex items-center gap-2">
                <input
                  className="miro-field miro-keys"
                  value={draftFillers}
                  placeholder={FILLER_DEFAULT}
                  onChange={(event) => setDraftFillers(event.target.value)}
                  onBlur={commitFillers}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitFillers();
                  }}
                />
                <Button size="sm" onClick={commitFillers}>
                  Apply
                </Button>
              </div>
            </Row>
          )}
        </div>
      )}

      <Banner tone="info" title="Technical terms are protected">
        Known products, acronyms and code-like words (TypeScript, npm, GPU, iOS, K8s style tokens) keep their casing
        even when sentence capitalisation is on.
      </Banner>
    </Section>
  );
}

export function AppearanceSection({ settings, update }: SectionProps) {
  return (
    <Section
      title="Appearance"
      icon={<IconMonitor size={16} />}
      description="Light and dark are built from the same tokens, so nothing shifts between them."
    >
      <Row label="Theme" hint={`Following the system by default. Currently: ${themeLabel(settings.theme).toLowerCase()}.`}>
        <Segmented
          ariaLabel="Theme"
          value={settings.theme}
          onChange={(theme) => void update({ theme })}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Row>

      <Row label="Overlay position" hint={`Shown on the monitor you are working on. Now: ${positionLabel(settings.overlayPosition)}.`}>
        <Segmented
          ariaLabel="Overlay position"
          value={settings.overlayPosition}
          onChange={(overlayPosition) => void update({ overlayPosition })}
          options={[
            { value: "bottom-center", label: "Bottom centre" },
            { value: "bottom-right", label: "Bottom right" },
            { value: "center", label: "Centre" },
          ]}
        />
      </Row>

      <Row label="Theme icons" hint="Decorative only.">
        <span className="flex items-center gap-2 text-faint">
          <IconSun size={15} />
          <IconMonitor size={15} />
          <IconMoon size={15} />
        </span>
      </Row>
    </Section>
  );
}

export function SystemSection({
  settings,
  update,
  status,
}: SectionProps & { status: RuntimeStatus | null }) {
  return (
    <Section
      title="System"
      icon={<IconFolder size={16} />}
      description="Start-up behaviour and the hard limits Miro enforces so a forgotten recording cannot run forever."
    >
      <Row label="Start on login" hint="Off by default. Adds Miro to the per-user start-up list.">
        <Toggle
          label="Start on login"
          checked={settings.startOnLogin}
          onChange={(startOnLogin) => void update({ startOnLogin })}
        />
      </Row>

      <Row
        label="Maximum recording length"
        hint="Miro stops and transcribes at this limit, with a clear message. Between 30 and 600 seconds."
      >
        <div className="flex items-center gap-2">
          <input
            className="miro-field miro-keys w-[76px] text-right"
            type="number"
            min={30}
            max={600}
            step={10}
            value={settings.maxRecordingSeconds}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(next) && next >= 30 && next <= 600) {
                void update({ maxRecordingSeconds: next });
              }
            }}
          />
          <span className="text-[11.5px] text-muted">seconds</span>
        </div>
      </Row>

      <Row label="Files" hint={<Mono>{status?.modelsDir ?? "models folder"}</Mono>}>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => void ipc.openModelsFolder()}>
            Models
          </Button>
          <Button size="sm" onClick={() => void ipc.openAppDataFolder()}>
            App data
          </Button>
        </div>
      </Row>
    </Section>
  );
}

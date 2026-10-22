import { useCallback } from "react";
import { formatShortcut } from "../../lib/format";
import { useRuntimeStatus, useSettings } from "../../lib/hooks";
import { ipc, type SettingsPatch } from "../../lib/ipc";
import type { HotkeyStatus } from "../../lib/types";
import { IconKeyboard, IconIncident } from "./Icons";
import { IconMic } from "../icons";
import { Banner, Mono, Pill, Section } from "../settings/Controls";
import { ShortcutField, type ShortcutCommitResult } from "../settings/ShortcutField";

/**
 * All three rebindable hotkeys on one page: the dictation hold, the Normal
 * mode switch and the Incident mode switch. The registry is suspended while a
 * field captures, so the very keys being recorded arrive as keystrokes.
 */
export function PageShortcuts() {
  const { settings, update } = useSettings();
  const { status } = useRuntimeStatus(5000);

  if (!settings) {
    return (
      <div className="msh-page">
        <header className="msh-page__head">
          <h1>Shortcuts</h1>
          <p>{"Loading settings\u2026"}</p>
        </header>
      </div>
    );
  }

  return (
    <div className="msh-page">
      <header className="msh-page__head">
        <h1>Shortcuts</h1>
        <p>
          Every trigger lives here. Rebind freely: Miro refuses a combination instead of failing silently, and the
          change applies everywhere at once.
        </p>
      </header>

      <Section
        title="Dictation"
        icon={<IconMic size={16} />}
        description="Hold the key anywhere in Windows, speak, release: the words are typed where you are."
      >
        <HotkeyRow
          settings={settings}
          update={update}
          fieldName="shortcut"
          defaultShortcut="ControlRight"
          label="Dictation key"
          hint={
            <>
              Default is the right <Mono>Ctrl</Mono> key. This one starts and stops recordings.
            </>
          }
          mode={settings.mode}
          runtime={status?.hotkeys.find((entry) => entry.role === "dictation")}
        />
      </Section>

      <Section
        title="Normal mode"
        icon={<IconKeyboard />}
        description="Flips the whole app back to Normal mode: dictation live, fox calm."
      >
        <HotkeyRow
          settings={settings}
          update={update}
          fieldName="normalShortcut"
          defaultShortcut="Ctrl+Alt"
          label="Normal mode hotkey"
          hint={
            <>
              Default is <Mono>Ctrl+Alt</Mono>. Fires as a press, not a hold.
            </>
          }
          mode="push_to_talk"
          runtime={status?.hotkeys.find((entry) => entry.role === "normal")}
        />
      </Section>

      <Section
        title="Incident mode"
        icon={<IconIncident />}
        description="Flips the app into Incident mode: dictation paused, fox on guard."
      >
        <HotkeyRow
          settings={settings}
          update={update}
          fieldName="incidentShortcut"
          defaultShortcut="Ctrl+Alt+Space"
          label="Incident mode hotkey"
          hint={
            <>
              Default is <Mono>Ctrl+Alt+Space</Mono>. Keep the mode keys one press apart so they are hard to confuse.
            </>
          }
          mode="push_to_talk"
          runtime={status?.hotkeys.find((entry) => entry.role === "incident")}
        />
      </Section>

      <Banner tone="info" title="How the keys reach Miro">
        Where Windows allows it, keys are registered with the operating system. A key alone with no modifiers (like the
        dictation default) uses a keyboard hook instead: Miro compares what it sees against your shortcut only and passes
        every other key straight through. The Shortcuts page shows which mechanism each key ended up on.
      </Banner>
    </div>
  );
}

type HotkeyFieldName = "shortcut" | "normalShortcut" | "incidentShortcut";

function HotkeyRow({
  settings,
  update,
  fieldName,
  defaultShortcut,
  label,
  hint,
  mode,
  runtime,
}: {
  settings: { shortcut: string; normalShortcut: string; incidentShortcut: string; mode: "toggle" | "push_to_talk" };
  update: (patch: SettingsPatch) => Promise<unknown>;
  fieldName: HotkeyFieldName;
  defaultShortcut: string;
  label: string;
  hint: React.ReactNode;
  mode: "toggle" | "push_to_talk";
  runtime?: HotkeyStatus;
}) {
  const commit = useCallback(
    async (shortcut: string): Promise<ShortcutCommitResult> => {
      const check = await ipc.checkShortcut(shortcut);
      if (!check.ok) {
        return { ok: false, message: check.reason ?? "That shortcut is not available." };
      }
      await update({ [fieldName]: check.normalized ?? shortcut } as SettingsPatch);
      return { ok: true };
    },
    [fieldName, update],
  );

  const tone = runtime?.registered ? (runtime.mechanism === "keyboard_hook" ? "warn" : "success") : "danger";
  const state =
    runtime === undefined
      ? null
      : runtime.registered
        ? `Live \u00b7 ${runtime.mechanism === "keyboard_hook" ? "keyboard hook" : "system"}`
        : "Not registered";

  return (
    <div className="flex flex-col gap-1" role="group" aria-label={label}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
            {label}
            {state ? <Pill tone={tone}>{state}</Pill> : null}
          </div>
          {hint && <div className="mt-0.5 max-w-[52ch] text-[11.5px] leading-[1.5] text-muted">{hint}</div>}
        </div>
        <div className="shrink-0">
          <ShortcutField
            value={settings[fieldName]}
            mode={mode}
            defaultShortcut={defaultShortcut}
            onCommit={commit}
          />
        </div>
      </div>
    </div>
  );
}

/** Kept public for the StatusStrip-style callers that show a normalized string. */
export function formatHotkey(value: string): string {
  return formatShortcut(value);
}

import { useCallback, useEffect, useRef, useState } from "react";
import { formatShortcut, isModifierOnly, shortcutTokens } from "../../lib/format";
import { ipc } from "../../lib/ipc";
import type { DictationMode } from "../../lib/types";
import { Button, Mono } from "./Controls";

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);

/**
 * Maps a DOM key event to the token vocabulary the Rust side owns, which is
 * the W3C `KeyboardEvent.code` naming (`KeyA`, `Digit1`, `Space`, `ArrowUp`).
 * Using the codes directly means there is exactly one naming authority: the
 * shortcut plugin's own parser.
 */
function keyTokenFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const code = event.code;
  if (!code || code === "Unidentified") return null;
  // The plugin knows the main Enter key; the numpad one is folded into it.
  if (code === "NumpadEnter") return "Enter";
  return code;
}

function modifiersFromEvent(event: KeyboardEvent): string[] {
  const tokens: string[] = [];
  if (event.ctrlKey) tokens.push("Ctrl");
  if (event.altKey) tokens.push("Alt");
  if (event.shiftKey) tokens.push("Shift");
  if (event.metaKey) tokens.push("Win");
  return tokens;
}

export interface ShortcutCommitResult {
  ok: boolean;
  message?: string;
}

export function ShortcutField({
  value,
  mode,
  defaultShortcut,
  onCommit,
}: {
  value: string;
  mode: DictationMode;
  defaultShortcut: string;
  onCommit: (shortcut: string) => Promise<ShortcutCommitResult>;
}) {
  const [capturing, setCapturing] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const beginCapture = useCallback(async () => {
    setMessage(null);
    setDraft(null);
    setHeld([]);
    setCapturing(true);
    // The global shortcut is released while capturing so the very combination
    // the user is trying to record reaches this window.
    await ipc.suspendShortcut();
  }, []);

  const endCapture = useCallback(async () => {
    setCapturing(false);
    setHeld([]);
    setDraft(null);
    await ipc.resumeShortcut();
  }, []);

  const commit = useCallback(
    async (shortcut: string) => {
      setBusy(true);
      try {
        const result = await onCommit(shortcut);
        if (result.ok) {
          setMessage(null);
          await endCapture();
        } else {
          setMessage(result.message ?? "That shortcut could not be used.");
        }
      } finally {
        setBusy(false);
      }
    },
    [endCapture, onCommit],
  );

  useEffect(() => {
    if (!capturing) return;
    captureRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        void endCapture();
        return;
      }
      const modifiers = modifiersFromEvent(event);
      if (MODIFIER_KEYS.has(event.key)) {
        setHeld(modifiers);
        const modifierOnly = modifiers.join("+");
        setDraft(modifiers.length > 0 ? modifierOnly : null);
        return;
      }
      const key = keyTokenFromEvent(event);
      if (!key) return;
      const combo = [...modifiers, key].join("+");
      setHeld(modifiers);
      setDraft(combo);
      if (event.key === "Enter" && modifiers.length === 0) return;
      void commit(combo);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(event.key)) setHeld(modifiersFromEvent(event));
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [capturing, commit, endCapture]);

  // Safety net: leaving the window while capturing must never leave the
  // global shortcut unregistered.
  useEffect(() => {
    if (!capturing) return;
    const onBlur = () => void endCapture();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [capturing, endCapture]);

  const modifierOnlyDraft = draft !== null && isModifierOnly(draft);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        ref={captureRef}
        tabIndex={-1}
        className={`flex h-8 min-w-[190px] items-center justify-between gap-3 rounded-[10px] border px-3 outline-none ${
          capturing ? "border-accent bg-accent-soft" : "border-line bg-surface-2"
        }`}
      >
        {capturing ? (
          <span className="miro-keys text-[12.5px] text-ink">
            {draft ? formatShortcut(draft) : <span className="text-muted">{"Press keys\u2026"}</span>}
          </span>
        ) : (
          <span className="miro-keys text-[12.5px] text-ink">{formatShortcut(value)}</span>
        )}
        {!capturing && (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => void beginCapture()}>
              Change
            </Button>
          </span>
        )}
        {capturing && (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => void endCapture()} disabled={busy}>
              Cancel
            </Button>
          </span>
        )}
      </div>

      <div className="flex min-h-[16px] items-center gap-2">
        {capturing && (
          <span className="text-[11px] text-muted">
            {held.length > 0 && modifierOnlyDraft ? (
              <>
                {formatShortcut(draft ?? "")} {"held \u2014 add a key, or"}{" "}
                <button
                  type="button"
                  className="cursor-pointer underline decoration-dotted"
                  onClick={() => void commit(draft ?? "")}
                >
                  use modifiers only
                </button>
              </>
            ) : (
              <>
                {"Hold modifiers and press a key"}
                {mode === "push_to_talk" ? ", or hold modifiers alone" : ""}. Esc cancels.
              </>
            )}
          </span>
        )}
        {!capturing && message && <span className="text-[11px] text-danger">{message}</span>}
        {!capturing && !message && value !== defaultShortcut && (
          <button
            type="button"
            className="cursor-pointer text-[11px] text-muted underline decoration-dotted"
            onClick={() => void commit(defaultShortcut)}
          >
            Reset to {formatShortcut(defaultShortcut)}
          </button>
        )}
      </div>

      {!capturing && mode === "toggle" && isModifierOnly(value) && (
        <span className="text-[11px] text-danger">
          Toggle mode needs a non-modifier key. <Mono>Ctrl+Alt</Mono> style shortcuts only work as push-to-talk.
        </span>
      )}
      {!capturing && shortcutTokens(value).length === 0 && (
        <span className="text-[11px] text-danger">No shortcut set.</span>
      )}
    </div>
  );
}

import type { OverlayPosition, ThemePreference } from "./types";

/** `3:04` / `0:07` wall-clock style timer for the overlay. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDurationWords(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  return `${Math.round(seconds)} s`;
}

/** `12.4 MB`, `148 MB` - model sizes as users read them. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "-";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatPercent(received: number, total: number | null): string {
  if (!total || total <= 0) return "";
  const pct = Math.min(100, Math.max(0, (received / total) * 100));
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Win"] as const;

const DISPLAY_ALIASES: Record<string, string> = {
  commandorcontrol: "Ctrl",
  cmdorctrl: "Ctrl",
  control: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  option: "Alt",
  altgr: "AltGr",
  shift: "Shift",
  super: "Win",
  meta: "Win",
  win: "Win",
  windows: "Win",
  escape: "Esc",
  space: "Space",
  " ": "Space",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  return: "Enter",
  enter: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "Page Up",
  pagedown: "Page Down",
  capslock: "Caps Lock",
  printscreen: "Print Screen",
  minus: "Minus",
  equal: "Equals",
  comma: "Comma",
  period: "Full stop",
  slash: "Slash",
  semicolon: "Semicolon",
  backquote: "Backtick",
  bracketleft: "Open bracket",
  bracketright: "Close bracket",
};
/** Turns one stored token into the label a person expects to read. */
function displayPart(part: string): string {
  const alias = DISPLAY_ALIASES[part.toLowerCase()];
  if (alias) return alias;

  // W3C code names, which is what Miro stores: KeyA, Digit1, Numpad5.
  if (part.length === 4 && part.startsWith("Key")) return part.slice(3).toUpperCase();
  if (part.length === 6 && part.startsWith("Digit")) return part.slice(5);
  if (part.startsWith("Numpad")) return `Num ${part.slice(6)}`;

  if (part.length === 1) return part.toUpperCase();
  if (/^f\d{1,2}$/i.test(part)) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export function shortcutTokens(shortcut: string): string[] {
  return shortcut
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Human form: `Ctrl + Alt + Space`, with modifiers in a stable order. */
export function formatShortcut(shortcut: string): string {
  const parts = shortcutTokens(shortcut).map(displayPart);
  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier));
  const rest = parts.filter((part) => !(MODIFIER_ORDER as readonly string[]).includes(part));
  return [...modifiers, ...rest].join(" + ");
}

/** True when the combination is only modifiers - push-to-talk still works, toggle does not. */
export function isModifierOnly(shortcut: string): boolean {
  const tokens = shortcutTokens(shortcut);
  if (tokens.length === 0) return false;
  return tokens.every((part) => MODIFIER_ORDER.includes(displayPart(part) as (typeof MODIFIER_ORDER)[number]));
}

export function positionLabel(position: OverlayPosition): string {
  switch (position) {
    case "bottom-center":
      return "Bottom centre";
    case "bottom-right":
      return "Bottom right";
    case "center":
      return "Centre";
  }
}

export function themeLabel(theme: ThemePreference): string {
  switch (theme) {
    case "system":
      return "System";
    case "light":
      return "Light";
    case "dark":
      return "Dark";
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}\u2026`;
}

import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatDurationWords, formatPercent, formatShortcut, isModifierOnly, shortcutTokens, truncate } from "./format";

describe("shortcut display", () => {
  it("renders stored W3C codes the way a person reads them", () => {
    expect(formatShortcut("Ctrl+Alt+Space")).toBe("Ctrl + Alt + Space");
    expect(formatShortcut("Ctrl+Shift+KeyA")).toBe("Ctrl + Shift + A");
    expect(formatShortcut("Ctrl+Digit1")).toBe("Ctrl + 1");
    expect(formatShortcut("Ctrl+ArrowUp")).toBe("Ctrl + Up");
    expect(formatShortcut("Ctrl+Numpad5")).toBe("Ctrl + Num 5");
    expect(formatShortcut("Ctrl+F5")).toBe("Ctrl + F5");
  });

  it("normalises modifier order regardless of how it was stored", () => {
    expect(formatShortcut("Shift+Ctrl+Alt+KeyM")).toBe("Ctrl + Alt + Shift + M");
  });

  it("keeps an all-modifier combination readable", () => {
    expect(formatShortcut("Ctrl+Alt")).toBe("Ctrl + Alt");
    expect(isModifierOnly("Ctrl+Alt")).toBe(true);
    expect(isModifierOnly("Ctrl+Alt+Space")).toBe(false);
    expect(isModifierOnly("")).toBe(false);
  });

  it("splits on plus signs and ignores stray spaces", () => {
    expect(shortcutTokens(" Ctrl + Alt + Space ")).toEqual(["Ctrl", "Alt", "Space"]);
    expect(shortcutTokens("")).toEqual([]);
  });
});

describe("number formatting", () => {
  it("formats durations as a timer", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7_400)).toBe("0:07");
    expect(formatDuration(184_000)).toBe("3:04");
  });

  it("formats durations as words for the summary line", () => {
    expect(formatDurationWords(6_400)).toBe("6.4 s");
    expect(formatDurationWords(42_000)).toBe("42 s");
  });

  it("formats byte counts the way a download is read", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(512)).toBe("1 KB");
    expect(formatBytes(147_964_211)).toBe("141 MB");
    expect(formatBytes(1_500_000_000)).toBe("1.40 GB");
  });

  it("formats progress without dividing by zero", () => {
    expect(formatPercent(10, null)).toBe("");
    expect(formatPercent(10, 0)).toBe("");
    expect(formatPercent(50, 100)).toBe("50%");
    expect(formatPercent(5, 100)).toBe("5.0%");
  });

  it("truncates long text for the overlay", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("abcdefghijkl", 5)).toBe("abcd\u2026");
  });
});

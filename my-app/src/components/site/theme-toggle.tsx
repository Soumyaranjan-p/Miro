"use client";

import { useLayoutEffect, useRef, useState } from "react";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" strokeLinejoin="round" />
    </svg>
  );
}

type ViewTransitionLike = {
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

/** How long the frozen window must outlive the DOM commit before we release it. */
const FREEZE_MS = 240;

/**
 * Theme switch.
 *
 * The swap is committed as one whole-page cross-fade through the View
 * Transitions API: the browser snapshots the current page, we flip `.dark`, and
 * it dissolves the two snapshots as a single composited layer.
 *
 * Per-element colour transitions are deliberately NOT used. With ~120 themed
 * surfaces each interpolating on its own, the repaint order leaks through as a
 * visible stagger — the cheap navbar lands before the hero's big rasterised
 * layers. One snapshot cross-fade makes that impossible: the page is either the
 * old snapshot or the new one, faded, with no third state in between.
 *
 * Browsers without the API (and reduced-motion users) commit the flip in a
 * single frame, which is atomic by definition.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const swapping = useRef(false);

  // Sync with the theme class set by the inline script before hydration.
  // Runs before paint so there is no flash of the wrong icon.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading initial theme from the DOM after mount
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Clear a pending freeze-release if the button unmounts mid-swap.
  useLayoutEffect(() => () => window.clearTimeout(timer.current), []);

  const toggle = () => {
    const next = !dark;
    const root = document.documentElement;
    setDark(next);

    const commit = () => {
      root.classList.toggle("dark", next);
      try {
        localStorage.setItem("mirro-theme", next ? "dark" : "light");
      } catch {}
    };

    const doc = document as DocumentWithViewTransition;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canCrossFade =
      typeof doc.startViewTransition === "function" && !reduceMotion && !swapping.current;

    // Freeze per-element transitions across the flip, whatever path we take, so
    // nothing interpolates its own colours while the theme is changing.
    window.clearTimeout(timer.current);
    root.classList.add("theme-switching");

    if (!canCrossFade) {
      // No cross-fade available: commit in a single frame. Atomic by definition.
      commit();
      timer.current = window.setTimeout(() => root.classList.remove("theme-switching"), FREEZE_MS);
      return;
    }

    // Let the browser snapshot the current theme, then flip and dissolve.
    swapping.current = true;
    const transition = doc.startViewTransition(commit);
    void transition.finished.finally(() => {
      swapping.current = false;
      root.classList.remove("theme-switching");
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
    >
      {/* Both glyphs stay mounted and are toggled by `.dark`, so the icon can
          never disagree with the theme actually in effect. The page-level
          cross-fade carries the visual change; the glyph itself just swaps. */}
      <span className="relative block h-4 w-4">
        <span className="theme-glyph theme-glyph-sun absolute inset-0 flex">
          <SunIcon />
        </span>
        <span className="theme-glyph theme-glyph-moon absolute inset-0 flex">
          <MoonIcon />
        </span>
      </span>
    </button>
  );
}

"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const DARK_BG = "#0a0a0b";
const LIGHT_BG = "#fafafa";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  const [wipe, setWipe] = useState<{ active: boolean; x: number; y: number; toDark: boolean }>({
    active: false,
    x: 0,
    y: 0,
    toDark: true,
  });
  const reduceMotion = useReducedMotion() ? true : false;

  const applyTheme = useCallback((next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mirro-theme", next ? "dark" : "light");
    } catch {}
  }, []);

  const toggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (wipe.active) return;
      const next = !dark;

      if (reduceMotion) {
        applyTheme(next);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      setWipe({ active: true, x, y, toDark: next });

      setTimeout(() => applyTheme(next), 250);
      setTimeout(() => setWipe((w) => ({ ...w, active: false })), 600);
    },
    [dark, wipe.active, reduceMotion, applyTheme]
  );

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? "moon" : "sun"}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -60, scale: 0.6 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 60, scale: 0.6 }}
            transition={{ duration: reduceMotion ? 120 : 220, ease: [0.23, 1, 0.32, 1] }}
            className="flex"
          >
            {dark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" strokeLinejoin="round" />
              </svg>
            )}
          </motion.span>
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {wipe.active && (
          <motion.div
            className="pointer-events-none fixed z-[200]"
            style={{
              width: "200vmax",
              height: "200vmax",
              borderRadius: "50%",
              backgroundColor: wipe.toDark ? DARK_BG : LIGHT_BG,
              left: wipe.x,
              top: wipe.y,
              x: "-50%",
              y: "-50%",
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 600, ease: [0.23, 1, 0.32, 1] }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

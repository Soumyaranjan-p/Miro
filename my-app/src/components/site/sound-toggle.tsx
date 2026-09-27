"use client";

import { useEffect, useState } from "react";
import { getSoundEnabled, setSoundEnabled, subscribeSound } from "@/lib/sound";

export function useSoundEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Sync with the persisted preference after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading persisted preference post-mount
    setEnabled(getSoundEnabled());
    const unsub = subscribeSound(() => setEnabled(getSoundEnabled()));
    return unsub;
  }, []);

  const toggle = () => setSoundEnabled(!getSoundEnabled());

  return { enabled, toggle };
}

export function SoundToggle() {
  const { enabled, toggle } = useSoundEnabled();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Disable sound effects" : "Enable sound effects"}
      aria-pressed={enabled}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
    >
      {enabled ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m16 9 5 6M21 9l-5 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

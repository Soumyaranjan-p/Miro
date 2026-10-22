import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTS, asLevelFrame, asOverlayState, ipc, type ModelProgress, type SettingsPatch } from "./ipc";
import { initialOverlayState, reduceOverlayState, type OverlayAction } from "./overlayState";
import { applyTheme, prefersReducedMotion, watchReducedMotion, watchSystemTheme } from "./theme";
import type { OverlayState, RuntimeStatus, Settings, StatsSummary } from "./types";

/** Rust owns the settings; this hook only mirrors them and pushes patches back. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipc
      .getSettings()
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });
    const off = ipc.on<Settings>(EVENTS.settings, (payload) => {
      if (!cancelled) setSettings(payload);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const update = useCallback(async (patch: SettingsPatch) => {
    const next = await ipc.setSettings(patch);
    setSettings(next);
    return next;
  }, []);

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
    if (settings.theme !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [settings]);

  return { settings, error, update };
}

export function useRuntimeStatus(pollMs = 4000) {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await ipc.getRuntimeStatus());
    } catch {
      /* the strip simply keeps its previous values */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = ipc.on<RuntimeStatus>(EVENTS.runtime, (payload) => setStatus(payload));
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, [refresh, pollMs]);

  return { status, refresh };
}

export function useOverlayState() {
  const [state, setState] = useState<OverlayState>(initialOverlayState);
  const dispatch = useCallback((action: OverlayAction) => setState((s) => reduceOverlayState(s, action)), []);

  useEffect(() => {
    const off = ipc.on<unknown>(EVENTS.overlay, (payload) => setState(asOverlayState(payload)));
    return off;
  }, []);

  return { state, dispatch };
}

/** Rolling level history for the waveform, newest last. */
export function useLevelHistory(active: boolean, length = 48) {
  const [frames, setFrames] = useState<number[]>(() => new Array(length).fill(0));
  const peakRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const off = ipc.on<unknown>(EVENTS.micLevel, (payload) => {
      const frame = asLevelFrame(payload);
      peakRef.current = Math.max(peakRef.current * 0.92, frame.peak);
      setFrames((prev) => {
        const next = prev.slice(1);
        next.push(Math.max(frame.level, peakRef.current * 0.35));
        return next;
      });
    });
    return off;
  }, [active]);

  useEffect(() => {
    if (active) return;
    setFrames(new Array(length).fill(0));
  }, [active, length]);

  return frames;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());
  useEffect(() => watchReducedMotion(setReduced), []);
  return reduced;
}

export function useModelProgress() {
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  useEffect(() => {
    const off = ipc.on<ModelProgress>(EVENTS.modelProgress, (payload) => setProgress(payload));
    return off;
  }, []);
  return progress;
}

export function useTick(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/**
 * Usage aggregates for the Home panel and the Statistics page. Rust owns the
 * numbers; this mirrors them and refreshes on an interval (a dictation only
 * changes the totals, so a refresh tick is plenty).
 */
export function useStats(pollMs = 15_000) {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await ipc.getStats());
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  return { stats, error, refresh };
}

/** The latest mic level, cheap enough for the fox and status rows. */
export function useMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let frame = 0;
    let smoothed = 0;
    const off = ipc.on<unknown>(EVENTS.micLevel, (payload) => {
      const { level: raw } = asLevelFrame(payload);
      // Slight attack, slow release: reads like a voice, not a metronome.
      smoothed = raw > smoothed ? raw : smoothed * 0.86 + raw * 0.14;
      frame += 1;
      if (frame % 2 === 0) setLevel(smoothed);
    });
    return off;
  }, [active]);

  return level;
}

export type { StatsSummary };

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Settings, HomeMode } from "../../lib/types";
import type { SettingsPatch } from "../../lib/ipc";
import { useLevelHistory, useOverlayState, useReducedMotion } from "../../lib/hooks";
import { Mascot } from "../mascot/Mascot";
import {
  IconChat,
  IconGear,
  IconHome,
  IconPlus,
  IconSparkle,
  IconVolume,
  IconVolumeOff,
} from "../icons";
import "./home.css";

/**
 * The mascot knows nothing about Miro: it takes an expression and, while
 * listening, a level. Everything session-shaped (recording flags, level
 * history, no transcript text) is mapped here, at the call site.
 */

/** Once per webview load, surviving both StrictMode's double mount and Vite HMR. */
const INTRO_PLAYED = "__miroHomeIntroPlayed";

interface SettingsBridge {
  settings: Settings;
  update: (patch: SettingsPatch) => Promise<Settings>;
}

/** Deterministic pseudo-random so a re-render never shuffles the sky. */
function seeded(unit: number, salt: number): number {
  const value = Math.sin(unit * 91.7 + salt * 163.3) * 43758.5453;
  return value - Math.floor(value);
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const left = seeded(i, 1);
  const top = seeded(i, 2);
  const size = 2 + seeded(i, 3) * 4;
  const duration = 6 + seeded(i, 4) * 6;
  const delay = -seeded(i, 5) * 10;
  const dim = 0.12 + seeded(i, 6) * 0.18;
  const peak = 0.55 + seeded(i, 7) * 0.45;
  const driftX = (seeded(i, 8) - 0.5) * 24;
  const driftY = -8 - seeded(i, 9) * 22;
  return {
    left: left * 96,
    top: 8 + top * 78,
    size,
    duration,
    delay,
    dim,
    peak,
    driftX,
    driftY,
  } as const;
});

/**
 * True while the stage should freeze: the window is hidden (tab or `hide()`)
 * or minimised. Minimising arrives in WebView2 as a resize to a zero size.
 */
function useStagePaused(): boolean {
  const [paused, setPaused] = useState(() => document.visibilityState === "hidden");

  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);

    let disposed = false;
    let unlisten: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in window) {
      void getCurrentWindow()
        .listen<{ width: number; height: number }>("tauri://resize", (event) => {
          if (disposed) return;
          const minimized = event.payload.width === 0 && event.payload.height === 0;
          setPaused(minimized || document.visibilityState === "hidden");
        })
        .then((off) => {
          if (disposed) off();
          else unlisten = off;
        })
        .catch(() => {
          /* the stage then only follows visibilitychange */
        });
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      unlisten?.();
    };
  }, []);

  return paused;
}

function ModePill({ settings, update }: SettingsBridge) {
  const setMode = useCallback(
    (mode: HomeMode) => {
      if (mode !== settings.homeMode) void update({ homeMode: mode });
    },
    [settings.homeMode, update],
  );

  return (
    <nav className="miro-home__pill" aria-label="Mode">
      <button
        type="button"
        className={`miro-home__mode${settings.homeMode === "home" ? " is-active" : ""}`}
        onClick={() => setMode("home")}
        title="Normal Mode - dictate into any app"
        aria-pressed={settings.homeMode === "home"}
      >
        <IconHome size={20} />
      </button>
      <button
        type="button"
        className={`miro-home__mode${settings.homeMode === "intent" ? " is-active" : ""}`}
        onClick={() => setMode("intent")}
        title="Intent Mode - coming soon"
        aria-pressed={settings.homeMode === "intent"}
      >
        <IconChat size={20} />
        <span className="miro-home__badge" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="miro-home__mode"
        disabled
        title="More modes coming soon"
      >
        <IconPlus size={20} />
      </button>
    </nav>
  );
}

function TopRightButtons({
  settings,
  update,
  onOpenSettings,
}: SettingsBridge & { onOpenSettings: () => void }) {
  return (
    <div className="miro-home__rounds">
      <button
        type="button"
        className="miro-home__round"
        onClick={onOpenSettings}
        title="Settings"
      >
        <IconGear size={21} />
      </button>
      <button
        type="button"
        className="miro-home__round"
        onClick={() => void update({ soundOn: !settings.soundOn })}
        title={settings.soundOn ? "Sound on" : "Sound off"}
        aria-pressed={settings.soundOn}
      >
        {settings.soundOn ? <IconVolume size={21} /> : <IconVolumeOff size={21} />}
      </button>
    </div>
  );
}

export function MascotHome({
  settings,
  update,
  onOpenSettings,
}: SettingsBridge & { onOpenSettings: () => void }) {
  const { state } = useOverlayState();
  const recording = state.kind === "recording";
  const frames = useLevelHistory(recording);
  const reduced = useReducedMotion();
  const paused = useStagePaused();

  const [introDone, setIntroDone] = useState(
    () => (window as unknown as Record<string, unknown>)[INTRO_PLAYED] === true,
  );
  const finishedRef = useRef(introDone);

  const finishIntro = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    (window as unknown as Record<string, unknown>)[INTRO_PLAYED] = true;
    setIntroDone(true);
  }, []);

  // Recording drives the eyes, never transcript text: the overlay state event
  // carries no transcript, and neither does this screen.
  const level = useMemo(() => frames[frames.length - 1] ?? 0, [frames]);

  const expression = introDone ? (recording ? "listening" : "idle") : "hello";

  const status = recording
    ? "Listening \u00b7 press Esc to cancel"
    : settings.homeMode === "home"
      ? "Ready \u00b7 Ctrl+Alt to dictate"
      : "";

  return (
    <div
      className={`miro-home${paused ? " is-paused" : ""}`}
      onClick={finishIntro}
      data-testid="home-stage"
    >
      <div className="miro-home__haze" />
      <div className="miro-home__dust miro-home__dust--a" aria-hidden="true" />
      <div className="miro-home__dust miro-home__dust--b" aria-hidden="true" />

      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="miro-home__particle"
          aria-hidden="true"
          style={{
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            width: particle.size,
            height: particle.size,
            "--duration": `${particle.duration}s`,
            "--delay": `${particle.delay}s`,
            "--dim": particle.dim,
            "--peak": particle.peak,
            "--drift-x": `${particle.driftX}px`,
            "--drift-y": `${particle.driftY}px`,
          } as React.CSSProperties}
        />
      ))}

      <div className="miro-home__mascot-run">
        <div className="miro-home__glow" />
        <div className="miro-home__halo" />
        <div className={reduced ? undefined : "miro-home__mascot-float"}>
          <Mascot
            className="miro-home__mascot"
            expression={expression}
            size={250}
            level={recording ? level : undefined}
            shadow={false}
            title={recording ? "Miro is listening" : "Miro is ready"}
            onDone={finishIntro}
          />
        </div>
      </div>
      {recording && <span className="miro-hidden" aria-live="polite">Miro is listening</span>}

      <ModePill settings={settings} update={update} />
      <TopRightButtons settings={settings} update={update} onOpenSettings={onOpenSettings} />

      {settings.homeMode === "intent" && (
        <div className="miro-home__intent" role="status">
          <div className="miro-home__intent-copy">
            <div className="miro-home__intent-title">Intent Mode coming soon</div>
            <div className="miro-home__intent-sub">
              Speak your intent - Miro will act on the screen. Not wired up yet.
            </div>
          </div>
          <button type="button" className="miro-home__intent-chip" disabled>
            Rewrite
          </button>
          <button type="button" className="miro-home__intent-chip" disabled>
            Summarize
          </button>
          <button type="button" className="miro-home__intent-chip" disabled>
            Reply
          </button>
        </div>
      )}

      {status && <div className="miro-home__status" aria-hidden="true">{status}</div>}

      <IconSparkle className="miro-home__corner-sparkle" size={22} />
    </div>
  );
}

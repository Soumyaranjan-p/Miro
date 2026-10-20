import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { ipc } from "../../lib/ipc";
import { Mascot } from "../mascot/Mascot";

/** Matches the CSS keyframes and the Rust-side fallback timings. */
const SLIDE_IN_MS = 260;
const HOLD_MS = 2000;

/** Dev-only screenshot pose: panels render fully settled, no motion. */
const isStaticPose =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("static");

/**
 * The launch splash content: a dark glass panel that slides in from the right
 * edge of the primary monitor while the mascot says hello, then slides away.
 * Rust creates the window hidden; only after this tree has painted does it
 * call `notify_splash_ready`, which is what reveals it on screen - so the
 * slide-in never starts on a blank frame.
 */
export function SplashApp() {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const finishedRef = useRef(false);

  // The panel is up and rendered - Rust can reveal the window now.
  useEffect(() => {
    if (isStaticPose) return;
    void ipc.notifySplashReady().catch(() => {
      /* Rust hides the window on its own schedule if this ever fails. */
    });
  }, []);

  // Pause the panel's own CSS motion while the window is hidden.
  useEffect(() => {
    if (isStaticPose) return;
    const update = () => setPaused(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (isStaticPose) return;
    const id = window.setTimeout(() => setLeaving(true), SLIDE_IN_MS + HOLD_MS);
    return () => window.clearTimeout(id);
  }, []);

  const onPanelAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    // Both the slide-out and the reduced-motion fade-out end the sequence.
    if (event.animationName === "miro-splash-out" || event.animationName === "miro-splash-fade-out") {
      if (finishedRef.current) return;
      finishedRef.current = true;
      void ipc.splashFinished().catch(() => {
        /* Rust also hides the window on a timer; this only informs it earlier. */
      });
    }
  };

  return (
    <main
      className={`miro-splash${leaving ? " is-leaving" : ""}${paused ? " is-paused" : ""}${
        isStaticPose ? " is-static" : ""
      }`}
      onAnimationEnd={onPanelAnimationEnd}
      role="presentation"
    >
      <div className="miro-splash__mascot">
        <Mascot expression={isStaticPose ? "happy" : "hello"} size={140} decorative />
      </div>
    </main>
  );
}

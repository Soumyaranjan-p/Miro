"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useMountEffect } from "@/components/mirro/lib/use-mount-effect";
import { CheckIcon } from "@/components/mirro/icons/check";
import { GradientText } from "@/components/mirro/components/gradient-text";
import { LogoMark } from "@/components/site/logo";

const DURATION = 8;

/**
 * Launch teaser — 8 seconds.
 *
 * Structure (one idea, restraint):
 *   0.00–0.50  black, sub-bass swell only
 *   0.50–3.40  macro craft shot: CheckIcon disc spring + path draw, slow push-in
 *   3.40–5.60  brand reveal: LogoMark + "Mirro" rise out of blur
 *   5.60–8.00  tagline + hold with drift, settle
 *
 * The check draws via its own two-stage choreography (active flips 0.55s).
 */
export default function PromoTeaserPage() {
  const [t, setT] = useState(0);
  const [started, setStarted] = useState(false);
  const [checkOn, setCheckOn] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const timelineRef = useRef<{ at: number; fn: () => void }[]>([]);

  useMountEffect(() => {
    let raf = 0;

    const startClock = () => {
      if (startedAtRef.current != null) return;
      startedAtRef.current = performance.now();
      setStarted(true);
      timelineRef.current = [{ at: 0.55, fn: () => setCheckOn(true) }];
      const loop = (now: number) => {
        const el = (now - startedAtRef.current!) / 1000;
        const due = timelineRef.current.filter((e) => e.at <= el);
        for (const e of due) e.fn();
        timelineRef.current = timelineRef.current.filter((e) => e.at > el);
        if (el <= DURATION) {
          setT(el);
          raf = requestAnimationFrame(loop);
        } else {
          setT(DURATION);
        }
      };
      raf = requestAnimationFrame(loop);
    };

    const win = window as unknown as {
      __promo?: { start: () => void; getT: () => number };
    };
    win.__promo = {
      start: startClock,
      getT: () =>
        startedAtRef.current == null
          ? 0
          : (performance.now() - startedAtRef.current) / 1000,
    };

    return () => cancelAnimationFrame(raf);
  });

  const checkLocal = t - 0.5;
  const brandLocal = t - 3.4;

  // Scene 1 camera: slow push-in that keeps creeping through the hold.
  const checkScale = 1 + Math.min(Math.max(checkLocal, 0) * 0.022, 0.07);
  // Scene 2 camera: gentle settle drift.
  const brandScale = 1 + Math.min(Math.max(brandLocal, 0) * 0.012, 0.03);
  const brandDriftX = Math.sin(brandLocal * 0.5) * 4;

  // Scene 1 exits with a rack-focus feel (blur + slight sink).
  const checkOut = Math.min(Math.max((t - 3.05) / 0.38, 0), 1);
  // Scene 2 fades in over the tail of scene 1.
  const brandIn = Math.min(Math.max((t - 3.25) / 0.55, 0), 1);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#0a0a0b] text-foreground">
      {/* Cinematic vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse 120% 100% at 50% 46%, transparent 58%, rgba(0,0,0,0.42) 100%)",
        }}
      />

      {started && t >= 0.5 && t < 3.5 && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            opacity: 1 - checkOut,
            filter: `blur(${(checkOut * 10).toFixed(2)}px)`,
            transform: `scale(${(checkScale * (1 - checkOut * 0.04)).toFixed(4)})`,
          }}
        >
          <CheckIcon size={380} color="#ff4d29" active={checkOn} />
        </div>
      )}

      {started && t >= 3.25 && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            opacity: brandIn,
            filter: `blur(${((1 - brandIn) * 12).toFixed(2)}px)`,
            transform: `translate(${brandDriftX.toFixed(2)}px, 0) scale(${brandScale.toFixed(4)})`,
          }}
        >
          <div className="flex flex-col items-center">
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-7"
            >
              <LogoMark className="h-24 w-24 text-foreground" />
              <span className="text-[120px] font-semibold leading-none tracking-tight">
                Mirro
              </span>
            </motion.div>
            <div
              style={{
                opacity: Math.min(Math.max((t - 4.6) / 0.7, 0), 1),
                transform: `translateY(${((1 - Math.min(Math.max((t - 4.6) / 0.7, 0), 1)) * 14).toFixed(2)}px)`,
                transition: "none",
              }}
            >
              <GradientText className="mt-7 block text-4xl font-medium tracking-tight">
                Motion for modern interfaces.
              </GradientText>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

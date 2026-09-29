"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useMountEffect } from "@/components/mirro/lib/use-mount-effect";
import { HeartIcon } from "@/components/mirro/icons/heart";
import { CheckIcon } from "@/components/mirro/icons/check";
import { SunMoonIcon } from "@/components/mirro/icons/sun-moon";
import { MenuIcon } from "@/components/mirro/icons/menu";
import { BellIcon } from "@/components/mirro/icons/bell";
import { AnimatedTabs } from "@/components/mirro/components/animated-tabs";
import { Switch } from "@/components/mirro/components/switch";
import { TiltCard } from "@/components/mirro/components/tilt-card";
import { SpotlightCard } from "@/components/mirro/components/spotlight-card";
import { FlipCard } from "@/components/mirro/components/flip-card";
import { GradientText } from "@/components/mirro/components/gradient-text";
import { LogoMark } from "@/components/site/logo";
import { IntegrationsHero } from "@/components/mirro/blocks/integrations-hero";

const DURATION = 20;

/**
 * Promo stage. A deterministic 20-second scene clock drives which scene is
 * visible and when. Real components are driven by authentic input (clicks /
 * pointer moves) dispatched by the capture harness, using `data-promo`
 * hooks. The page exposes `window.__promo.getT()` so the harness can time
 * those interactions against the scene clock.
 */
export default function PromoPage() {
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
      timelineRef.current = [
        { at: 0.35, fn: () => setCheckOn(true) },
      ];
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
      getT: () => (startedAtRef.current == null ? 0 : (performance.now() - startedAtRef.current) / 1000),
    };

    return () => cancelAnimationFrame(raf);
  });

  const scenes = [
    { id: "check", start: 0, end: 2.5 },
    { id: "hero", start: 2.5, end: 5.0 },
    { id: "icons", start: 5.0, end: 7.5 },
    { id: "magic", start: 7.5, end: 11.0 },
    { id: "surfaces", start: 11.0, end: 14.0 },
    { id: "eco", start: 14.0, end: 17.0 },
    { id: "logo", start: 17.0, end: 20.0 },
  ];

  const active = scenes.find((s) => t >= s.start && t < s.end)?.id ?? "logo";
  const localT = (t - (scenes.find((s) => s.id === active)?.start ?? 0));

  const camera = {
    scale: 1 + Math.min(localT * 0.02, 0.06),
    x: Math.sin(localT * 0.55) * 7,
    y: Math.cos(localT * 0.45) * 5,
  };

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-background text-foreground"
      style={{ background: "#0a0a0b", width: "100vw", height: "100vh" }}
    >
      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
        }}
      >
        {!started ? null : (
          <>
            {active === "check" && <CheckScene on={checkOn} />}
            {active === "hero" && <HeroScene />}
            {active === "icons" && <IconsScene />}
            {active === "magic" && <MagicScene />}
            {active === "surfaces" && <SurfacesScene />}
            {active === "eco" && <EcoScene />}
            {active === "logo" && <LogoScene />}
          </>
        )}
      </div>
    </div>
  );
}

function CheckScene({ on }: { on: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0.86, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center justify-center"
    >
      {/* Default strokeWidth: the stroke is in viewBox units, so a large
          override would paint over the disc. The dark check on the accent
          disc is the component's own two-stage draw choreography. */}
      <CheckIcon size={360} color="#ff4d29" active={on} />
    </motion.div>
  );
}

function HeroScene() {
  return (
    <div className="max-w-5xl px-16">
      <motion.h1
        className="text-[128px] font-semibold leading-[1.02] tracking-tight"
        initial={{ opacity: 0, filter: "blur(14px)", y: 28 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ duration: 0.65, ease: [0.23, 1, 0.32, 1] }}
      >
        Motion for
        <br />
        modern interfaces.
      </motion.h1>
      <motion.p
        className="mt-8 text-2xl text-muted-foreground"
        initial={{ opacity: 0, filter: "blur(8px)", y: 16 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
      >
        Animated icons, components and UI blocks built for React.
      </motion.p>
      <motion.div
        className="mt-12 flex gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8, ease: [0.23, 1, 0.32, 1] }}
      >
        <span className="rounded-lg bg-foreground px-7 py-3.5 text-lg font-medium text-background">
          Explore Components
        </span>
        <span className="rounded-lg border border-border px-7 py-3.5 text-lg font-medium">
          Browse Icons
        </span>
      </motion.div>
    </div>
  );
}

function IconsScene() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="grid grid-cols-2 gap-x-32 gap-y-24"
    >
      <div data-promo="heart" className="flex justify-center">
        <HeartIcon size={220} color="#fafafa" strokeWidth={2.5} />
      </div>
      <div data-promo="menu" className="flex justify-center">
        <MenuIcon size={220} color="#fafafa" strokeWidth={2.5} />
      </div>
      <div data-promo="sunmoon" className="flex justify-center">
        <SunMoonIcon size={220} color="#fafafa" strokeWidth={2.5} />
      </div>
      <div data-promo="bell" className="flex justify-center">
        <BellIcon size={220} color="#fafafa" strokeWidth={2.5} />
      </div>
    </motion.div>
  );
}

function MagicScene() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center gap-20"
    >
      <div data-promo="tabs" style={{ transform: "scale(1.7)" }}>
        <AnimatedTabs
          tabs={[
            { label: "Icons", value: "icons" },
            { label: "Components", value: "components" },
            { label: "Blocks", value: "blocks" },
          ]}
        />
      </div>
      <div data-promo="switch" className="flex items-center gap-8">
        <span className="text-2xl text-muted-foreground">Springs</span>
        <div style={{ transform: "scale(1.6)" }}>
          <Switch />
        </div>
      </div>
    </motion.div>
  );
}

function SurfacesScene() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="grid w-[1500px] grid-cols-3 gap-10"
    >
      <div data-promo="tilt">
        <TiltCard className="h-80 p-9">
          <div className="flex h-full flex-col justify-between">
            <span className="font-mono text-sm uppercase tracking-widest text-accent">Tilt</span>
            <p className="text-4xl font-semibold">3D perspective follow</p>
          </div>
        </TiltCard>
      </div>
      <div data-promo="spotlight">
        <SpotlightCard className="h-80 p-9">
          <div className="flex h-full flex-col justify-between">
            <span className="font-mono text-sm uppercase tracking-widest text-accent">Spotlight</span>
            <p className="text-4xl font-semibold">Cursor-tracked glow</p>
          </div>
        </SpotlightCard>
      </div>
      <div data-promo="flip">
        <FlipCard
          className="h-80"
          front={
            <div className="flex h-full items-center justify-center border border-border bg-card p-9">
              <p className="text-4xl font-semibold">Flip</p>
            </div>
          }
          back={
            <div className="flex h-full items-center justify-center border border-accent bg-card p-9">
              <p className="text-4xl font-semibold text-accent">3D reveal</p>
            </div>
          }
        />
      </div>
    </motion.div>
  );
}

function EcoScene() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="w-[1600px]"
    >
      <IntegrationsHero />
    </motion.div>
  );
}

function LogoScene() {
  return (
    <div className="flex flex-col items-center gap-10">
      <motion.div
        initial={{ opacity: 0, filter: "blur(12px)", y: 22 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-6"
      >
        <LogoMark className="h-20 w-20 text-foreground" />
        <span className="text-8xl font-semibold tracking-tight">Mirro</span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        <GradientText className="text-4xl font-medium">Motion for modern interfaces.</GradientText>
      </motion.div>
    </div>
  );
}

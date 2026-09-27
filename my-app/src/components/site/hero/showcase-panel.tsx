"use client";

import { useRef, useEffect } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { MagneticButton } from "@/components/mirro/components/magnetic-button";
import { HeartIcon } from "@/components/mirro/icons/heart";
import { StarIcon } from "@/components/mirro/icons/star";
import { SpotlightCard } from "@/components/mirro/components/spotlight-card";
import { useHoverCapable } from "@/components/mirro/lib/use-hover-capable";
import { FloatingElement } from "./floating-element";

export function ShowcasePanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverCapable = useHoverCapable();
  const reduceMotion = useReducedMotion();

  const rawX = useRef(0);
  const rawY = useRef(0);
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const springX = useSpring(targetX, { stiffness: 60, damping: 18 });
  const springY = useSpring(targetY, { stiffness: 60, damping: 18 });

  useEffect(() => {
    if (!hoverCapable || reduceMotion) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      rawX.current = (e.clientX - rect.left) / rect.width - 0.5;
      rawY.current = (e.clientY - rect.top) / rect.height - 0.5;
    };
    const tick = () => {
      targetX.set(rawX.current);
      targetY.set(rawY.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [hoverCapable, reduceMotion, targetX, targetY]);

  return (
    <div
      ref={panelRef}
      className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div
        aria-hidden="true"
        className="dot-grid absolute inset-0 opacity-50"
        style={{
          maskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black, transparent)",
        }}
      />

      <FloatingElement
        depth={0.4}
        springX={springX}
        springY={springY}
        hoverCapable={hoverCapable}
        reduceMotion={reduceMotion ? true : false}
        className="left-[8%] top-[9%]"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 font-mono text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          v2.0
        </span>
      </FloatingElement>

      <FloatingElement
        depth={1}
        springX={springX}
        springY={springY}
        hoverCapable={hoverCapable}
        reduceMotion={reduceMotion ? true : false}
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <MagneticButton strength={0.3}>Get started</MagneticButton>
      </FloatingElement>

      <FloatingElement
        depth={0.6}
        springX={springX}
        springY={springY}
        hoverCapable={hoverCapable}
        reduceMotion={reduceMotion ? true : false}
        className="right-[9%] top-[18%]"
      >
        <HeartIcon size={30} />
      </FloatingElement>

      <FloatingElement
        depth={0.8}
        springX={springX}
        springY={springY}
        hoverCapable={hoverCapable}
        reduceMotion={reduceMotion ? true : false}
        className="bottom-[10%] left-[5%]"
      >
        <SpotlightCard className="w-40">
          <div className="p-3">
            <p className="font-mono text-[10px] text-muted-foreground">spotlight</p>
            <p className="mt-1 text-xs font-medium text-foreground">Motion, tuned.</p>
          </div>
        </SpotlightCard>
      </FloatingElement>

      <FloatingElement
        depth={0.5}
        springX={springX}
        springY={springY}
        hoverCapable={hoverCapable}
        reduceMotion={reduceMotion ? true : false}
        className="bottom-[18%] right-[9%]"
      >
        <StarIcon size={26} />
      </FloatingElement>
    </div>
  );
}

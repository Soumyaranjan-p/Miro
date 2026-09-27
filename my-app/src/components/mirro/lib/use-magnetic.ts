"use client";

import { useRef, useCallback, type MouseEvent } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";

export function useMagnetic<T extends HTMLElement = HTMLDivElement>(strength = 0.35) {
  const ref = useRef<T>(null);
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, { stiffness: 150, damping: 15, mass: 0.1 });
  const springY = useSpring(y, { stiffness: 150, damping: 15, mass: 0.1 });

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (reduceMotion || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
      y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
    },
    [reduceMotion, strength, x, y]
  );

  const onMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return { ref, springX, springY, onMouseMove, onMouseLeave, reduceMotion };
}

"use client";

import { useRef, useState, useCallback, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface TiltCardProps {
  children: ReactNode;
  className?: string;
  max?: number;
}

export function TiltCard({ children, className, max = 10 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const [hovering, setHovering] = useState(false);

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const spring = { stiffness: 150, damping: 20 };
  const rotateX = useSpring(useTransform(my, [0, 1], [max, -max]), spring);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-max, max]), spring);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (reduceMotion || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      mx.set((e.clientX - rect.left) / rect.width);
      my.set((e.clientY - rect.top) / rect.height);
    },
    [reduceMotion, mx, my]
  );

  const onMouseLeave = useCallback(() => {
    setHovering(false);
    mx.set(0.5);
    my.set(0.5);
  }, [mx, my]);

  return (
    <div style={{ perspective: 800 }}>
      <motion.div
        ref={ref}
        onMouseMove={hoverCapable ? onMouseMove : undefined}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={onMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ scale: hovering && !reduceMotion ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className={cn("relative rounded-xl border border-border bg-card", className)}
      >
        {children}
      </motion.div>
    </div>
  );
}

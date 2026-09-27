"use client";

import { useRef, useState, useCallback, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = "255, 77, 41",
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const [hovering, setHovering] = useState(false);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 20 });
  const sy = useSpring(my, { stiffness: 120, damping: 20 });

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (reduceMotion || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      mx.set(e.clientX - rect.left);
      my.set(e.clientY - rect.top);
    },
    [reduceMotion, mx, my]
  );

  const onMouseLeave = useCallback(() => {
    setHovering(false);
    mx.set(0);
    my.set(0);
  }, [mx, my]);

  return (
    <div
      ref={ref}
      onMouseMove={hoverCapable ? onMouseMove : undefined}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={onMouseLeave}
      className={cn("relative overflow-hidden rounded-xl border border-border bg-card", className)}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -ml-[160px] -mt-[160px] h-[320px] w-[320px] rounded-full"
        style={{
          x: sx,
          y: sy,
          background: `radial-gradient(320px circle, rgba(${spotlightColor}, 0.14), transparent 65%)`,
        }}
        animate={{ opacity: hovering ? 1 : 0 }}
        transition={{ duration: 250, ease: [0.23, 1, 0.32, 1] }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

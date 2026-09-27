"use client";

import type { ReactNode } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/components/mirro/lib/cn";

export interface FloatingElementProps {
  children: ReactNode;
  depth: number;
  className?: string;
  springX: MotionValue<number>;
  springY: MotionValue<number>;
  hoverCapable: boolean;
  reduceMotion: boolean;
}

export function FloatingElement({
  children,
  depth,
  className,
  springX,
  springY,
  hoverCapable,
  reduceMotion,
}: FloatingElementProps) {
  const parallax = hoverCapable && !reduceMotion ? true : false;
  const x = useTransform(springX, (v) => (parallax ? v * depth * 60 : 0));
  const y = useTransform(springY, (v) => (parallax ? v * depth * 60 : 0));
  const drift = !hoverCapable && !reduceMotion;

  return (
    <motion.div style={{ x, y }} className={cn("absolute", className)}>
      <div className={cn(drift && "mirro-drift")}>{children}</div>
    </motion.div>
  );
}

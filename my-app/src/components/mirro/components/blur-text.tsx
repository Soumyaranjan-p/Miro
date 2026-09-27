"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface BlurTextProps {
  children: ReactNode;
  className?: string;
}

export function BlurText({ children, className }: BlurTextProps) {
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  return (
    <motion.span
      initial={reduceMotion ? false : { filter: "blur(6px)", opacity: 0.5 }}
      whileHover={hoverCapable && !reduceMotion ? { filter: "blur(0px)", opacity: 1 } : undefined}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.span>
  );
}

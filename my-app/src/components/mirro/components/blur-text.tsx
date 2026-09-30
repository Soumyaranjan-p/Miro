"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface BlurTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Text that comes into focus on hover.
 *
 * The resting state is sharp on purpose. Blurring until hover meant the text was
 * unreadable on touch devices (no hover) and was the first thing a scroll-reveal
 * or `prefers-reduced-motion` override would leave illegible. Blur is now the
 * *transient* state: hovering briefly defocuses the glyphs and they resolve.
 */
export function BlurText({ children, className }: BlurTextProps) {
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const canBlur = hoverCapable && !reduceMotion;

  return (
    <motion.span
      initial={false}
      whileHover={canBlur ? { filter: "blur(4px)", opacity: 0.72 } : undefined}
      whileTap={canBlur ? { filter: "blur(0px)", opacity: 1 } : undefined}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.span>
  );
}

"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface GradientTextProps {
  children: ReactNode;
  className?: string;
}

export function GradientText({ children, className }: GradientTextProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      className={cn("inline-block bg-clip-text text-transparent", className)}
      style={{
        backgroundImage: reduceMotion
          ? "var(--accent)"
          : "linear-gradient(120deg, var(--accent), #ff7a5c, var(--accent))",
        backgroundSize: reduceMotion ? "auto" : "200% 100%",
        animation: reduceMotion ? "none" : "mirro-gradient-pan 3s ease infinite",
      }}
    >
      {children}
    </motion.span>
  );
}

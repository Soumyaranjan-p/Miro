"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface GradientButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function GradientButton({ children, className, onClick }: GradientButtonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "relative overflow-hidden rounded-lg px-5 py-2.5 text-sm font-medium text-accent-foreground",
        className
      )}
      style={{
        background: reduceMotion
          ? "var(--accent)"
          : "linear-gradient(120deg, var(--accent), #ff7a5c, var(--accent))",
        backgroundSize: reduceMotion ? "auto" : "200% 100%",
        animation: reduceMotion ? "none" : "mirro-gradient-pan 3s ease infinite",
      }}
    >
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}

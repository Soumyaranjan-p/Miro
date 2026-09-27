"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface ShimmerButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function ShimmerButton({ children, className, onClick }: ShimmerButtonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "relative overflow-hidden rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background",
        className
      )}
    >
      <span className="relative z-10">{children}</span>
      {!reduceMotion && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out hover:translate-x-full"
        />
      )}
    </motion.button>
  );
}

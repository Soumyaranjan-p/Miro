"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface BorderBeamButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function BorderBeamButton({ children, className, onClick }: BorderBeamButtonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative inline-flex rounded-lg p-px">
      {!reduceMotion && (
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-lg"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, var(--accent) 20%, transparent 40%)",
            animation: "mirro-border-beam 2.4s linear infinite",
          }}
        />
      )}
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className={cn(
          "relative rounded-[7px] bg-card px-5 py-2.5 text-sm font-medium text-foreground",
          className
        )}
      >
        {children}
      </motion.button>
    </div>
  );
}

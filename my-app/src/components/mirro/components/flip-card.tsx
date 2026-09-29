"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

export function FlipCard({ front, back, className }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div
      style={{ perspective: 1000 }}
      className={cn("relative h-56 w-full cursor-pointer", className)}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFlipped((f) => !f);
        }
      }}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.5, ease: [0.77, 0, 0.175, 1] }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-full w-full"
      >
        <div style={{ backfaceVisibility: "hidden" }} className="absolute inset-0">
          {front}
        </div>
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          className="absolute inset-0"
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}

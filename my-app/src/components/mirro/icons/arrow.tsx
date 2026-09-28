"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const ARROW_LINE = "M4 12h16";
const ARROW_HEAD = "M13 5l7 7-7 7";

type Direction = "up" | "right" | "down" | "left";

const ROTATION: Record<Direction, number> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270,
};

const HOVER_OFFSET: Record<Direction, { x?: number; y?: number }> = {
  right: { x: 3 },
  left: { x: -3 },
  up: { y: -3 },
  down: { y: 3 },
};

export interface ArrowIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  direction?: Direction;
  label?: string;
  className?: string;
}

export function ArrowIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  direction = "right",
  label = "Arrow",
  className,
}: ArrowIconProps) {
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  return (
    <motion.div
      role="img"
      aria-label={label}
      whileHover={hoverCapable && !reduceMotion ? HOVER_OFFSET[direction] : undefined}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.g
          animate={{ rotate: ROTATION[direction] }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          style={{ originX: "50%", originY: "50%" }}
        >
          <path d={ARROW_LINE} />
          <path d={ARROW_HEAD} />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

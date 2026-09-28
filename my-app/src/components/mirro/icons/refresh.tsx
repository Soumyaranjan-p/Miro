"use client";

import { useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const ARROW_TOP = "M3 12a9 9 0 0 1 15-6.7L21 8";
const ARROW_TOP_HEAD = "M21 3v5h-5";
const ARROW_BOTTOM = "M21 12a9 9 0 0 1-15 6.7L3 16";
const ARROW_BOTTOM_HEAD = "M3 21v-5h5";

export interface RefreshIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  spinning?: boolean;
  defaultSpinning?: boolean;
  onSpin?: (spinning: boolean) => void;
  label?: string;
  className?: string;
}

export function RefreshIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  spinning,
  defaultSpinning = false,
  onSpin,
  label = "Refresh",
  className,
}: RefreshIconProps) {
  const [internal, setInternal] = useState(defaultSpinning);
  const isControlled = spinning !== undefined;
  const isSpinning = isControlled ? spinning : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const spinControls = useAnimationControls();

  const toggle = () => {
    const next = !isSpinning;
    if (!isControlled) setInternal(next);
    onSpin?.(next);
  };

  const spin = () => {
    if (reduceMotion) {
      spinControls.start({
        opacity: [1, 0.55, 1],
        transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] },
      });
      return;
    }
    spinControls.start({
      rotate: [0, 360],
      transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] },
    });
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isSpinning}
      aria-label={label}
      onClick={() => {
        toggle();
        spin();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
          spin();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { scale: 1.06 } : undefined}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn("inline-flex cursor-pointer items-center justify-center", className)}
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
        <motion.g animate={spinControls} style={{ originX: "50%", originY: "50%" }}>
          <path d={ARROW_TOP} />
          <path d={ARROW_TOP_HEAD} />
          <path d={ARROW_BOTTOM} />
          <path d={ARROW_BOTTOM_HEAD} />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

"use client";

import { useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

const HEART_PATH =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

export interface HeartIconProps {
  size?: number;
  color?: string;
  fillColor?: string;
  strokeWidth?: number;
  filled?: boolean;
  defaultFilled?: boolean;
  onToggle?: (filled: boolean) => void;
  label?: string;
  className?: string;
}

export function HeartIcon({
  size = 24,
  color = "currentColor",
  fillColor = "var(--accent)",
  strokeWidth = 1.5,
  filled,
  defaultFilled = false,
  onToggle,
  label = "Like",
  className,
}: HeartIconProps) {
  const [internal, setInternal] = useState(defaultFilled);
  const isControlled = filled !== undefined;
  const isFilled = isControlled ? filled : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const beatControls = useAnimationControls();

  const toggle = () => {
    const next = !isFilled;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  const beat = () => {
    if (reduceMotion) return;
    beatControls.start({
      scale: [1, 1.28, 0.92, 1.12, 1],
      transition: { duration: 0.52, ease: [0.23, 1, 0.32, 1] },
    });
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isFilled}
      aria-label={label}
      onClick={() => {
        toggle();
        beat();
        playSound("pop");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
          beat();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { scale: 1.08 } : undefined}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
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
        animate={beatControls}
      >
        <path d={HEART_PATH} fill="none" />
        <motion.path
          d={HEART_PATH}
          fill={fillColor}
          stroke="none"
          initial={false}
          animate={
            reduceMotion
              ? { opacity: isFilled ? 1 : 0 }
              : { scale: isFilled ? [0, 1.15, 1] : 0, opacity: isFilled ? 1 : 0 }
          }
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.23, 1, 0.32, 1] }}
          style={{ originX: "50%", originY: "50%" }}
        />
      </motion.svg>
    </motion.div>
  );
}

"use client";

import { useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

const BELL_PATH =
  "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9";
const CLAPPER_PATH = "M10.3 21a1.94 1.94 0 0 0 3.4 0";

export interface BellIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  ringing?: boolean;
  defaultRinging?: boolean;
  onRing?: (ringing: boolean) => void;
  label?: string;
  className?: string;
}

export function BellIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  ringing,
  defaultRinging = false,
  onRing,
  label = "Notifications",
  className,
}: BellIconProps) {
  const [internal, setInternal] = useState(defaultRinging);
  const isControlled = ringing !== undefined;
  const isRinging = isControlled ? ringing : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const shakeControls = useAnimationControls();

  const toggle = () => {
    const next = !isRinging;
    if (!isControlled) setInternal(next);
    onRing?.(next);
    if (next) playSound("chime");
  };

  const shake = () => {
    if (reduceMotion) return;
    shakeControls.start({
      rotate: [0, -12, 12, -8, 8, 0],
      transition: { duration: 0.5, ease: [0.36, 0.07, 0.19, 0.97] },
    });
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isRinging}
      aria-label={label}
      onClick={() => {
        toggle();
        shake();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
          shake();
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
        animate={shakeControls}
      >
        <path d={BELL_PATH} />
        <path d={CLAPPER_PATH} />
        <motion.circle
          cx="18"
          cy="5"
          r="2.5"
          fill={color}
          stroke="none"
          animate={
            reduceMotion
              ? { opacity: isRinging ? 1 : 0 }
              : { scale: isRinging ? 1 : 0, opacity: isRinging ? 1 : 0 }
          }
          transition={
            reduceMotion
              ? { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
              : { type: "spring", stiffness: 500, damping: 18 }
          }
        />
      </motion.svg>
    </motion.div>
  );
}

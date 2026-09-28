"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

const CHECK_PATH = "M7.5 12.5l3 3 6-6.5";

export interface CheckIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (active: boolean) => void;
  label?: string;
  className?: string;
}

export function CheckIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  active,
  defaultActive = true,
  onToggle,
  label = "Check",
  className,
}: CheckIconProps) {
  const [internal, setInternal] = useState(defaultActive);
  const isControlled = active !== undefined;
  const isActive = isControlled ? active : internal;
  const reduceMotion = useReducedMotion() ? true : false;
  const hoverCapable = useHoverCapable();

  const replay = () => {
    if (!isControlled) setInternal(false);
    requestAnimationFrame(() => {
      if (!isControlled) setInternal(true);
    });
    onToggle?.(true);
    setTimeout(() => playSound("affirm"), reduceMotion ? 100 : 200);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={replay}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          replay();
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
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          fill={color}
          initial={false}
          animate={{ scale: isActive ? 1 : 0.5, opacity: isActive ? 1 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 520, damping: 28 }
          }
          style={{ originX: "50%", originY: "50%" }}
        />
        <motion.path
          d={CHECK_PATH}
          stroke="var(--background)"
          strokeWidth={strokeWidth + 0.5}
          initial={false}
          animate={{ pathLength: isActive ? 1 : 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.22,
            ease: [0.23, 1, 0.32, 1],
          }}
        />
      </motion.svg>
    </motion.div>
  );
}

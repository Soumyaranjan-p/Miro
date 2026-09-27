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
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const replay = () => {
    if (!isControlled) setInternal(false);
    requestAnimationFrame(() => {
      if (!isControlled) setInternal(true);
    });
    onToggle?.(true);
    setTimeout(() => playSound("affirm"), reduceMotion ? 120 : 300);
  };

  const duration = reduceMotion ? 0.15 : 0.32;
  const ease: [number, number, number, number] = [0.23, 1, 0.32, 1];

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
      >
        <motion.circle
          cx="12"
          cy="12"
          r="9"
          initial={false}
          animate={{ pathLength: isActive ? 1 : 0, opacity: isActive ? 1 : 0.4 }}
          transition={{ duration, ease }}
        />
        <motion.path
          d={CHECK_PATH}
          initial={false}
          animate={{ pathLength: isActive ? 1 : 0 }}
          transition={{ duration: duration * 0.9, ease, delay: isActive ? duration * 0.35 : 0 }}
        />
      </motion.svg>
    </motion.div>
  );
}

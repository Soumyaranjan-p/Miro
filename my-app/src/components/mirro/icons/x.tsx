"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface XIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (active: boolean) => void;
  label?: string;
  className?: string;
}

export function XIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  active,
  defaultActive = true,
  onToggle,
  label = "Close",
  className,
}: XIconProps) {
  const [internal, setInternal] = useState(defaultActive);
  const isControlled = active !== undefined;
  const isActive = isControlled ? active : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isActive;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={label}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
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
        <motion.line
          x1="6"
          y1="6"
          x2="18"
          y2="18"
          animate={
            reduceMotion
              ? { opacity: isActive ? 1 : 0 }
              : { pathLength: isActive ? 1 : 0 }
          }
          transition={
            reduceMotion
              ? { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
              : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }
          }
        />
        <motion.line
          x1="18"
          y1="6"
          x2="6"
          y2="18"
          animate={
            reduceMotion
              ? { opacity: isActive ? 1 : 0 }
              : { pathLength: isActive ? 1 : 0 }
          }
          transition={
            reduceMotion
              ? { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
              : { duration: 0.3, delay: 0.08, ease: [0.23, 1, 0.32, 1] }
          }
        />
      </motion.svg>
    </motion.div>
  );
}

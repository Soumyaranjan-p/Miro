"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const EYE_PATH =
  "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z";
const SLASH_PATH = "M4 4l16 16";

export interface EyeIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  visible?: boolean;
  defaultVisible?: boolean;
  onToggle?: (visible: boolean) => void;
  label?: string;
  className?: string;
}

export function EyeIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  visible,
  defaultVisible = true,
  onToggle,
  label = "Toggle visibility",
  className,
}: EyeIconProps) {
  const [internal, setInternal] = useState(defaultVisible);
  const isControlled = visible !== undefined;
  const isVisible = isControlled ? visible : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isVisible;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isVisible}
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
        <path d={EYE_PATH} />
        <motion.path
          d={SLASH_PATH}
          animate={reduceMotion ? { opacity: isVisible ? 0 : 1 } : { pathLength: isVisible ? 0 : 1 }}
          transition={{ duration: 250, ease: [0.23, 1, 0.32, 1] }}
        />
        <motion.circle
          cx={12}
          cy={12}
          r={3}
          style={{ originX: 0.5, originY: 0.5 }}
          animate={
            reduceMotion
              ? { opacity: isVisible ? 1 : 0 }
              : { scale: isVisible ? 1 : 0, opacity: isVisible ? 1 : 0 }
          }
          transition={{ duration: 250, ease: [0.23, 1, 0.32, 1] }}
        />
      </motion.svg>
    </motion.div>
  );
}

"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface PlusIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  label?: string;
  className?: string;
}

export function PlusIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  open,
  defaultOpen = false,
  onToggle,
  label = "Add",
  className,
}: PlusIconProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isOpen}
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
        <motion.g
          style={{ originX: 0.5, originY: 0.5 }}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{
            duration: reduceMotion ? 0.15 : 0.25,
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          <motion.line x1="12" y1="5" x2="12" y2="19" />
          <motion.line x1="5" y1="12" x2="19" y2="12" />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

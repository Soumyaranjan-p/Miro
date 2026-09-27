"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

export interface MenuIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  label?: string;
  className?: string;
}

export function MenuIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  open,
  defaultOpen = false,
  onToggle,
  label = "Menu",
  className,
}: MenuIconProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
    playSound("whoosh");
  };

  const duration = reduceMotion ? 0.15 : 0.28;
  const ease: [number, number, number, number] = [0.77, 0, 0.175, 1];

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
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
        <motion.line
          x1="5"
          y1="7"
          x2="19"
          y2="7"
          initial={false}
          animate={isOpen ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }}
          transition={{ duration, ease }}
          style={{ originX: 0.5, originY: 0.5 }}
        />
        <motion.line
          x1="5"
          y1="12"
          x2="19"
          y2="12"
          initial={false}
          animate={isOpen ? { scaleX: 0 } : { scaleX: 1 }}
          transition={{ duration, ease }}
          style={{ originX: 0.5, originY: 0.5 }}
        />
        <motion.line
          x1="5"
          y1="17"
          x2="19"
          y2="17"
          initial={false}
          animate={isOpen ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }}
          transition={{ duration, ease }}
          style={{ originX: 0.5, originY: 0.5 }}
        />
      </motion.svg>
    </motion.div>
  );
}

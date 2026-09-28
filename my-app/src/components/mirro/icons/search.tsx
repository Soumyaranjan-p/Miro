"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface SearchIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  scanning?: boolean;
  defaultScanning?: boolean;
  onScan?: (scanning: boolean) => void;
  label?: string;
  className?: string;
}

export function SearchIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  scanning,
  defaultScanning = false,
  onScan,
  label = "Search",
  className,
}: SearchIconProps) {
  const [internal, setInternal] = useState(defaultScanning);
  const isControlled = scanning !== undefined;
  const isScanning = isControlled ? scanning : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isScanning;
    if (!isControlled) setInternal(next);
    onScan?.(next);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isScanning}
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
        <motion.circle
          cx={11}
          cy={11}
          r={6.5}
          initial={false}
          animate={{ opacity: isScanning ? 0.85 : 1 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        />
        <motion.line
          x1={15.8}
          y1={15.8}
          x2={20}
          y2={20}
          initial={false}
          animate={{ opacity: isScanning ? 0.85 : 1 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        />
        <motion.line
          x1={8}
          y1={11}
          x2={14}
          y2={11}
          initial={false}
          animate={
            reduceMotion
              ? { opacity: isScanning ? 1 : 0 }
              : isScanning
                ? { y: [6, 16, 6], opacity: 1 }
                : { y: 0, opacity: 0 }
          }
          transition={
            reduceMotion
              ? { duration: 0.16, ease: [0.23, 1, 0.32, 1] }
              : { duration: 0.26, ease: [0.23, 1, 0.32, 1] }
          }
        />
      </motion.svg>
    </motion.div>
  );
}

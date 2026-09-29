"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { useMountEffect } from "../lib/use-mount-effect";
import { playSound } from "../../../lib/sound";

const CHECK_PATH = "M8.5 12.5l2.5 2.5 4.5-5";

export interface CopyIconProps {
  size?: number;
  color?: string;
  checkColor?: string;
  strokeWidth?: number;
  copied?: boolean;
  defaultCopied?: boolean;
  onCopy?: (copied: boolean) => void;
  resetDelay?: number;
  label?: string;
  className?: string;
}

export function CopyIcon({
  size = 24,
  color = "currentColor",
  checkColor = "var(--accent)",
  strokeWidth = 1.5,
  copied,
  defaultCopied = false,
  onCopy,
  resetDelay = 1600,
  label = "Copy",
  className,
}: CopyIconProps) {
  const [internal, setInternal] = useState(defaultCopied);
  const isControlled = copied !== undefined;
  const isCopied = isControlled ? copied : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMountEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  });

  const scheduleReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      resetTimer.current = null;
      setInternal(false);
      onCopy?.(false);
    }, resetDelay);
  };

  const copy = () => {
    const next = !isCopied;
    if (!isControlled) {
      setInternal(next);
      if (next) scheduleReset();
      else if (resetTimer.current) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    }
    onCopy?.(next);
    if (next) playSound("tick");
  };

  const duration = reduceMotion ? 0.15 : 0.28;
  const ease: [number, number, number, number] = [0.23, 1, 0.32, 1];

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-live="polite"
      aria-label={isCopied ? "Copied" : label}
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copy();
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
        <motion.rect
          x="5"
          y="4.5"
          width="14"
          height="16"
          rx="2"
          initial={false}
          animate={{ opacity: isCopied ? 0.3 : 1 }}
          transition={{ duration, ease }}
        />
        <motion.path
          d="M9 4.5V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2v1.3"
          initial={false}
          animate={{ opacity: isCopied ? 0.3 : 1 }}
          transition={{ duration, ease }}
        />
        <motion.path
          d={CHECK_PATH}
          stroke={checkColor}
          initial={false}
          animate={{ pathLength: isCopied ? 1 : 0, opacity: isCopied ? 1 : 0 }}
          transition={{ duration: isCopied ? (reduceMotion ? 0.15 : 0.3) : 0.2, ease }}
        />
      </motion.svg>
    </motion.div>
  );
}

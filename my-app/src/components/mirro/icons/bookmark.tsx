"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

const BOOKMARK_PATH = "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z";

export interface BookmarkIconProps {
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

export function BookmarkIcon({
  size = 24,
  color = "currentColor",
  fillColor = "var(--accent)",
  strokeWidth = 1.5,
  filled,
  defaultFilled = false,
  onToggle,
  label = "Bookmark",
  className,
}: BookmarkIconProps) {
  const [internal, setInternal] = useState(defaultFilled);
  const isControlled = filled !== undefined;
  const isFilled = isControlled ? filled : internal;
  const reduceMotion = useReducedMotion() ? true : false;
  const hoverCapable = useHoverCapable();
  const clipId = useId();

  const toggle = () => {
    const next = !isFilled;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
    if (next) playSound("thunk");
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isFilled}
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
        <defs>
          <clipPath id={clipId}>
            <path d={BOOKMARK_PATH} />
          </clipPath>
        </defs>
        <path d={BOOKMARK_PATH} fill="none" />
        <motion.g
          initial={false}
          clipPath={`url(#${clipId})`}
          animate={
            reduceMotion
              ? { opacity: isFilled ? 1 : 0 }
              : { y: isFilled ? 0 : -24, opacity: isFilled ? 1 : 0 }
          }
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          <path d={BOOKMARK_PATH} fill={fillColor} stroke="none" />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

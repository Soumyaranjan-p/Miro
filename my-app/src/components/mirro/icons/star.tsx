"use client";

import { useId, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

export interface StarIconProps {
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

export function StarIcon({
  size = 24,
  color = "currentColor",
  fillColor = "var(--accent)",
  strokeWidth = 1.5,
  filled,
  defaultFilled = false,
  onToggle,
  label = "Star",
  className,
}: StarIconProps) {
  const [internal, setInternal] = useState(defaultFilled);
  const isControlled = filled !== undefined;
  const isFilled = isControlled ? filled : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const popControls = useAnimationControls();
  const glowId = useId();

  const toggle = () => {
    const next = !isFilled;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  const pop = () => {
    if (reduceMotion) return;
    popControls.start({
      scale: [1, 1.25, 1],
      transition: { duration: 320, ease: [0.23, 1, 0.32, 1] },
    });
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isFilled}
      aria-label={label}
      onClick={() => {
        toggle();
        pop();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
          pop();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { scale: 1.08 } : undefined}
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
        animate={popControls}
      >
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.7" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={STAR_PATH} fill="none" />
        <motion.path
          d={STAR_PATH}
          fill={fillColor}
          stroke="none"
          initial={false}
          animate={{ opacity: isFilled ? 1 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 200 }}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="11"
          fill={`url(#${glowId})`}
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0 }
              : isFilled
                ? { opacity: [0, 0.7, 0], scale: [0.6, 1.15, 1] }
                : { opacity: 0 }
          }
          transition={{ duration: reduceMotion ? 0 : 400, ease: [0.23, 1, 0.32, 1] }}
          style={{ originX: "50%", originY: "50%" }}
        />
      </motion.svg>
    </motion.div>
  );
}

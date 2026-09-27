"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

const MOON_PATH = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z";

const RAYS = Array.from({ length: 8 }, (_, i) => i * 45);

export interface SunMoonIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  moon?: boolean;
  defaultMoon?: boolean;
  onToggle?: (moon: boolean) => void;
  label?: string;
  className?: string;
}

export function SunMoonIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  moon,
  defaultMoon = false,
  onToggle,
  label = "Toggle theme",
  className,
}: SunMoonIconProps) {
  const [internal, setInternal] = useState(defaultMoon);
  const isControlled = moon !== undefined;
  const isMoon = isControlled ? moon : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isMoon;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
    playSound("switch");
  };

  const duration = reduceMotion ? 0.15 : 0.4;
  const ease: [number, number, number, number] = [0.77, 0, 0.175, 1];

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isMoon}
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
          initial={false}
          animate={
            isMoon
              ? { rotate: 90, scale: 0.6, opacity: 0 }
              : { rotate: 0, scale: 1, opacity: 1 }
          }
          transition={{ duration, ease }}
          style={{ originX: "12px", originY: "12px" }}
        >
          <circle cx="12" cy="12" r="4" />
          {RAYS.map((angle) => (
            <line
              key={angle}
              x1="12"
              y1="3.5"
              x2="12"
              y2="6"
              transform={`rotate(${angle} 12 12)`}
            />
          ))}
        </motion.g>
        <motion.path
          d={MOON_PATH}
          initial={false}
          animate={
            isMoon
              ? { rotate: 0, scale: 1, opacity: 1 }
              : { rotate: -90, scale: 0.6, opacity: 0 }
          }
          transition={{ duration, ease }}
          style={{ originX: "12px", originY: "12px" }}
        />
      </motion.svg>
    </motion.div>
  );
}

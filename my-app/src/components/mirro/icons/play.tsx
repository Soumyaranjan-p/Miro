"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";
import { playSound } from "../../../lib/sound";

const PLAY_PATH = "M6 4l14 8-14 8V4z";

export interface PlayIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  playing?: boolean;
  defaultPlaying?: boolean;
  onTogglePlay?: (playing: boolean) => void;
  label?: string;
  className?: string;
}

export function PlayIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  playing,
  defaultPlaying = false,
  onTogglePlay,
  label = "Play",
  className,
}: PlayIconProps) {
  const [internal, setInternal] = useState(defaultPlaying);
  const isControlled = playing !== undefined;
  const isPlaying = isControlled ? playing : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isPlaying;
    if (!isControlled) setInternal(next);
    onTogglePlay?.(next);
    playSound("switch");
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isPlaying}
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
        <motion.path
          d={PLAY_PATH}
          animate={{
            opacity: isPlaying ? 0 : 1,
            scale: reduceMotion ? 1 : isPlaying ? 0.6 : 1,
          }}
          transition={{ duration: 250, ease: [0.23, 1, 0.32, 1] }}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        />
        <motion.line
          x1="8"
          y1="5"
          x2="8"
          y2="19"
          animate={{
            opacity: isPlaying ? 1 : 0,
            scale: reduceMotion ? 1 : isPlaying ? 1 : 0.6,
          }}
          transition={{ duration: 250, ease: [0.23, 1, 0.32, 1] }}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        />
        <motion.line
          x1="16"
          y1="5"
          x2="16"
          y2="19"
          animate={{
            opacity: isPlaying ? 1 : 0,
            scale: reduceMotion ? 1 : isPlaying ? 1 : 0.6,
          }}
          transition={{ duration: 250, ease: [0.23, 1, 0.32, 1] }}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        />
      </motion.svg>
    </motion.div>
  );
}

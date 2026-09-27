"use client";

import { useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const PLANE_BODY = "M22 2 15 22l-4-9-9-4Z";
const PLANE_NOSE = "M22 2 11 13";

export interface SendIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  sent?: boolean;
  defaultSent?: boolean;
  onSend?: (sent: boolean) => void;
  label?: string;
  className?: string;
}

export function SendIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  sent,
  defaultSent = false,
  onSend,
  label = "Send",
  className,
}: SendIconProps) {
  const [internal, setInternal] = useState(defaultSent);
  const isControlled = sent !== undefined;
  const isSent = isControlled ? sent : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const launchControls = useAnimationControls();

  const toggle = () => {
    const next = !isSent;
    if (!isControlled) setInternal(next);
    onSend?.(next);
  };

  const launch = () => {
    if (reduceMotion) {
      launchControls.start({
        opacity: [1, 0.6, 1],
        transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
      });
      return;
    }
    launchControls.start({
      x: [0, 6, 0],
      y: [0, -6, 0],
      opacity: [1, 0, 1],
      transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] },
    });
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isSent}
      aria-label={label}
      onClick={() => {
        toggle();
        launch();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
          launch();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { x: 2, y: -2 } : undefined}
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
        <motion.g animate={launchControls}>
          <path d={PLANE_NOSE} />
          <path d={PLANE_BODY} />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

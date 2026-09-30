"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const PLANE = "M22 2 15 22l-4-9-9-4ZM22 2 11 13";

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

/**
 * Send icon that flies off and returns when pressed.
 *
 * The previous version animated `x`/`y` on the glyph group via
 * `useAnimationControls` while `whileHover` set the *same* `x`/`y` on the parent.
 * Two animations owning one property meant the hover offset and the launch
 * fought each other: the plane drifted, stalled, or never landed back on origin.
 *
 * Now the properties are split: hover moves the frame a little (x/y), the launch
 * moves the glyph (x/y) *and* fades it — and both settle back to 0, so the icon
 * cannot end up stuck off-centre.
 */
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
  const [internalSent, setInternalSent] = useState(defaultSent);
  const [launchKey, setLaunchKey] = useState(0);
  const isControlled = sent !== undefined;
  const isSent = isControlled ? sent : internalSent;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const press = () => {
    const next = !isSent;
    if (!isControlled) setInternalSent(next);
    onSend?.(next);
    // Remount the glyph so the launch replays on every press, including rapid
    // repeats that would otherwise be swallowed mid-flight.
    setLaunchKey((k) => k + 1);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isSent}
      aria-label={label}
      onClick={press}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          press();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { x: 2, y: -2 } : undefined}
      whileTap={reduceMotion ? undefined : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
      className={cn("inline-flex cursor-pointer items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
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
          key={launchKey}
          initial={reduceMotion ? false : { x: 0, y: 0, opacity: 1 }}
          animate={
            reduceMotion
              ? { opacity: [1, 0.55, 1] }
              : { x: [0, 10, 0], y: [0, -10, 0], opacity: [1, 0.35, 1] }
          }
          transition={{ duration: reduceMotion ? 0.24 : 0.46, ease: [0.23, 1, 0.32, 1] }}
        >
          <path d={PLANE} />
        </motion.g>
      </svg>
    </motion.div>
  );
}

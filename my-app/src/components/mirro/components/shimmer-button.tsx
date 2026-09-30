"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface ShimmerButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Primary button with a single highlight that sweeps across on hover.
 *
 * The sweep is a plain CSS keyframe (`.shimmer-sweep` in globals.css) running on
 * `transform`, so it composites on the GPU rather than animating a gradient's
 * `background-position`. It rests off-screen and is only mounted while hovered,
 * so the button is completely static until the pointer arrives — one sharp pass
 * per hover instead of a permanent loop.
 *
 * The highlight is `--shimmer` (a soft tint of the button's own text colour),
 * which keeps it legible on both the solid and outline variants instead of
 * relying on a translucent white wash that vanishes on light backgrounds.
 */
export function ShimmerButton({ children, className, onClick }: ShimmerButtonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className={cn(
        "group relative overflow-hidden rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background",
        className
      )}
    >
      <span className="relative z-10">{children}</span>
      {!reduceMotion && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-[-50%] w-1/2 -skew-x-12 opacity-0 group-hover:opacity-100 group-hover:[animation:shimmer-sweep_0.6s_var(--ease-out)]"
          style={{
            // Crisp travelling band with a short plateau, so it reads as one
            // highlight rather than a broad wash.
            background:
              "linear-gradient(90deg, transparent 0%, var(--shimmer) 42%, var(--shimmer) 58%, transparent 100%)",
          }}
        />
      )}
    </motion.button>
  );
}

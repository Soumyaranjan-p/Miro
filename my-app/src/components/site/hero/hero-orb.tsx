"use client";

import { motion, useReducedMotion } from "motion/react";
import { useHoverCapable } from "@/components/mirro/lib/use-hover-capable";

export function HeroOrb() {
  const reduceMotion = useReducedMotion() ? true : false;
  const hoverCapable = useHoverCapable();
  const animate = hoverCapable && !reduceMotion;

  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="size-48 sm:size-56"
      fill="none"
      role="img"
      aria-label="Abstract 3D cubes"
      animate={animate ? { y: [0, -8, 0] } : undefined}
      transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
    >
      <ellipse cx="100" cy="182" rx="48" ry="7" fill="currentColor" opacity="0.12" />
      <g opacity="0.55">
        <ellipse
          cx="100"
          cy="115"
          rx="84"
          ry="30"
          stroke="var(--accent)"
          strokeWidth="1"
          strokeDasharray="4 7"
          transform="rotate(-18 100 115)"
        />
        <ellipse
          cx="100"
          cy="115"
          rx="66"
          ry="24"
          stroke="var(--foreground)"
          strokeWidth="1"
          strokeDasharray="2 6"
          opacity="0.4"
          transform="rotate(14 100 115)"
        />
      </g>
      <g>
        <path d="M100 102 L140 125 L100 148 L60 125 Z" fill="var(--foreground)" />
        <path d="M60 125 L100 148 L100 171 L60 148 Z" fill="var(--muted)" />
        <path d="M140 125 L100 148 L100 171 L140 148 Z" fill="var(--accent)" />
      </g>
      <g>
        <path d="M100 52 L122 65 L100 78 L78 65 Z" fill="var(--foreground)" />
        <path d="M78 65 L100 78 L100 91 L78 78 Z" fill="var(--muted)" />
        <path d="M122 65 L100 78 L100 91 L122 78 Z" fill="var(--accent)" opacity="0.9" />
      </g>
    </motion.svg>
  );
}

"use client";

import { useState, type ReactNode, type MouseEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export interface RippleButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function RippleButton({ children, className, onClick }: RippleButtonProps) {
  const reduceMotion = useReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!reduceMotion) {
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = Date.now();
      setRipples((prev) => [...prev, { id, x, y, size }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }
    onClick?.();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted",
        className
      )}
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-foreground/15"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
            transform: "scale(0)",
            animation: "mirro-ripple 600ms ease-out forwards",
          }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}

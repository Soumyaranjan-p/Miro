"use client";

import type { ReactNode, MouseEvent } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "../lib/cn";
import { useMagnetic } from "../lib/use-magnetic";
import { useHoverCapable } from "../lib/use-hover-capable";

const MotionLink = motion(Link);

export interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  variant?: "primary" | "outline";
  className?: string;
  onClick?: () => void;
  href?: string;
}

export function MagneticButton({
  children,
  strength = 0.35,
  variant = "primary",
  className,
  onClick,
  href,
}: MagneticButtonProps) {
  const { ref, springX, springY, onMouseMove, onMouseLeave } = useMagnetic<HTMLSpanElement>(strength);
  const hoverCapable = useHoverCapable();

  const handleMouseMove = (e: MouseEvent) => {
    if (hoverCapable) onMouseMove(e);
  };

  const classes = cn(
    "rounded-lg px-5 py-2.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    variant === "primary"
      ? "bg-foreground text-background"
      : "border border-border text-foreground hover:bg-muted",
    className
  );

  return (
    <motion.span
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ x: springX, y: springY }}
      className="inline-block"
    >
      {href ? (
        <MotionLink
          href={href}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className={classes}
        >
          {children}
        </MotionLink>
      ) : (
        <motion.button
          type="button"
          onClick={onClick}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className={classes}
        >
          {children}
        </motion.button>
      )}
    </motion.span>
  );
}

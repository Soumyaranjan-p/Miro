"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface TextRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "span" | "div" | "h1" | "h2" | "h3" | "p";
}

export function TextReveal({ children, className, delay = 0, as = "span" }: TextRevealProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  return (
    <Component
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)", y: 10 }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 600, delay, ease: [0.23, 1, 0.32, 1] }}
      className={cn("inline-block", className)}
    >
      {children}
    </Component>
  );
}

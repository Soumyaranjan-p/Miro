"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface TypewriterTextProps {
  children: ReactNode;
  className?: string;
  speed?: number;
}

export function TypewriterText({ children, className, speed = 32 }: TypewriterTextProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const text = typeof children === "string" ? children : "";
  const [count, setCount] = useState(() => (reduceMotion ? text.length : 0));

  useEffect(() => {
    if (reduceMotion || !inView) return;
    if (count >= text.length) return;
    const id = setTimeout(() => setCount((c) => c + 1), speed);
    return () => clearTimeout(id);
  }, [inView, count, text, speed, reduceMotion]);

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      {text.slice(0, count)}
      {count < text.length && <span className="animate-pulse">|</span>}
    </span>
  );
}

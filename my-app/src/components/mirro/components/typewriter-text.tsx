"use client";

import { useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useMountEffect } from "../lib/use-mount-effect";

export interface TypewriterTextProps {
  children: ReactNode;
  className?: string;
  speed?: number;
}

export function TypewriterText({ children, className, speed = 32 }: TypewriterTextProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const text = typeof children === "string" ? children : "";
  const [count, setCount] = useState(() => (reduceMotion ? text.length : 0));

  useMountEffect(() => {
    const el = ref.current;
    if (!el) return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        if (reduceMotion) return;

        interval = setInterval(() => {
          setCount((c) => {
            if (c >= text.length) {
              if (interval) clearInterval(interval);
              interval = null;
              return c;
            }
            return c + 1;
          });
        }, speed);
      },
      { rootMargin: "-40px" }
    );

    io.observe(el);
    return () => {
      io.disconnect();
      if (interval) clearInterval(interval);
    };
  });

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      {text.slice(0, count)}
      {count < text.length && <span className="animate-pulse">|</span>}
    </span>
  );
}

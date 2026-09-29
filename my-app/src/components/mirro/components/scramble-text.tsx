"use client";

import { useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useMountEffect } from "../lib/use-mount-effect";

const CHARS = "!<>-_\\/[]{}—=+*^?#01";

export interface ScrambleTextProps {
  children: ReactNode;
  className?: string;
}

export function ScrambleText({ children, className }: ScrambleTextProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const text = typeof children === "string" ? children : "";
  const [display, setDisplay] = useState(text);

  useMountEffect(() => {
    const el = ref.current;
    if (!el) return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        if (reduceMotion) return;

        let frame = 0;
        const total = text.length;
        interval = setInterval(() => {
          frame++;
          const settled = Math.floor((frame / (total * 1.5)) * total);
          let next = "";
          for (let i = 0; i < total; i++) {
            if (i < settled || text[i] === " ") {
              next += text[i];
            } else {
              next += CHARS[Math.floor(Math.random() * CHARS.length)];
            }
          }
          setDisplay(next);
          if (settled >= total) {
            setDisplay(text);
            if (interval) clearInterval(interval);
            interval = null;
          }
        }, 30);
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
      {display}
    </span>
  );
}

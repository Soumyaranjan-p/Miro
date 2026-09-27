"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

const CHARS = "!<>-_\\/[]{}—=+*^?#01";

export interface ScrambleTextProps {
  children: ReactNode;
  className?: string;
}

export function ScrambleText({ children, className }: ScrambleTextProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const text = typeof children === "string" ? children : "";
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (reduceMotion || !inView) return;
    let frame = 0;
    const total = text.length;
    const id = setInterval(() => {
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
        clearInterval(id);
      }
    }, 30);
    return () => clearInterval(id);
  }, [inView, text, reduceMotion]);

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      {display}
    </span>
  );
}

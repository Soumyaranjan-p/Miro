"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useMountEffect } from "../lib/use-mount-effect";

const CHARS = "!<>-_\\/[]{}—=+*^?#01";

export interface ScrambleTextProps {
  children: string;
  className?: string;
}

/**
 * Text that decodes out of noise when it scrolls into view.
 *
 * `children` is typed as a plain string on purpose: the effect rewrites the
 * characters, so it needs the text, not an element. Passing JSX here (an earlier
 * version accepted `ReactNode`) silently rendered nothing.
 *
 * Visibility is guaranteed by construction: the full string is the default
 * state, the scramble is armed only from an effect (so it can never blank the
 * text if that effect does not run), and reduced motion opts out entirely.
 *
 * The animated layer is `aria-hidden` and the full string also sits in an
 * `sr-only` node, so assistive tech reads real text, not mid-scramble noise.
 */
export function ScrambleText({ children, className }: ScrambleTextProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const text = children;
  const chars = useMemo(() => Array.from(text), [text]);
  const [display, setDisplay] = useState(text);

  // Rewind before paint so the decode starts from noise without a visible flash
  // of the finished sentence.
  useLayoutEffect(() => {
    if (reduceMotion) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arming the reveal before paint is the point of this effect
    setDisplay(text);
  }, [reduceMotion, text]);

  useMountEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();

        // Lock the head of the string in one glyph at a time while the tail
        // keeps churning, so the line reads as decoding rather than shimmering.
        let settled = 0;
        interval = setInterval(() => {
          settled += 1;
          if (settled >= chars.length) {
            setDisplay(text);
            stop();
            return;
          }
          setDisplay(
            chars
              .map((ch, i) => {
                if (i < settled || ch === " ") return ch;
                return CHARS[Math.floor(Math.random() * CHARS.length)];
              })
              .join("")
          );
        }, 42);
      },
      { rootMargin: "-40px" }
    );

    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  });

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

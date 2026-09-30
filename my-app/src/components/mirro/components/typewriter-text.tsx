"use client";

import { useLayoutEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface TypewriterTextProps {
  children: string;
  className?: string;
  /** Milliseconds between characters. */
  speed?: number;
  /** Pause before typing starts, in milliseconds. */
  startDelay?: number;
}

/**
 * Text that types itself out once, on mount.
 *
 * `children` is a plain string on purpose: the effect slices it, so it needs the
 * text rather than an element. Passing JSX here (an earlier version accepted
 * `ReactNode`) silently rendered nothing.
 *
 * Visibility is guaranteed by construction:
 *  - The server and the first client render output the FULL string, so the text
 *    is always present for crawlers, for assistive tech and if scripts never run.
 *  - A layout effect then rewinds to zero *before paint* when motion is allowed,
 *    so the animation starts without a flash of the finished sentence.
 *  - If that effect never runs, the full string simply stays on screen. The
 *    component can never render as an empty box.
 *
 * The typable layer is `aria-hidden` and the sentence also sits in an `sr-only`
 * node, so screen readers get the whole line at once rather than watching it grow.
 */
export function TypewriterText({
  children,
  className,
  speed = 32,
  startDelay = 0,
}: TypewriterTextProps) {
  const reduceMotion = useReducedMotion();
  const text = children;
  const animate = reduceMotion === false;
  const [count, setCount] = useState(text.length);

  // Rewind before the browser paints, so the restart is never visible.
  useLayoutEffect(() => {
    if (!animate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rewinding the reveal before paint is the point of this effect
    setCount(0);
  }, [animate]);

  useLayoutEffect(() => {
    if (!animate) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const delay = setTimeout(() => {
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
    }, startDelay);

    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
    };
  }, [animate, speed, startDelay, text.length]);

  const done = !animate || count >= text.length;

  return (
    <span className={cn("inline-block", className)}>
      <span aria-hidden="true">
        {done ? text : text.slice(0, count)}
        {!done && <span className="animate-pulse">|</span>}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

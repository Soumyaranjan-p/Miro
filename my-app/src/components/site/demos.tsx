"use client";

import { motion, useReducedMotion } from "motion/react";
import { HeartIcon } from "@/components/mirro/icons/heart";

export function ShimmerButton() {
  const reduceMotion = useReducedMotion();
  return (
    <button
      type="button"
      className="group relative overflow-hidden rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97]"
    >
      <span className="relative z-10">Get started</span>
      {!reduceMotion && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
        />
      )}
    </button>
  );
}

export function TextReveal() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.p
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)", y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ duration: reduceMotion ? 200 : 700, ease: [0.23, 1, 0.32, 1] }}
      className="text-sm font-medium text-foreground"
    >
      Motion for modern interfaces.
    </motion.p>
  );
}

export function LoaderDemo() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground"
        style={{ animationDuration: reduceMotion ? "2.4s" : "0.9s" }}
      />
      <span className="font-mono text-xs text-muted-foreground">loading</span>
    </div>
  );
}

export function HeartDemo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <HeartIcon size={32} label="Like" />
      <span className="font-mono text-[11px] text-muted-foreground">click me</span>
    </div>
  );
}

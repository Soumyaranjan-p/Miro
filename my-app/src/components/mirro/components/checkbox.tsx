"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  className,
}: CheckboxProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internal;
  const reduceMotion = useReducedMotion() ? true : false;

  const toggle = () => {
    const next = !isChecked;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={label}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className={cn(
        "relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-md border transition-colors duration-150 ease-out",
        isChecked ? "border-accent" : "border-border bg-card",
        className
      )}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 bg-accent"
        initial={false}
        animate={{ x: isChecked ? "0%" : "-100%" }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
      />
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="relative h-3.5 w-3.5 text-accent-foreground"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={reduceMotion ? undefined : { scale: isChecked ? [1.4, 1] : 1 }}
        transition={{
          duration: 0.25,
          ease: [0.23, 1, 0.32, 1],
          delay: isChecked ? 0.05 : 0,
        }}
      >
        <motion.path
          d="M5 13l4 4L19 7"
          initial={false}
          animate={{ pathLength: isChecked ? 1 : 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.22,
            ease: [0.23, 1, 0.32, 1],
            delay: isChecked && !reduceMotion ? 0.05 : 0,
          }}
        />
      </motion.svg>
    </button>
  );
}

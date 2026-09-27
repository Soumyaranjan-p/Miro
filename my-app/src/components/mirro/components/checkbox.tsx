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
  const reduceMotion = useReducedMotion();

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
        "flex h-5 w-5 items-center justify-center rounded-md border transition-colors duration-150 ease-out",
        isChecked ? "border-accent bg-accent" : "border-border bg-card",
        className
      )}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="h-3.5 w-3.5 text-accent-foreground"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M5 13l4 4L19 7"
          initial={false}
          animate={{ pathLength: isChecked ? 1 : 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 300, ease: [0.23, 1, 0.32, 1] }}
        />
      </motion.svg>
    </button>
  );
}

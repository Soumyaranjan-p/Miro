"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  className,
}: SwitchProps) {
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
      role="switch"
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
        "relative h-6 w-11 rounded-full transition-colors duration-200 ease-out",
        isChecked ? "bg-accent" : "bg-muted",
        className
      )}
    >
      <motion.span
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow"
        initial={false}
        animate={{ x: isChecked ? 20 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

export interface TrashIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  deleted?: boolean;
  defaultDeleted?: boolean;
  onDelete?: (deleted: boolean) => void;
  label?: string;
  className?: string;
}

export function TrashIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  deleted,
  defaultDeleted = false,
  onDelete,
  label = "Delete",
  className,
}: TrashIconProps) {
  const [internal, setInternal] = useState(defaultDeleted);
  const isControlled = deleted !== undefined;
  const isDeleted = isControlled ? deleted : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();

  const toggle = () => {
    const next = !isDeleted;
    if (!isControlled) setInternal(next);
    onDelete?.(next);
  };

  useEffect(() => {
    if (!isDeleted || isControlled) return;
    const id = setTimeout(() => {
      setInternal(false);
      onDelete?.(false);
    }, 1200);
    return () => clearTimeout(id);
  }, [isDeleted, isControlled, onDelete]);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isDeleted}
      aria-label={label}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { scale: 1.06 } : undefined}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn("inline-flex cursor-pointer items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.g
          style={{ originX: 0, originY: 1 }}
          animate={{
            rotate: isDeleted && !reduceMotion ? -18 : 0,
            opacity: isDeleted && reduceMotion ? 0.35 : 1,
          }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </motion.g>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <motion.g
          animate={{ opacity: isDeleted ? 0 : 1 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

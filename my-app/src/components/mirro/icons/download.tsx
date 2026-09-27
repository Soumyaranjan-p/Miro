"use client";

import { useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { useHoverCapable } from "../lib/use-hover-capable";

const TRAY_PATH = "M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2";
const ARROW_LINE = "M12 4v12";
const ARROW_HEAD = "M7 11l5 5 5-5";

export interface DownloadIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  downloaded?: boolean;
  defaultDownloaded?: boolean;
  onDownload?: (downloaded: boolean) => void;
  label?: string;
  className?: string;
}

export function DownloadIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  downloaded,
  defaultDownloaded = false,
  onDownload,
  label = "Download",
  className,
}: DownloadIconProps) {
  const [internal, setInternal] = useState(defaultDownloaded);
  const isControlled = downloaded !== undefined;
  const isDownloaded = isControlled ? downloaded : internal;
  const reduceMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const dipControls = useAnimationControls();

  const toggle = () => {
    const next = !isDownloaded;
    if (!isControlled) setInternal(next);
    onDownload?.(next);
  };

  const dip = () => {
    if (reduceMotion) return;
    dipControls.start({
      y: [0, 4, 0],
      transition: { duration: 260, ease: [0.23, 1, 0.32, 1] },
    });
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={isDownloaded}
      aria-label={label}
      onClick={() => {
        toggle();
        dip();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
          dip();
        }
      }}
      whileHover={hoverCapable && !reduceMotion ? { scale: 1.06 } : undefined}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
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
        <path d={TRAY_PATH} />
        <motion.g
          animate={reduceMotion ? { opacity: isDownloaded ? 0.45 : 1 } : dipControls}
          transition={{ duration: 180, ease: [0.23, 1, 0.32, 1] }}
        >
          <path d={ARROW_LINE} />
          <path d={ARROW_HEAD} />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

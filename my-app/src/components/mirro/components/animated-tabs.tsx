"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

export interface TabItem {
  label: string;
  value: string;
}

export interface AnimatedTabsProps {
  tabs: TabItem[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function AnimatedTabs({ tabs, defaultValue, value, onChange, className }: AnimatedTabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.value);
  const isControlled = value !== undefined;
  const active = isControlled ? value : internal;
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const layoutId = useId();

  const select = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    select(tabs[next].value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      className={cn("inline-flex gap-1 rounded-lg border border-border bg-muted p-1", className)}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => select(tab.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="relative rounded-md px-4 py-2 text-sm outline-none"
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-foreground"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34 }
                }
              />
            )}
            <span
              className={cn(
                "relative z-10 transition-colors duration-150 ease-out",
                isActive ? "text-background" : "text-muted-foreground"
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

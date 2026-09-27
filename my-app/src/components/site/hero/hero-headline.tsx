"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/components/mirro/lib/cn";

const WORDS = [
  { text: "Motion", muted: true, line: 0 },
  { text: "for", muted: true, line: 0 },
  { text: "modern", muted: false, line: 1 },
  { text: "interfaces.", muted: false, line: 1 },
];

function Word({
  text,
  muted,
  index,
  reduceMotion,
}: {
  text: string;
  muted: boolean;
  index: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.span
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0.2 : 0.5,
        delay: reduceMotion ? Math.min(index * 0.02, 0.1) : index * 0.05,
        ease: [0.23, 1, 0.32, 1],
      }}
      className={cn(
        "mr-[0.28em] inline-block",
        muted
          ? "font-medium text-foreground/85 dark:text-foreground/60"
          : "font-semibold text-foreground"
      )}
    >
      {text}
    </motion.span>
  );
}

export function HeroHeadline() {
  const reduceMotion = useReducedMotion() ? true : false;

  return (
    <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
      {[0, 1].map((line) => (
        <span key={line} className="block">
          {WORDS.map((word) =>
            word.line === line ? (
              <Word
                key={word.text}
                text={word.text}
                muted={word.muted}
                index={WORDS.indexOf(word)}
                reduceMotion={reduceMotion}
              />
            ) : null
          )}
        </span>
      ))}
    </h1>
  );
}

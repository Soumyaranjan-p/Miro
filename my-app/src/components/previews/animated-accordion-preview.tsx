"use client";

import { AnimatedAccordion } from "@/components/mirro/components/animated-accordion";

const ITEMS = [
  {
    title: "What is Mirro?",
    content: "An animation-first UI library for React. Copy-paste components with intentional, polished motion.",
  },
  {
    title: "Is it accessible?",
    content: "Yes. Reduced motion, keyboard navigation, and touch behavior are built into every component.",
  },
  {
    title: "How do I install it?",
    content: "Run npx mirro-ui init, then add the components you want. The source is copied into your project.",
  },
];

export function AnimatedAccordionPreview() {
  return (
    <div className="p-2">
      <AnimatedAccordion items={ITEMS} />
    </div>
  );
}

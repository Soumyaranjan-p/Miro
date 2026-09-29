import { SITE_NAME, SITE_URL } from "@/lib/seo";

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Keyword-bearing FAQ. These target the long-tail, question-shaped queries
 * people actually type ("is there a free react animation library", "how do I
 * copy a component"), and are emitted as FAQPage structured data so they can
 * win rich results.
 */
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Mirro?",
    answer:
      "Mirro is a free, open-source React animation library. It ships animated SVG icons, interactive components and full UI blocks as copy-paste source code, built with React 19, Tailwind CSS v4 and Motion (Framer Motion).",
  },
  {
    question: "Is Mirro free and open source?",
    answer:
      "Yes. Every icon, component and UI block is MIT licensed and free to use in personal and commercial projects. You copy the source into your own codebase, so there is no runtime dependency on Mirro itself.",
  },
  {
    question: "How do I install a Mirro component?",
    answer:
      "Run npx mirro-ui add <name> in your project — for example npx mirro-ui add typewriter-text. The CLI copies the component source into your codebase, exactly like shadcn/ui. You can also copy the code straight from any component page.",
  },
  {
    question: "Does Mirro work with Tailwind CSS and Next.js?",
    answer:
      "Yes. Mirro is built for Tailwind CSS v4 and works in Next.js App Router, Vite and any React 19 project. It uses CSS custom properties for theming, so it adapts to your existing design tokens and supports light and dark mode.",
  },
  {
    question: "Does Mirro support reduced motion and accessibility?",
    answer:
      "Every animated icon and component respects prefers-reduced-motion, and each is keyboard operable with proper ARIA roles. Each entry documents its accessibility, touch behaviour and reduced-motion fallback.",
  },
  {
    question: "Which animation library does Mirro use?",
    answer:
      "Mirro is built on Motion (the library formerly known as Framer Motion) for springs, layout animations and path drawing, plus hand-written CSS keyframes for ambient effects. No other animation dependency is required.",
  },
];

export function Faq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
    url: SITE_URL,
    name: `${SITE_NAME} — frequently asked questions`,
  };

  return (
    <section className="border-t border-border" aria-label="Frequently asked questions">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Animated React components, answered
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Everything about installing and using the Mirro animation library.
          </p>
        </div>

        <dl className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question} className="bg-background p-6">
              <dt className="text-base font-semibold text-foreground">{item.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

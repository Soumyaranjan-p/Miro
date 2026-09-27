import type { Metadata } from "next";
import Link from "next/link";
import { getRegistryEntries } from "@/lib/registry";

export const metadata: Metadata = {
  title: "Docs",
  description: "Install, use and customize Mirro — the animation-first UI library for React.",
};

function LibraryIndex() {
  const entries = getRegistryEntries();
  const groups: { label: string; type: string; basePath: string }[] = [
    { label: "Icons", type: "registry:icon", basePath: "/icons" },
    { label: "Components", type: "registry:component", basePath: "/components" },
    { label: "Blocks", type: "registry:block", basePath: "/blocks" },
  ];

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">Browse the library</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        {groups.map((group) => {
          const items = entries.filter((e) => e.type === group.type);
          if (items.length === 0) return null;
          return (
            <div key={group.type}>
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h3>
              <ul className="mt-3 space-y-1.5">
                {items.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={`${group.basePath}/${item.name}`}
                      className="text-sm text-foreground transition-colors duration-150 ease-out hover:text-accent"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-12 first:border-0">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DocCode({ children }: { children: string }) {
  return (
    <code className="code-theme inline-block rounded-md border border-border px-2.5 py-1 font-mono text-[13px] text-zinc-300">
      {children}
    </code>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-accent">Docs</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Documentation
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Everything you need to use and customize Mirro in your own projects.
        </p>
      </div>

      <LibraryIndex />

      <div className="mt-4 max-w-3xl">
        <DocSection id="usage" title="Usage">
          <p>Import the component you copied and use it like any other React component:</p>
          <div className="code-theme rounded-xl border border-border p-4">
            <pre className="font-mono text-sm leading-relaxed text-zinc-300">
              <code>{`import { HeartIcon } from "./components/mirro/icons/heart";

export function LikeButton() {
  return <HeartIcon size={24} label="Like" />;
}`}</code>
            </pre>
          </div>
          <p>
            Every component accepts a <DocCode>className</DocCode> and a set of animation props with sensible
            defaults. Tune them from the{" "}
            <Link href="/playground" className="text-accent underline underline-offset-4">
              playground
            </Link>{" "}
            and copy the configured code.
          </p>
        </DocSection>

        <DocSection id="theming" title="Theming">
          <p>
            Mirro&apos;s design tokens are plain CSS variables. Override any of them to match your brand:
          </p>
          <div className="code-theme rounded-xl border border-border p-4">
            <pre className="font-mono text-sm leading-relaxed text-zinc-300">
              <code>{`:root {
  --accent: #ff4d29;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}`}</code>
            </pre>
          </div>
          <p>
            The easing curves are the foundation of Mirro&apos;s motion. Use <DocCode>ease-out</DocCode> for
            entering and exiting elements, <DocCode>ease-in-out</DocCode> for on-screen movement, and{" "}
            <DocCode>ease-drawer</DocCode> for iOS-style drawers.
          </p>
        </DocSection>

        <DocSection id="accessibility" title="Accessibility">
          <p>Motion should be gentle and never the only carrier of information.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Every component respects <DocCode>prefers-reduced-motion</DocCode>, swapping movement for short
              opacity and color transitions.
            </li>
            <li>
              Hover-dependent effects are gated behind a <DocCode>(hover: hover) and (pointer: fine)</DocCode>{" "}
              check, so they never fire on tap.
            </li>
            <li>Interactive icons are keyboard accessible with proper focus states and ARIA attributes.</li>
            <li>Essential state is never communicated through animation alone.</li>
          </ul>
        </DocSection>
      </div>
    </div>
  );
}

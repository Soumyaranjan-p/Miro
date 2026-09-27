import Link from "next/link";
import { Logo } from "./logo";

const columns = [
  {
    title: "Library",
    links: [
      { label: "Icons", href: "/icons" },
      { label: "Components", href: "/components" },
      { label: "Blocks", href: "/blocks" },
      { label: "Playground", href: "/playground" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "CLI", href: "/docs#cli" },
      { label: "Installation", href: "/docs#installation" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Animated icons, components and UI blocks built for React. Copy, paste, ship.
            </p>
          </div>
          <div className="flex gap-16">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Mirro. MIT License.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://x.com/saroz_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
            >
              Created by Saroz
              <svg viewBox="0 0 24 24" className="size-3.5 transition-transform duration-150 ease-out group-hover:-translate-y-0.5" fill="currentColor" aria-hidden="true">
                <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z" />
              </svg>
            </a>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">npx mirro-ui init</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

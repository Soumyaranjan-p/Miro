import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-32 text-center sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-accent">404</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="mx-auto mt-4 max-w-sm text-base text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97]"
      >
        Back to home
      </Link>
    </div>
  );
}

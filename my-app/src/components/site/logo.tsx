export function LogoMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <circle
        cx="12"
        cy="12"
        r="8.5"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="42 10"
        className="logo-orbit"
      />
      <circle cx="12" cy="12" r="2.25" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className="h-5 w-5 text-foreground" />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">Mirro</span>
    </span>
  );
}

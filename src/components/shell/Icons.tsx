import type { ReactNode, SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false",
    ...props,
  };
}

function Node({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return <svg {...base(rest)}>{children}</svg>;
}

export function IconHome() {
  return (
    <Node>
      <path d="M4 11.2 12 4.5l8 6.7" />
      <path d="M6 10v9h4.5v-5h3v5H18v-9" />
    </Node>
  );
}

export function IconStats() {
  return (
    <Node>
      <path d="M5 20V12" />
      <path d="M12 20V6" />
      <path d="M19 20v-5" />
    </Node>
  );
}

export function IconIncident() {
  return (
    <Node>
      <path d="M12 3.5 5 6v5.5c0 4.4 2.9 7.4 7 9 4.1-1.6 7-4.6 7-9V6Z" />
      <path d="M12 9v4" />
      <circle cx="12" cy="16" r="0.4" fill="currentColor" stroke="none" />
    </Node>
  );
}

export function IconNormal() {
  return (
    <Node>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </Node>
  );
}

export function IconGear() {
  return (
    <Node>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.14-1.4l1.9-1.5-2-3.4-2.3.9a7 7 0 0 0-2.4-1.4L13.7 2.6h-3.4l-.36 2.6a7 7 0 0 0-2.4 1.4l-2.3-.9-2 3.4 1.9 1.5A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-1.9 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.4 1.4l.36 2.6h3.4l.36-2.6a7 7 0 0 0 2.4-1.4l2.3.9 2-3.4-1.9-1.5c.09-.46.14-.92.14-1.4Z" />
    </Node>
  );
}

export function IconSun() {
  return (
    <Node>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Node>
  );
}

export function IconKeyboard() {
  return (
    <Node>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M6.5 10.5h.01M10 10.5h.01M13.5 10.5h.01M17 10.5h.01M6.5 14h11" />
    </Node>
  );
}

export function IconMagnifier() {
  return (
    <Node>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Node>
  );
}

export function IconChat() {
  return (
    <Node>
      <path d="M4 6.5h16v10H9l-5 4Z" />
    </Node>
  );
}

export function IconCheck() {
  return (
    <Node>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Node>
  );
}

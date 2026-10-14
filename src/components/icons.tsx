/** Miro's icon set: 24x24, 1.6px strokes, currentColor. One visual voice. */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconStop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7l10 10M17 7L7 17" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.8l4.2 4.2L19 7.4" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.8l8.2 14.4H3.8L12 4.8z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="10.5" height="10.5" rx="2.5" />
    <path d="M15 5.5A1.5 1.5 0 0013.5 4h-8A1.5 1.5 0 004 5.5v8A1.5 1.5 0 005.5 15" />
  </Svg>
);

export const IconRetry = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12a7 7 0 10-2.6 5.4" />
    <path d="M19 5.6V12h-6" />
  </Svg>
);

export const IconMic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0013 0" />
    <path d="M12 18v2.5M8.5 20.5h7" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v10" />
    <path d="M8 10.5l4 4 4-4" />
    <path d="M5 19h14" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 7h13" />
    <path d="M9.5 7V5.5A1.5 1.5 0 0111 4h2a1.5 1.5 0 011.5 1.5V7" />
    <path d="M7 7l.8 11.2A1.6 1.6 0 009.4 19.7h5.2a1.6 1.6 0 001.6-1.5L17 7" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5A1.5 1.5 0 015.5 6h3.2l1.6 2h8.2A1.5 1.5 0 0120 9.5v7A1.5 1.5 0 0118.5 18h-13A1.5 1.5 0 014 16.5v-9z" />
  </Svg>
);

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="3.4" />
    <path d="M11.4 12H20" />
    <path d="M17.5 12v3M14.5 12v2.2" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.4A8 8 0 019.6 4a8 8 0 1010.4 10.4z" />
  </Svg>
);

export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="11.5" rx="2" />
    <path d="M9 19.5h6M12 16v3.5" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5l1.6 4.2 4.4 1.6-4.4 1.6L12 16l-1.6-4.1L6 10.3l4.4-1.6L12 4.5z" />
    <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.8l6.5 2.4v5c0 4.1-2.7 7.3-6.5 9-3.8-1.7-6.5-4.9-6.5-9v-5L12 3.8z" />
    <path d="M9.2 12.2l2 2 3.6-3.9" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5L11 13" />
    <path d="M17.5 14.5v3.5A1.5 1.5 0 0116 19.5H6A1.5 1.5 0 014.5 18V8A1.5 1.5 0 016 6.5h3.5" />
  </Svg>
);

export const IconWaveform = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h1.6" />
    <path d="M8 8.5v7M11.5 5.5v13M15 8v8M18.5 10.5v3" />
  </Svg>
);

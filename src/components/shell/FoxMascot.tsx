import type { CSSProperties } from "react";

export type FoxVariant = "idle" | "wizard";

const IDLE_LETTER_COLOR = "#ECEAE6";
const CREAM = "#FBEEDB";
const BODY = "#F08A3C";
const BODY_DEEP = "#D96E23";
const HAT = "#8B5CF6";
const HAT_DEEP = "#6D3FE0";
const HAT_STAR = "#E4DAFF";
const INK = "#221A14";

/**
 * Miro's fox. Hand-drawn flat vector: two ears, a wide head, cream muzzle,
 * closed happy eyes, so it reads at 18-40px on a dark surface.
 * The wizard variant adds the purple hat that the island wears.
 */
export function FoxMascot({
  size = 32,
  variant = "idle",
  className,
  style,
}: {
  size?: number;
  variant?: FoxVariant;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Miro the fox"
      className={className}
      style={style}
      focusable="false"
    >
      {/* ears */}
      <path d="M13 27C9.5 16 10.5 8.5 14.5 6.5C19 4.4 24.5 8.5 26 17.5L24.5 28.5Z" fill={BODY} />
      <path d="M51 27C54.5 16 53.5 8.5 49.5 6.5C45 4.4 39.5 8.5 38 17.5L39.5 28.5Z" fill={BODY} />
      <path d="M15.5 24.5C13.7 18 14.3 12 16.8 10.8C19.5 9.5 22.7 12.6 23.6 18.5L22.8 25.8Z" fill={BODY_DEEP} />
      <path d="M48.5 24.5C50.3 18 49.7 12 47.2 10.8C44.5 9.5 41.3 12.6 40.4 18.5L41.2 25.8Z" fill={BODY_DEEP} />

      {variant === "wizard" ? (
        <g>
          {/* purple wizard hat, tipped and starry */}
          <path d="M17 21C20 12 25 5.5 29.5 2.2C31.2 0.9 33.6 1.3 34.8 3.1C42.5 10.5 45.5 17 46.5 23.5L32 26.5Z" fill={HAT} />
          <path d="M29.5 2.2C31.2 0.9 33.6 1.3 34.8 3.1C42.5 10.5 45.5 17 46.5 23.5L39.5 25.4C37.5 15.5 34 8 29.5 2.2Z" fill={HAT_DEEP} opacity="0.55" />
          {/* floppy tip */}
          <path d="M34.8 3.1C36 1.7 39 1.2 40.8 2.8C43.4 5.1 42.4 9 39.1 9.6C38.9 7.5 37.2 5 34.8 3.1Z" fill={HAT_DEEP} />
          <path d="M17.6 21.6C25 19.4 37 19.6 45.5 22.8C47.8 23.7 47.3 27 44.9 27.5C36 29.2 26.5 29.2 18.6 27.2C16.3 26.6 15.6 22.4 17.6 21.6Z" fill={HAT} />
          <path d="M24 11.5l2.2 2.2 3.2.5-2.4 2.6.5 3.4-2.9-1.6-3 1.4.8-3.4-2.2-2.6 3.3-.4z" fill={HAT_STAR} />
        </g>
      ) : null}

      {/* head */}
      <path
        d="M32 12C43 12 52 20.5 52 32.5C52 45 43.5 54.5 32 54.5C20.5 54.5 12 45 12 32.5C12 20.5 21 12 32 12Z"
        fill={BODY}
      />
      {/* cream muzzle */}
      <path d="M32 33L18.5 44.5C21.8 50.6 26.6 54.5 32 54.5C37.4 54.5 42.2 50.6 45.5 44.5Z" fill={CREAM} />
      {/* eyes - happy closed arcs */}
      <path d="M21.5 34.5C23.5 31.5 28 31 30.5 33.5" fill="none" stroke={IDLE_LETTER_COLOR} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M33.5 33.5C36 31 40.5 31.5 42.5 34.5" fill="none" stroke={IDLE_LETTER_COLOR} strokeWidth="3.4" strokeLinecap="round" />
      {/* nose */}
      <path d="M29 38.5C31 37.5 33 37.5 35 38.5C34 40.8 30 40.8 29 38.5Z" fill={INK} />
      {/* smile start on muzzle */}
      <path d="M27 45C30 47 34 47 37 45" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

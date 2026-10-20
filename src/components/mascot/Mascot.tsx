import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";
import { MASCOT_EXPRESSION_LABELS, type MascotExpression, type MascotProps } from "./mascot.types";
import "./Mascot.css";

const PILL_BASE_HEIGHT = 56;
const PILL_BASE_Y = 68;
const PILL_GROWTH = 0.2;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** The greeting holds on screen for two seconds before it settles away. */
const GREETING_FALLBACK_MS = 2000;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Self-contained: the mascot must not depend on any host project's lib. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/**
 * Miro's mascot rendered as inline SVG: a glossy dark-glass orb on a 200x200
 * grid. Only the eyes differ between expressions. It draws nothing external,
 * logs nothing, stores nothing and takes no transcript text.
 */
export function Mascot({
  expression,
  size = 64,
  level,
  shadow = false,
  decorative = false,
  className,
  title,
  onDone,
  playKey,
}: MascotProps) {
  const reduced = usePrefersReducedMotion();
  const gradientId = `miro-mascot-sphere-${useId().replace(/:/g, "")}`;

  const isHello = expression === "hello";
  const greetingKey = playKey ?? 0;
  const [settledKey, setSettledKey] = useState<number | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Re-arm the one-shot guard whenever a greeting starts fresh.
  useEffect(() => {
    doneRef.current = false;
  }, [greetingKey, isHello, reduced]);

  const finishGreeting = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setSettledKey(greetingKey);
    onDoneRef.current?.();
  }, [greetingKey]);

  // A greeting plays exactly once per mount / playKey change. Reduced motion
  // skips straight to the settled state but still reports completion async.
  useEffect(() => {
    if (!isHello) return;
    const id = window.setTimeout(finishGreeting, reduced ? 0 : GREETING_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [isHello, reduced, greetingKey, finishGreeting]);

  const greeting = isHello && !reduced && settledKey !== greetingKey;
  const shownExpression: MascotExpression = isHello ? (greeting ? "hello" : "happy") : expression;

  const listening = shownExpression === "listening";
  const pulsing = listening && level !== undefined;
  const clampedLevel = level === undefined ? 0 : clamp01(level);
  const pillHeight = PILL_BASE_HEIGHT * (1 + PILL_GROWTH * clampedLevel);
  const pillY = PILL_BASE_Y + PILL_BASE_HEIGHT / 2 - pillHeight / 2;

  const label = title ?? MASCOT_EXPRESSION_LABELS[expression];
  const rootClass = [
    "miro-mascot",
    reduced ? "miro-mascot--reduced" : "miro-mascot--animated",
    greeting ? "miro-mascot--greeting" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const onBodyAnimationEnd = (event: AnimationEvent<SVGGElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName !== "miro-mascot-hello") return;
    finishGreeting();
  };

  const expressionGroup = (name: MascotExpression, children: ReactNode) => {
    const active = shownExpression === name;
    return (
      <g
        className={`miro-mascot__expression miro-mascot__expression--${name}${active ? " is-active" : ""}`}
        style={{ opacity: active ? 1 : 0 }}
        aria-hidden="true"
      >
        {children}
      </g>
    );
  };

  return (
    <svg
      className={rootClass}
      width={size}
      height={size}
      viewBox={isHello ? "0 -30 200 230" : "0 0 200 200"}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} className="miro-mascot__sphere-gradient" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="var(--miro-mascot-sphere-0, #4A5066)" />
          <stop offset="0.45" stopColor="var(--miro-mascot-sphere-1, #1A1D2A)" />
          <stop offset="1" stopColor="var(--miro-mascot-sphere-2, #07080D)" />
        </radialGradient>
      </defs>

      {(shadow || isHello) && (
        <ellipse
          className="miro-mascot__shadow"
          cx="100"
          cy="192"
          rx="50"
          ry="6"
          fill="var(--miro-mascot-shadow, #000000)"
          opacity="0.12"
        />
      )}

      <g
        className="miro-mascot__body"
        key={isHello ? `hello-${greetingKey}` : "orb"}
        onAnimationEnd={onBodyAnimationEnd}
      >
        <circle cx="100" cy="100" r="84" fill={`url(#${gradientId})`} />

        <circle
          className="miro-mascot__rim"
          cx="100"
          cy="100"
          r="83"
          fill="none"
          stroke={listening ? "var(--miro-mascot-rim-accent, #2DBFA0)" : "var(--miro-mascot-rim, #8892AA)"}
          strokeWidth={listening ? 3 : 2}
          opacity={listening ? 0.9 : 0.35}
        />

        <ellipse
          className="miro-mascot__highlight"
          cx="70"
          cy="52"
          rx="30"
          ry="13"
          fill="var(--miro-mascot-highlight, #FFFFFF)"
          opacity="0.2"
          transform="rotate(-28 70 52)"
        />

        <path
          className="miro-mascot__reflection"
          d="M52 150Q100 184 148 150"
          fill="none"
          stroke="var(--miro-mascot-highlight, #FFFFFF)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeOpacity="0.1"
        />

        {expressionGroup(
          "idle",
          <g className="miro-mascot__eyes-idle">
            <rect className="miro-mascot__pill" x="58" y="98" width="34" height="10" rx="5" fill="var(--miro-mascot-eye, #F2F2F5)" />
            <rect className="miro-mascot__pill" x="108" y="98" width="34" height="10" rx="5" fill="var(--miro-mascot-eye, #F2F2F5)" />
          </g>,
        )}

        {expressionGroup(
          "listening",
          <>
            <circle
              className={`miro-mascot__ring${pulsing ? " miro-mascot__ring--pulsing" : ""}`}
              cx="100"
              cy="100"
              r="92"
              fill="none"
              stroke="var(--miro-mascot-accent, #2DBFA0)"
              strokeWidth="2"
            />
            <rect
              className="miro-mascot__pill"
              x="62"
              y={pillY}
              width="24"
              height={pillHeight}
              rx="12"
              fill="var(--miro-mascot-eye, #F2F2F5)"
            />
            <rect
              className="miro-mascot__pill"
              x="114"
              y={pillY}
              width="24"
              height={pillHeight}
              rx="12"
              fill="var(--miro-mascot-eye, #F2F2F5)"
            />
          </>,
        )}

        {expressionGroup(
          "thinking",
          <g className="miro-mascot__thinking">
            <ellipse cx="80" cy="88" rx="12" ry="17" fill="var(--miro-mascot-eye, #F2F2F5)" />
            <ellipse cx="124" cy="88" rx="12" ry="17" fill="var(--miro-mascot-eye, #F2F2F5)" />
            <circle className="miro-mascot__dot miro-mascot__dot--1" cx="84" cy="130" r="4" fill="var(--miro-mascot-accent, #2DBFA0)" />
            <circle className="miro-mascot__dot miro-mascot__dot--2" cx="100" cy="130" r="5" fill="var(--miro-mascot-accent, #2DBFA0)" />
            <circle className="miro-mascot__dot miro-mascot__dot--3" cx="116" cy="130" r="6" fill="var(--miro-mascot-accent, #2DBFA0)" />
          </g>,
        )}

        {expressionGroup(
          "happy",
          <g className="miro-mascot__happy">
            <path
              d="M58 112Q75 84 92 112"
              fill="none"
              stroke="var(--miro-mascot-eye, #F2F2F5)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M108 112Q125 84 142 112"
              fill="none"
              stroke="var(--miro-mascot-eye, #F2F2F5)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <g className="miro-mascot__sparkle" stroke="var(--miro-mascot-accent, #2DBFA0)" strokeWidth="3" strokeLinecap="round">
              <path d="M150 54v16" />
              <path d="M142 62h16" />
            </g>
          </g>,
        )}

        {expressionGroup(
          "error",
          <g className="miro-mascot__error">
            <rect
              className="miro-mascot__pill"
              x="62"
              y="86"
              width="20"
              height="38"
              rx="10"
              fill="var(--miro-mascot-error-eye, #C9CBD6)"
              transform="rotate(14 72 105)"
            />
            <rect
              className="miro-mascot__pill"
              x="118"
              y="86"
              width="20"
              height="38"
              rx="10"
              fill="var(--miro-mascot-error-eye, #C9CBD6)"
              transform="rotate(-14 128 105)"
            />
            <path
              className="miro-mascot__drop"
              d="M152 66C152 66 145 76 145 82a7 7 0 1 0 14 0c0-6-7-16-7-16z"
              fill="var(--miro-mascot-drop, #8EC5FF)"
            />
          </g>,
        )}

        {expressionGroup(
          "alert",
          <g className="miro-mascot__alert">
            <circle cx="72" cy="98" r="22" fill="var(--miro-mascot-eye, #F2F2F5)" />
            <circle cx="128" cy="98" r="22" fill="var(--miro-mascot-eye, #F2F2F5)" />
          </g>,
        )}

        {expressionGroup(
          "hello",
          <>
            <circle
              className="miro-mascot__hello-ring miro-mascot__hello-glow"
              cx="100"
              cy="100"
              r="92"
              fill="none"
              stroke="var(--miro-mascot-accent, #2DBFA0)"
              strokeWidth="3"
              opacity="0"
            />
            <path
              className="miro-mascot__hello-sparkle miro-mascot__hello-glow"
              d="M158 38v14M151 45h14"
              fill="none"
              stroke="var(--miro-mascot-accent, #2DBFA0)"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0"
            />
            <rect className="miro-mascot__pill" x="62" y="76" width="24" height="48" rx="12" fill="var(--miro-mascot-eye, #F2F2F5)" />
            <rect
              className="miro-mascot__pill miro-mascot__hello-eye-open"
              x="114"
              y="76"
              width="24"
              height="48"
              rx="12"
              fill="var(--miro-mascot-eye, #F2F2F5)"
            />
            <path
              className="miro-mascot__hello-wink"
              d="M112 106Q126 88 140 106"
              fill="none"
              stroke="var(--miro-mascot-eye, #F2F2F5)"
              strokeWidth="10"
              strokeLinecap="round"
              opacity="0"
            />
          </>,
        )}
      </g>
    </svg>
  );
}

/**
 * Miro's mascot: a calm, glossy dark-glass orb whose eyes carry the mood.
 *
 * The mascot is intentionally dumb about the product. It takes no transcript
 * text, never touches the network, and knows only an expression plus an
 * optional numeric level. Mapping it onto any overlay states happens later,
 * at the call site.
 */

export type MascotExpression = "idle" | "listening" | "thinking" | "happy" | "error" | "alert" | "hello";

/** Every expression, in gallery order. */
export const MASCOT_EXPRESSIONS: MascotExpression[] = [
  "idle",
  "listening",
  "thinking",
  "happy",
  "error",
  "alert",
  "hello",
];

/** Default accessible name per expression; a `title` prop overrides it. */
export const MASCOT_EXPRESSION_LABELS: Record<MascotExpression, string> = {
  idle: "Miro is ready",
  listening: "Miro is listening",
  thinking: "Miro is thinking",
  happy: "Miro is happy",
  error: "Miro needs a moment",
  alert: "Miro is alert",
  hello: "Miro says hello",
};

export interface MascotProps {
  /** Which mood the eyes are showing. `hello` plays a one-shot greeting. */
  expression: MascotExpression;
  /** Rendered size in CSS pixels, square. Defaults to 64. */
  size?: number;
  /**
   * Optional 0..1 input level. Only meaningful for `listening`: it scales the
   * eye pills up to +20% and starts the ring pulse. Clamped to 0..1.
   */
  level?: number;
  /** Draw the soft floor shadow under the orb. Defaults to false. */
  shadow?: boolean;
  /** Decorative use: hides the mascot from assistive technology entirely. */
  decorative?: boolean;
  /** Extra class names on the root <svg>. */
  className?: string;
  /** Accessible name; overrides the expression's default label. */
  title?: string;
  /** Called once when a `hello` greeting finishes (settling into `happy`). */
  onDone?: () => void;
  /** Change this number to restart the `hello` greeting. */
  playKey?: number;
}

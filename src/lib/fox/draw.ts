/**
 * Miro's mascot, drawn in code.
 *
 * A small round, soft-bodied creature: one warm gradient body, a soft ivory
 * belly, rounded teardrop ears, and two big glossy eyes that carry the whole
 * expression. Nothing spiky, no whiskers, no hard lines - every shape is a
 * filled curve or a round-capped stroke, shaded with soft gradients so it
 * reads as lit surfaces at any size.
 *
 * The layers enter back-to-front (glow, tail, ears, body, belly, face) and the
 * silhouette holds up at 34px in the sidebar and at 1024px for the icons.
 * Every frame is computed from (t, state, level, gaze, poke), with nothing to
 * load:
 *
 *   normal     breathing, warm, slow blink, gentle tail sway
 *   incident   alert wide eyes, a soft red glow, ears folded back, tail tucked
 *   listening  eyes wide and bright, mouth follows the mic level, blush rises
 *   processing eyes rest on a calm line, tail pauses
 *   error      alert palette, wincing squint
 *   neutral    static calm pose - no time-driven motion, instant first paint
 *
 * A click squishes the whole body and turns the eyes happy for the moment.
 * State changes blend over ~0.35s from the renderer's own state, and motion
 * respects the OS reduced-motion preference.
 */

export type FoxState =
  | "neutral"
  | "normal"
  | "incident"
  | "listening"
  | "processing"
  | "error";

export interface FoxParams {
  /** Animation clock in seconds. */
  t: number;
  state: FoxState;
  /** Microphone level 0..1 while listening; ignored otherwise. */
  level: number;
  /** Gaze target, -1..1 on both axes. */
  gazeX: number;
  gazeY: number;
  /** Canvas rect in device pixels. */
  width: number;
  height: number;
  /** Damp ambient motion for people who asked Windows to calm down. */
  reducedMotion: boolean;
}

interface FoxColors {
  /** Light top of the body gradient. */
  top: string;
  /** Mid body. */
  body: string;
  /** Shade at the bottom - also the ear shape's lower colour. */
  lo: string;
  belly: string;
  earIn: string;
  eye: string;
  eyeTop: string;
  nose: string;
  mouth: string;
  blush: string;
  highlight: string;
}

const CALM: FoxColors = {
  top: "#FFB27C",
  body: "#F97E42",
  lo: "#E05F2C",
  belly: "#FFEBD6",
  earIn: "#FFAA7C",
  eye: "#241709",
  eyeTop: "#4A2E12",
  nose: "#3C2410",
  mouth: "#3C2410",
  blush: "#FF8E5A",
  highlight: "#FFFFFF",
};

const ALERT: FoxColors = {
  ...CALM,
  top: "#FF8C70",
  body: "#EF5240",
  lo: "#C43A27",
  belly: "#FFE2D3",
  earIn: "#FF9C85",
  eye: "#2A0C06",
  eyeTop: "#52160B",
  nose: "#3A100A",
  mouth: "#3A100A",
  blush: "#FF7563",
};

interface Pose {
  /** 0 = ears up, 1 = ears folded back. */
  earBack: number;
  /** 0 = tail high, 1 = tucked low. */
  tailTuck: number;
  /** Body tension widens the breathing a touch. */
  tense: number;
  /** Cheek blush strength, 0..1. */
  blush: number;
}

function poseFor(state: FoxState): Pose {
  switch (state) {
    case "incident":
    case "error":
      return { earBack: 0.7, tailTuck: 0.9, tense: 1.4, blush: 0.35 };
    case "listening":
      return { earBack: -0.1, tailTuck: 0, tense: 0.8, blush: 0.85 };
    case "processing":
      return { earBack: 0.15, tailTuck: 0.2, tense: 0.8, blush: 0.4 };
    case "neutral":
      return { earBack: 0, tailTuck: 0, tense: 1, blush: 0.5 };
    case "normal":
    default:
      return { earBack: 0, tailTuck: 0, tense: 1, blush: 0.5 };
  }
}

interface EyeSpec {
  /** 0 closed → 1 wide open. */
  openness: number;
  /** 0 = soft round eye → 1 = wide, alert round eye. */
  wide: number;
}

function eyeShape(state: FoxState, level: number): EyeSpec {
  switch (state) {
    case "listening":
      return { openness: 0.92, wide: 0.35 + level * 0.25 };
    case "incident":
      return { openness: 1, wide: 0.6 };
    case "error":
      return { openness: 0.42, wide: 0.3 };
    case "processing":
      return { openness: 0.1, wide: 0 };
    case "neutral":
      return { openness: 0.8, wide: 0.1 };
    case "normal":
    default:
      return { openness: 0.78, wide: 0.08 };
  }
}

/** How long a state blend takes, in seconds. */
const TRANSITION_SECONDS = 0.35;

/** Click reaction: seconds from the click at full strength to rest. */
const POKE_SECONDS = 0.65;

const TAU = Math.PI * 2;

function wave(t: number, periodSeconds: number): number {
  return Math.sin((t / periodSeconds) * TAU);
}

function clampRange(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}

function damp(motion: boolean, amount: number): number {
  return motion ? amount * 0.3 : amount;
}

interface Vec {
  x: number;
  y: number;
}

/** Ease-in-out, so a blink never flickers half-shut. */
function smooth(f: number): number {
  const clamped = Math.max(0, Math.min(1, f));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * The blink envelope: 0 = open, 1 = shut. One blink every `period` seconds,
 * starting `offset` into the cycle, lasting `seconds`.
 */
function blinkEnvelope(t: number, period: number, offset: number, seconds: number): number {
  const phase = (t - offset) % period;
  const half = seconds * 0.5;
  if (phase < 0 || phase > seconds) return 0;
  return phase < half ? smooth(phase / half) : smooth(1 - (phase - half) / half);
}

// ---------------------------------------------------------------------------
// Mutable per-canvas state
// ---------------------------------------------------------------------------

/** Mutable bookkeeping kept by the owning canvas. */
export interface FoxRenderState {
  state: FoxState;
  /** How far through a blend into `state` we are, 0..1. */
  blend: number;
  /** Previous frame's clock, for frame-rate independent blending. */
  lastT: number;
  /** Seconds left on the click reaction; 0 = resting. */
  poke: number;
}

export function createFoxRenderer(): FoxRenderState {
  return { state: "normal", blend: 1, lastT: -1, poke: 0 };
}

function mixPose(from: Pose, to: Pose, f: number): Pose {
  return {
    earBack: from.earBack + (to.earBack - from.earBack) * f,
    tailTuck: from.tailTuck + (to.tailTuck - from.tailTuck) * f,
    tense: from.tense + (to.tense - from.tense) * f,
    blush: from.blush + (to.blush - from.blush) * f,
  };
}

// ---------------------------------------------------------------------------
// Gradients (built per frame; the canvas caches nothing we need to care about)
// ---------------------------------------------------------------------------

/** The body's soft vertical build: lit at the top, shading toward the base. */
function verticalGradient(
  ctx: CanvasRenderingContext2D,
  topY: number,
  bottomY: number,
  colors: FoxColors,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
  gradient.addColorStop(0, colors.top);
  gradient.addColorStop(0.55, colors.body);
  gradient.addColorStop(1, colors.lo);
  return gradient;
}

/** An ear shading that starts at the body tone, so no dark seam at the base. */
function earGradient(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  tipY: number,
  colors: FoxColors,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, tipY, 0, baseY);
  gradient.addColorStop(0, colors.body);
  gradient.addColorStop(1, colors.top);
  return gradient;
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/**
 * One soft teardrop ear: short and stubby, so it reads as part of the head.
 * The silhouette is two bulged quadratics capped by a tip circle; the inner
 * blush oval sits inside, near the tip.
 */
function drawEar(
  ctx: CanvasRenderingContext2D,
  options: {
    base: Vec;
    /** Direction the tip points in radians; 0 = straight up. */
    angle: number;
    /** Length of the ear from base centre to tip. */
    length: number;
    /** Half-width of the ear base. */
    width: number;
    colors: FoxColors;
  },
): void {
  const { base, angle, length, width, colors } = options;
  const direction = { x: Math.sin(angle), y: -Math.cos(angle) };
  const lateral = { x: -direction.y, y: direction.x };
  const tip = { x: base.x + direction.x * length, y: base.y + direction.y * length };

  const outer = {
    x: base.x - lateral.x * width * 1.05 + direction.x * length * 0.5,
    y: base.y - lateral.y * width * 1.05 + direction.y * length * 0.5,
  };
  const inner = {
    x: base.x + lateral.x * width * 0.85 + direction.x * length * 0.42,
    y: base.y + lateral.y * width * 0.85 + direction.y * length * 0.42,
  };

  ctx.fillStyle = earGradient(ctx, base.y, tip.y, colors);
  ctx.beginPath();
  ctx.moveTo(base.x - lateral.x * width, base.y - lateral.y * width);
  ctx.quadraticCurveTo(outer.x, outer.y, tip.x - lateral.x * width * 0.3, tip.y - lateral.y * width * 0.3);
  ctx.quadraticCurveTo(inner.x, inner.y, base.x + lateral.x * width, base.y + lateral.y * width);
  ctx.closePath();
  ctx.fill();
  // The tip circle rounds off both quadratic ends with one smooth surface.
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, width * 0.3, 0, TAU);
  ctx.fill();

  // Inner-ear wash: a small oval inside the teardrop, near the tip.
  const at = {
    x: base.x + direction.x * length * 0.52,
    y: base.y + direction.y * length * 0.52,
  };
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, width * 0.24, length * 0.16, angle + Math.PI / 2, 0, TAU);
  ctx.fillStyle = colors.earIn;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The tail: a short, fat round-capped curve hugging the body's right side. */
function drawTail(
  ctx: CanvasRenderingContext2D,
  options: { root: Vec; tuck: number; sway: number; colors: FoxColors; radius: number },
): void {
  const { root, tuck, sway, colors, radius } = options;
  // Calm: a short nub curling out low on the body's right. Tucked: hangs down.
  const tip = {
    x: root.x + 10 * (1 - tuck) + 2 * tuck - sway * 2,
    y: root.y - 6 * (1 - tuck) + 10 * tuck,
  };
  const mid = {
    x: root.x + 8 - sway * 1.5 + 1 * tuck,
    y: root.y - 5 * (1 - tuck) + 4 * tuck,
  };

  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
  ctx.strokeStyle = colors.lo;
  ctx.lineWidth = radius;
  ctx.lineCap = "round";
  ctx.stroke();
}

/**
 * One big glossy eye. The dark base gets a subtle top-to-bottom gloss, the
 * highlight is a fixed two-dot white pair so the surface reads as wet glass,
 * and the whole dark core leans toward the gaze without taking the highlight
 * with it.
 */
function drawEye(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  radius: number,
  spec: EyeSpec,
  colors: FoxColors,
  gaze: Vec,
): void {
  const at = {
    x: center.x + gaze.x * radius * 0.34,
    y: center.y + gaze.y * radius * 0.3,
  };
  const ry = radius * (0.62 + spec.wide * 0.5) * Math.max(spec.openness, 0);
  const rx = radius * (0.88 + spec.wide * 0.16);

  // Alert mode raises a faint halo first, so the eye lifts out of the face.
  if (spec.wide > 0.45 && spec.openness > 0.6) {
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx * 1.24, ry * 1.24, 0, 0, TAU);
    ctx.fillStyle = colors.highlight;
    ctx.globalAlpha = 0.16;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (spec.openness <= 0.16) {
    // Closed, scanning, or asleep: one smooth arc, nothing fussy.
    ctx.beginPath();
    ctx.moveTo(center.x - rx, center.y + ry * 0.3);
    ctx.quadraticCurveTo(center.x, center.y - ry * 0.9, center.x + rx, center.y + ry * 0.3);
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = radius * 0.26;
    ctx.lineCap = "round";
    ctx.stroke();
    return;
  }

  // Glossy base: near-black with a warm top so it never looks flat.
  const base = ctx.createLinearGradient(at.x, at.y - ry, at.x, at.y + ry);
  base.addColorStop(0, colors.eyeTop);
  base.addColorStop(0.35, colors.eye);
  base.addColorStop(1, colors.eye);
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = base;
  ctx.fill();

  // The wet look: one large highlight top-left, one small echo low-right.
  ctx.beginPath();
  ctx.arc(at.x - rx * 0.3, at.y - ry * 0.38, radius * 0.2, 0, TAU);
  ctx.fillStyle = colors.highlight;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(at.x + rx * 0.3, at.y + ry * 0.36, radius * 0.09, 0, TAU);
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Happy closed eyes for the click: two soft upward arcs, nothing else. */
function drawEyeSmile(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  radius: number,
  colors: FoxColors,
): void {
  ctx.beginPath();
  ctx.moveTo(center.x - radius, center.y + radius * 0.22);
  ctx.quadraticCurveTo(center.x, center.y - radius * 0.85, center.x + radius, center.y + radius * 0.22);
  ctx.strokeStyle = colors.eye;
  ctx.lineWidth = radius * 0.26;
  ctx.lineCap = "round";
  ctx.stroke();
}

/** A small rounded-triangle nose and an easy smile - one warm, one open. */
function drawMuzzle(
  ctx: CanvasRenderingContext2D,
  noseAt: Vec,
  mouthAt: Vec,
  scale: number,
  colors: FoxColors,
  mouthOpen: number,
): void {
  const width = 7.2 * scale;

  ctx.beginPath();
  ctx.moveTo(noseAt.x - width, noseAt.y - width * 0.24);
  ctx.quadraticCurveTo(noseAt.x, noseAt.y - width * 0.46, noseAt.x + width, noseAt.y - width * 0.24);
  ctx.quadraticCurveTo(noseAt.x + width * 0.45, noseAt.y + width * 0.55, noseAt.x, noseAt.y + width * 0.55);
  ctx.quadraticCurveTo(noseAt.x - width * 0.45, noseAt.y + width * 0.55, noseAt.x - width, noseAt.y - width * 0.24);
  ctx.fillStyle = colors.nose;
  ctx.fill();

  if (mouthOpen > 0.06) {
    // An open mouth while a voice is being heard: a rounded oval.
    ctx.beginPath();
    ctx.ellipse(
      mouthAt.x,
      mouthAt.y + mouthOpen * 2.6 * scale,
      width * 0.52,
      width * (0.4 + mouthOpen * 0.55),
      0,
      0,
      TAU,
    );
    ctx.fillStyle = colors.mouth;
    ctx.fill();
    // A tongue-light bottom so the opening reads friendly, not hollow.
    ctx.beginPath();
    ctx.ellipse(
      mouthAt.x,
      mouthAt.y + mouthOpen * 3.6 * scale,
      width * 0.3,
      width * (0.16 + mouthOpen * 0.2),
      0,
      0,
      TAU,
    );
    ctx.fillStyle = "#E0725B";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(mouthAt.x - width * 0.9, mouthAt.y - width * 0.1);
    ctx.quadraticCurveTo(mouthAt.x, mouthAt.y + width * 0.42, mouthAt.x + width * 0.9, mouthAt.y - width * 0.1);
    ctx.strokeStyle = colors.mouth;
    ctx.lineWidth = 2.1 * scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

/** Soft round cheek washes; they rise with attention or voice level. */
function drawBlush(
  ctx: CanvasRenderingContext2D,
  left: Vec,
  right: Vec,
  radius: number,
  colors: FoxColors,
  strength: number,
): void {
  if (strength <= 0.02) return;
  ctx.fillStyle = colors.blush;
  ctx.globalAlpha = 0.55 * strength;
  ctx.beginPath();
  ctx.ellipse(left.x, left.y, radius, radius * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(right.x, right.y, radius, radius * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Top-level renderer
// ---------------------------------------------------------------------------

/** Draws one frame. `render` is the per-canvas state object from the factory. */
export function drawFox(
  ctx: CanvasRenderingContext2D,
  params: FoxParams,
  render: FoxRenderState,
): void {
  const { t, reducedMotion: motion, level } = params;

  // Frame-rate independent blend into the current state.
  if (render.state !== params.state) {
    render.state = params.state;
    render.blend = 0;
  }
  const dt = render.lastT < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, t - render.lastT));
  render.lastT = t;
  render.blend = Math.min(1, render.blend + dt / TRANSITION_SECONDS);
  // The click reaction runs down on its own clock.
  render.poke = Math.max(0, render.poke - dt);

  const colors = params.state === "incident" || params.state === "error" ? ALERT : CALM;
  const incident = colors === ALERT;
  const pose = mixPose(poseFor("normal"), poseFor(params.state), render.blend);

  // Static pose: no blink, no breathing, no tail sway. Still fully shaded.
  const idle = params.state === "neutral" || motion;
  const unit = params.width / 128;

  ctx.clearRect(0, 0, params.width, params.height);
  ctx.save();
  ctx.scale(unit, params.height / 128);

  const center = { x: 64, y: 72 };
  const radius = 33;

  // --- incident glow (behind everything) ---
  if (incident && render.blend > 0.02) {
    const glow = ctx.createRadialGradient(center.x, center.y, radius * 0.6, center.x, center.y, radius * 1.75);
    glow.addColorStop(0, "rgba(255, 94, 68, 0.34)");
    glow.addColorStop(1, "rgba(255, 94, 68, 0)");
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 1.75, 0, TAU);
    ctx.fillStyle = glow;
    ctx.globalAlpha = render.blend;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // --- the whole figure breathes (and squishes on a click) ---
  const breath = idle
    ? 1
    : 1 + damp(motion, 0.016) * wave(t, 4.2) * pose.tense + (params.state === "listening" ? level * 0.02 : 0);
  let squish = 1;
  if (render.poke > 0) {
    // One squash-and-release: half sine, so it starts and ends at rest.
    const pokePhase = Math.sin(((POKE_SECONDS - render.poke) / POKE_SECONDS) * Math.PI);
    squish = 1 - 0.075 * pokePhase;
  }
  ctx.save();
  ctx.translate(center.x, center.y + radius);
  ctx.scale((1 / breath) * (1 + (squish - 1) * 0.4), breath * squish);
  ctx.translate(-center.x, -(center.y + radius));

  // --- tail (behind the body) ---
  const scanning = params.state === "processing";
  const tailSway = idle
    ? 0
    : damp(motion, incident ? 3 : scanning ? 1.5 : 4.2) * wave(t, scanning ? 5 : 3.1);
  drawTail(ctx, {
    root: { x: center.x + radius * 0.62, y: center.y + radius * 0.82 },
    tuck: pose.tailTuck,
    sway: tailSway,
    colors,
    radius: radius * 0.27,
  });

  // --- ears: classic diagonal, rooted deep enough that the base never shows ---
  const earBackAmount = pose.earBack;
  const wobble = idle || scanning ? 0 : wave(t, 5.2) * 0.035 * (1 + level * 0.4);
  drawEar(ctx, {
    base: { x: center.x - radius * 0.44, y: center.y - radius * 0.7 },
    angle: -0.3 + earBackAmount * 0.55 + wobble,
    length: radius * 0.66,
    width: radius * 0.3,
    colors,
  });
  drawEar(ctx, {
    base: { x: center.x + radius * 0.44, y: center.y - radius * 0.7 },
    angle: 0.3 - earBackAmount * 0.55 + wobble,
    length: radius * 0.66,
    width: radius * 0.3,
    colors,
  });

  // --- body ---
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radius * 1.02, radius, 0, 0, TAU);
  ctx.fillStyle = verticalGradient(ctx, center.y - radius * 1.15, center.y + radius, colors);
  ctx.fill();

  // A soft top-left sheen so the surface reads as lit, not painted flat.
  const sheen = ctx.createRadialGradient(
    center.x - radius * 0.42,
    center.y - radius * 0.5,
    radius * 0.1,
    center.x - radius * 0.42,
    center.y - radius * 0.5,
    radius * 0.95,
  );
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radius * 1.02, radius, 0, 0, TAU);
  ctx.fillStyle = sheen;
  ctx.fill();

  // --- face ---
  const gaze = { x: clampRange(params.gazeX, 1), y: clampRange(params.gazeY, 1) };
  const spec = eyeShape(params.state, level);
  const mouthOpen =
    params.state === "listening" ? Math.min(1, level * 1.5) : render.poke > 0.18 ? 0.4 : 0;

  drawBlush(
    ctx,
    { x: center.x - radius * 0.66, y: center.y + radius * 0.18 },
    { x: center.x + radius * 0.66, y: center.y + radius * 0.18 },
    radius * 0.2,
    colors,
    pose.blush + (params.state === "listening" ? level * 0.15 : 0),
  );

  const pokeHappy = render.poke > 0.16;
  if (pokeHappy && spec.openness > 0.4) {
    drawEyeSmile(ctx, { x: center.x - radius * 0.4, y: center.y - radius * 0.16 }, radius * 0.22, colors);
    drawEyeSmile(ctx, { x: center.x + radius * 0.4, y: center.y - radius * 0.16 }, radius * 0.22, colors);
  } else {
    // Alertness suppresses the blink so an emergency never half-lids.
    const blink =
      idle || incident || params.state === "error" ? 0 : blinkEnvelope(t, 4.6, 2.6, 0.22);
    const blinkSpec: EyeSpec = {
      openness: spec.openness * (1 - blink),
      wide: spec.wide * (1 - blink * 0.7),
    };
    drawEye(
      ctx,
      { x: center.x - radius * 0.4, y: center.y - radius * 0.18 },
      radius * 0.28,
      blinkSpec,
      colors,
      gaze,
    );
    drawEye(
      ctx,
      { x: center.x + radius * 0.4, y: center.y - radius * 0.18 },
      radius * 0.28,
      blinkSpec,
      colors,
      gaze,
    );
  }

  drawMuzzle(
    ctx,
    { x: center.x, y: center.y + radius * 0.04 },
    { x: center.x, y: center.y + radius * 0.19 },
    (radius / 33) * 0.62,
    colors,
    mouthOpen,
  );

  ctx.restore();
}

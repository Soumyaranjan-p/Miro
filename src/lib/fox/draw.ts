/**
 * Miro's fox, drawn in code.
 *
 * Layers enter back-to-front (tail, fur, body, ears, face) so the silhouette
 * reads at 34px in a sidebar and at 120px on the home hero. Every frame is
 * computed from (t, state, level, gaze), with nothing to load: the same rules
 * the engine states map onto:
 *
 *   normal     → calm breathing, half-lidded eyes, tail sways slow
 *   incident   → ears back, tail tucked, ember ring, body tense
 *   listening  → ears forward, eyes open, mouth follows the mic level
 *   processing → eyes become a line, tail pauses mid-sway
 *   error      → same alert palette, wincing
 *   neutral    → static calm pose (no time-driven motion, instant first paint)
 *
 * State changes blend over ~0.45s and motion respects the OS reduced-motion
 * preference by damping amplitude.
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
  body: string;
  furTip: string;
  cream: string;
  innerEar: string;
  eye: string;
  eyeGlow: string;
  ink: string;
  tail: string;
}

const CALM: FoxColors = {
  body: "#F08A3C",
  furTip: "#FFB36B",
  cream: "#FBEEDB",
  innerEar: "#3A281B",
  eye: "#33241A",
  eyeGlow: "#FFE9D2",
  ink: "#2A1D12",
  tail: "#E07428",
};

const ALERT: FoxColors = {
  ...CALM,
  body: "#E8604A",
  furTip: "#FF9273",
  innerEar: "#4A1D14",
  tail: "#D14F34",
};

interface Pose {
  /** 0 = ears up, 1 = pinned back. */
  earBack: number;
  /** 0 = tail up and swaying, 1 = tucked down low. */
  tailTuck: number;
  /** Body tension widens the breathing. */
  tense: number;
}

function poseFor(state: FoxState): Pose {
  switch (state) {
    case "incident":
    case "error":
      return { earBack: 0.62, tailTuck: 1, tense: 1.55 };
    case "listening":
      return { earBack: -0.12, tailTuck: 0, tense: 0.7 };
    case "processing":
      return { earBack: 0.1, tailTuck: 0.1, tense: 0.85 };
    case "neutral":
      return { earBack: 0, tailTuck: 0, tense: 1 };
    case "normal":
    default:
      return { earBack: 0, tailTuck: 0, tense: 1 };
  }
}

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

// ---------------------------------------------------------------------------
// Fur
// ---------------------------------------------------------------------------

/** One strand: a short quadratic stroke pointing outward from the rim. */
function furStrand(
  ctx: CanvasRenderingContext2D,
  origin: Vec,
  angle: number,
  length: number,
  color: string,
  lineWidth: number,
): void {
  const midX = origin.x + Math.cos(angle) * length * 0.5 + Math.cos(angle + Math.PI / 2) * length * 0.14;
  const midY = origin.y + Math.sin(angle) * length * 0.5 + Math.sin(angle + Math.PI / 2) * length * 0.14;
  const tipX = origin.x + Math.cos(angle) * length;
  const tipY = origin.y + Math.sin(angle) * length;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.quadraticCurveTo(midX, midY, tipX, tipY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();
}

/**
 * Fur collar: strands radiating around the head rim at deterministic angles,
 * with only a gentle rustle so the silhouette never shimmers.
 */
function drawFur(
  ctx: CanvasRenderingContext2D,
  options: {
    center: Vec;
    radius: number;
    /** Steady silhouette seed; changes only when the pose changes. */
    seed: number;
    rustlePhase: number;
    rustle: number;
    colors: FoxColors;
  },
): void {
  const { center, radius, rustle, colors, seed } = options;
  const strands = 26;
  // Cheap deterministic hash per strand: same silhouette every frame.
  const hash = (i: number) => (((Math.abs(i) * 7919) % 100) + seed * 37) % 100 / 100;
  for (let i = 0; i < strands; i += 1) {
    const angle = Math.PI * 0.86 + (i / (strands - 1)) * Math.PI * 1.28;
    const wobble = rustle * (i % 2 === 0 ? 1 : -1) * 0.05 * wave(options.rustlePhase, 2.2);
    const a = angle + wobble;
    const length = radius * (0.22 + hash(Math.floor(angle * 53)) * 0.16);
    furStrand(
      ctx,
      {
        x: center.x + Math.cos(a) * radius * 0.93,
        y: center.y + Math.sin(a) * radius * 0.93,
      },
      a,
      length,
      hash(Math.floor(angle * 91)) > 0.66 ? colors.furTip : colors.tail,
      Math.max(1.5, radius * 0.05),
    );
  }
}

// ---------------------------------------------------------------------------
// Ears
// ---------------------------------------------------------------------------

function drawEar(
  ctx: CanvasRenderingContext2D,
  options: { base: Vec; tip: Vec; tilt: Vec; colors: FoxColors; width: number },
): void {
  const { base, tip, tilt, colors, width } = options;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.quadraticCurveTo(base.x + tilt.x, base.y + tilt.y, tip.x, tip.y);
  ctx.quadraticCurveTo(tip.x + tilt.x * 1.15, tip.y + tilt.y * 1.15, base.x + width, base.y + width * 0.3);
  ctx.closePath();
  ctx.fillStyle = colors.body;
  ctx.fill();

  // The dark inner wedge reads "fox ear" at any size.
  ctx.beginPath();
  ctx.moveTo(base.x + width * 0.44, base.y + width * 0.3);
  ctx.lineTo(base.x + width * 0.62, base.y + width * 0.3);
  ctx.quadraticCurveTo(
    tip.x + tilt.x * 0.55 + (tip.x - base.x) * 0.12,
    tip.y + tilt.y * 0.55,
    base.x + width * 0.56,
    base.y + width * 0.78,
  );
  ctx.closePath();
  ctx.fillStyle = colors.innerEar;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

interface EyeSpec {
  /** 0 closed → 1 wide open. */
  openness: number;
  /** 0 = soft half-lid → 1 = startled round eye. */
  wide: number;
}

function eyeShape(state: FoxState, t: number, level: number): EyeSpec {
  switch (state) {
    case "listening":
      return { openness: 1, wide: 0.12 + level * 0.28 };
    case "incident":
    case "error":
      return { openness: 1, wide: 0.44 };
    case "processing":
      return { openness: 0.12, wide: 0 };
    case "neutral":
      return { openness: 0.5, wide: 0 };
    case "normal":
    default:
      // Half-lidded with a slow, calm flutter.
      return { openness: 0.32 + 0.06 * wave(t, 6.4), wide: 0 };
  }
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  radius: number,
  spec: EyeSpec,
  colors: FoxColors,
  gaze: Vec,
): void {
  if (spec.openness <= 0.2) {
    // Closed or scanning: a soft arc.
    ctx.beginPath();
    ctx.moveTo(center.x - radius, center.y);
    ctx.quadraticCurveTo(center.x, center.y - radius * 0.6, center.x + radius, center.y);
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = radius * 0.34;
    ctx.lineCap = "round";
    ctx.stroke();
    return;
  }

  const height = radius * (0.34 + spec.wide * 1.5) * spec.openness;
  const width = radius * (1.02 + spec.wide * 0.2);
  const at = { x: center.x + gaze.x * radius * 0.26, y: center.y + gaze.y * radius * 0.2 };

  if (spec.wide > 0.3) {
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius * 0.62, 0, TAU);
    ctx.fillStyle = colors.eyeGlow;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.ellipse(at.x, at.y, width, Math.max(height, width * 0.16), 0, 0, TAU);
  ctx.fillStyle = colors.eye;
  ctx.fill();

  // One highlight keeps the eye wet even at very small sizes.
  ctx.beginPath();
  ctx.arc(at.x - width * 0.28, at.y - height * 0.34, Math.max(0.7, radius * 0.13), 0, TAU);
  ctx.fillStyle = colors.eyeGlow;
  ctx.fill();
}

function drawMuzzle(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  radius: number,
  colors: FoxColors,
  mouthOpen: number,
): void {
  ctx.beginPath();
  ctx.moveTo(center.x, center.y + radius * 0.06);
  ctx.quadraticCurveTo(
    center.x - radius * 1.06,
    center.y + radius * 0.36,
    center.x - radius * 0.78,
    center.y + radius * 0.86,
  );
  ctx.quadraticCurveTo(
    center.x,
    center.y + radius * 1.24,
    center.x + radius * 0.78,
    center.y + radius * 0.86,
  );
  ctx.quadraticCurveTo(
    center.x + radius * 1.06,
    center.y + radius * 0.36,
    center.x,
    center.y + radius * 0.06,
  );
  ctx.fillStyle = colors.cream;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(center.x, center.y + radius * 0.42, radius * 0.11, radius * 0.08, 0, 0, TAU);
  ctx.fillStyle = colors.ink;
  ctx.fill();

  // A small smile usually; an open oval while a phrase is being heard.
  if (mouthOpen > 0.05) {
    ctx.beginPath();
    ctx.ellipse(
      center.x,
      center.y + radius * 0.62,
      radius * 0.1,
      radius * 0.085 * (0.6 + mouthOpen),
      0,
      0,
      TAU,
    );
    ctx.fillStyle = colors.ink;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(center.x - radius * 0.16, center.y + radius * 0.66);
    ctx.quadraticCurveTo(center.x, center.y + radius * 0.78, center.x + radius * 0.16, center.y + radius * 0.66);
    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(1.2, radius * 0.05);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Tail
// ---------------------------------------------------------------------------

function drawTail(
  ctx: CanvasRenderingContext2D,
  options: { root: Vec; radius: number; colors: FoxColors; tuck: number; sway: number; phase: number },
): void {
  const { root, radius, colors, tuck, sway, phase } = options;
  const points = 9;
  const length = radius * 2.35;
  const curl = radius * (0.55 - tuck * 0.3);
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  for (let i = 1; i <= points; i += 1) {
    const f = i / points;
    const angle = -Math.PI + phase + f * curl * (0.5 - tuck * 0.25);
    const x = root.x + Math.cos(angle) * length * f * 0.42 - f * length * (0.5 + sway * 0.3);
    const y = root.y + Math.sin(angle) * length * f * 0.24 + f * radius * 0.42 * (1 - tuck) + f * f * radius * 0.6;
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colors.tail;
  ctx.lineWidth = radius * 0.42 * (1 - tuck * 0.25);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Warm cream tip.
  const tipAngle = -Math.PI + phase + 1 * curl * (0.5 - tuck * 0.25);
  const tipX = root.x + Math.cos(tipAngle) * length * 0.42 - length * (0.5 + sway * 0.3);
  const tipY =
    root.y + Math.sin(tipAngle) * length * 0.24 + radius * 0.42 * (1 - tuck) + radius * 0.6;
  ctx.beginPath();
  ctx.arc(tipX, tipY, radius * 0.17, 0, TAU);
  ctx.fillStyle = colors.cream;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Top-level renderer
// ---------------------------------------------------------------------------

const TRANSITION_SECONDS = 0.45;

/** Mutable bookkeeping kept by the owning canvas. */
export interface FoxRenderState {
  state: FoxState;
  /** How far through a blend into `state` we are, 0..1. */
  blend: number;
  /** Previous frame's clock, for frame-rate independent blending. */
  lastT: number;
}

export function createFoxRenderer(): FoxRenderState {
  return { state: "normal", blend: 1, lastT: -1 };
}

function mixPose(from: Pose, to: Pose, f: number): Pose {
  return {
    earBack: from.earBack + (to.earBack - from.earBack) * f,
    tailTuck: from.tailTuck + (to.tailTuck - from.tailTuck) * f,
    tense: from.tense + (to.tense - from.tense) * f,
  };
}

/** Draws one frame. `render` is the per-canvas state object from the factory. */
export function drawFox(ctx: CanvasRenderingContext2D, params: FoxParams, render: FoxRenderState): void {
  const { t, reducedMotion: motion, level } = params;

  // Track the blend window: 0 → "just changed", 1 → settled. The step size
  // comes from real frame time so 144 Hz displays do not blend too fast.
  if (render.state !== params.state) {
    render.state = params.state;
    render.blend = 0;
  }
  const dt = render.lastT < 0 ? 1 / 60 : Math.max(0, t - render.lastT);
  render.lastT = t;
  render.blend = Math.min(1, render.blend + dt / TRANSITION_SECONDS);
  const prevPose = poseFor("normal");
  const pose = mixPose(prevPose, poseFor(params.state), render.blend);

  const colors = params.state === "incident" || params.state === "error" ? ALERT : CALM;
  const incident = colors === ALERT;
  const center = { x: 64, y: 66 };
  const radius = 42;

  ctx.clearRect(0, 0, params.width, params.height);
  ctx.save();
  ctx.scale(params.width / 128, params.height / 128);

  // --- tail (behind everything) ---
  const scanning = params.state === "processing";
  const tailPhase = scanning ? -Math.PI / 2 : (t / 2.9) * TAU * 0.5 + Math.PI;
  const tailSway =
    damp(motion, params.state === "incident" ? 0.05 : 0.22) * wave(t, params.state === "incident" ? 9 : scanning ? 6 : 3.4);
  drawTail(ctx, {
    root: { x: center.x + radius * 0.16, y: center.y - radius * 1.18 },
    radius,
    colors,
    tuck: pose.tailTuck,
    sway: tailSway,
    phase: tailPhase,
  });

  // --- body: one ellipse, breathing ---
  const breathe =
    motion
      ? 1
      : 1 +
        0.02 * wave(t, 3.6) * pose.tense +
        (params.state === "listening" ? level * 0.05 : 0);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(breathe, 1 / breathe);
  ctx.translate(-center.x, -center.y);
  ctx.beginPath();
  ctx.ellipse(center.x, center.y - radius * 0.06, radius * 1.02, radius * 0.94, 0, 0, TAU);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.restore();

  // --- fur collar ---
  const furRustle =
    damp(motion, 1) * (params.state === "listening" ? 1 + level * 0.9 : params.state === "incident" ? 2 : 0.7);
  drawFur(ctx, {
    center,
    radius: radius * 0.98,
    rustlePhase: t,
    rustle: furRustle,
    seed: pose.tailTuck * 10 + pose.earBack * 7 + pose.tense * 3,
    colors,
  });

  // --- ears ---
  const earWobble = motion ? 0 : wave(t, 5.2) * 0.03 * (1 + level * 0.5);
  const earBackAmount = pose.earBack;
  drawEar(ctx, {
    base: { x: center.x - radius * 0.62, y: center.y - radius * 0.62 },
    tip: {
      x: center.x - radius * (0.9 - earBackAmount * 0.42),
      y: center.y - radius * (1.5 + earBackAmount * 0.4 - earWobble),
    },
    tilt: { x: -radius * (0.34 - earBackAmount * 0.24), y: radius * 0.05 },
    colors,
    width: radius * 0.46,
  });
  drawEar(ctx, {
    base: { x: center.x + radius * 0.62, y: center.y - radius * 0.62 },
    tip: {
      x: center.x + radius * (0.9 - earBackAmount * 0.42),
      y: center.y - radius * (1.5 + earBackAmount * 0.4 + earWobble),
    },
    tilt: { x: radius * (0.34 - earBackAmount * 0.24), y: radius * 0.05 },
    colors,
    width: radius * 0.46,
  });

  // --- face ---
  const gaze = { x: clampRange(params.gazeX, 1), y: clampRange(params.gazeY, 1) };
  const spec = eyeShape(params.state, t, level);
  const mouth = params.state === "listening" ? Math.min(1, level * 1.4) : 0;
  drawMuzzle(ctx, { x: center.x, y: center.y + radius * 0.1 }, radius * 0.62, colors, mouth);
  drawEye(ctx, { x: center.x - radius * 0.36, y: center.y - radius * 0.02 }, radius * 0.24, spec, colors, gaze);
  drawEye(ctx, { x: center.x + radius * 0.36, y: center.y - radius * 0.02 }, radius * 0.24, spec, colors, gaze);

  // Incident mode: a soft ember ring so the state is obvious from across the
  // room even where the icon is small.
  if (incident) {
    ctx.beginPath();
    ctx.ellipse(center.x, center.y - radius * 0.06, radius * 1.1, radius * 1.02, 0, 0, TAU);
    ctx.strokeStyle = "rgba(229, 72, 77, 0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.restore();
}

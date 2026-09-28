import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");

type EntryType = "registry:icon" | "registry:component" | "registry:block" | "registry:lib";

interface PropMeta {
  name: string;
  type: string;
  default?: string;
  description: string;
}

interface ControlMeta {
  key: string;
  label: string;
  type: "slider" | "select" | "color" | "toggle";
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  default: string | number | boolean;
}

interface FileMeta {
  source: string;
  target: string;
  type: EntryType;
}

interface EntryMeta {
  name: string;
  type: EntryType;
  title: string;
  description: string;
  categories: string[];
  files: FileMeta[];
  dependencies?: string[];
  registryDependencies?: string[];
  props?: PropMeta[];
  accessibility?: string;
  touch?: string;
  reducedMotion?: string;
  playground?: ControlMeta[];
}

const MIRRO_LIBS: EntryMeta[] = [
  {
    name: "cn",
    type: "registry:lib",
    title: "cn",
    description: "A tiny className joiner used across Mirro components.",
    categories: ["lib"],
    files: [{ source: "src/components/mirro/lib/cn.ts", target: "components/mirro/lib/cn.ts", type: "registry:lib" }],
  },
  {
    name: "use-hover-capable",
    type: "registry:lib",
    title: "useHoverCapable",
    description: "Detects whether the device supports hover, gating pointer-following effects.",
    categories: ["lib", "hooks"],
    files: [
      { source: "src/components/mirro/lib/use-hover-capable.ts", target: "components/mirro/lib/use-hover-capable.ts", type: "registry:lib" },
    ],
    dependencies: ["motion"],
  },
  {
    name: "use-magnetic",
    type: "registry:lib",
    title: "useMagnetic",
    description: "Spring-smoothed pointer tracking for magnetic interactions.",
    categories: ["lib", "hooks"],
    files: [
      { source: "src/components/mirro/lib/use-magnetic.ts", target: "components/mirro/lib/use-magnetic.ts", type: "registry:lib" },
    ],
    dependencies: ["motion"],
  },
];

const entries: EntryMeta[] = [
  {
    name: "heart",
    type: "registry:icon",
    title: "Heart",
    description: "A heart icon with hover scale, a click heartbeat, and an animated fill transition.",
    categories: ["icons", "feedback"],
    files: [
      { source: "src/components/mirro/icons/heart.tsx", target: "components/mirro/icons/heart.tsx", type: "registry:icon" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height of the icon in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color of the heart outline." },
      { name: "fillColor", type: "string", default: '"var(--accent)"', description: "Fill color used when the heart is liked." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width of the heart outline." },
      { name: "filled", type: "boolean", description: "Controlled liked state. When omitted the icon manages its own state." },
      { name: "defaultFilled", type: "boolean", default: "false", description: "Initial liked state when uncontrolled." },
      { name: "onToggle", type: "(filled: boolean) => void", description: "Called with the next liked state whenever the icon is toggled." },
      { name: "label", type: "string", default: '"Like"', description: "Accessible label for the toggle button." },
    ],
    accessibility:
      "Renders as a button with role=\"button\", aria-pressed reflecting the liked state, and an accessible label. Toggles on Enter and Space.",
    touch:
      "Hover scale is gated behind a (hover: hover) and (pointer: fine) check, so it never fires on tap. Tapping toggles the fill directly with a spring press feedback.",
    reducedMotion:
      "The heartbeat keyframe is skipped; the fill still transitions with a short 150ms ease-out so state change remains perceivable.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
      { key: "fillColor", label: "Fill color", type: "color", default: "#ff4d29" },
    ],
  },
  {
    name: "menu",
    type: "registry:icon",
    title: "Menu",
    description: "A hamburger icon that smoothly morphs into an X, with the middle line collapsing.",
    categories: ["icons", "navigation"],
    files: [
      { source: "src/components/mirro/icons/menu.tsx", target: "components/mirro/icons/menu.tsx", type: "registry:icon" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height of the icon in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color of the lines." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width of the lines." },
      { name: "open", type: "boolean", description: "Controlled open state. When omitted the icon manages its own state." },
      { name: "defaultOpen", type: "boolean", default: "false", description: "Initial open state when uncontrolled." },
      { name: "onToggle", type: "(open: boolean) => void", description: "Called with the next open state whenever the icon is toggled." },
      { name: "label", type: "string", default: '"Menu"', description: "Accessible label for the toggle button." },
    ],
    accessibility:
      "Renders as a button with role=\"button\", aria-expanded reflecting the open state, and an accessible label. Toggles on Enter and Space.",
    touch:
      "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the morph directly with spring press feedback.",
    reducedMotion:
      "The morph duration drops to 150ms so the state change stays perceivable without the full animation.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "copy",
    type: "registry:icon",
    title: "Copy",
    description: "A clipboard icon that draws a check when copied, then resets.",
    categories: ["icons", "feedback"],
    files: [
      { source: "src/components/mirro/icons/copy.tsx", target: "components/mirro/icons/copy.tsx", type: "registry:icon" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height of the icon in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color of the clipboard." },
      { name: "checkColor", type: "string", default: '"var(--accent)"', description: "Stroke color of the check." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "copied", type: "boolean", description: "Controlled copied state. When omitted the icon manages its own state." },
      { name: "defaultCopied", type: "boolean", default: "false", description: "Initial copied state when uncontrolled." },
      { name: "onCopy", type: "(copied: boolean) => void", description: "Called with the copied state on change." },
      { name: "resetDelay", type: "number", default: "1600", description: "Milliseconds before an uncontrolled icon resets to the idle state." },
      { name: "label", type: "string", default: '"Copy"', description: "Accessible label." },
    ],
    accessibility:
      "Renders as a button with an accessible label that updates to \"Copied\" when the check is shown. Uses aria-live so the state change is announced.",
    touch:
      "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping triggers the copy-to-check transition directly.",
    reducedMotion:
      "The check draw is skipped; the check and clipboard crossfade with a short 150ms transition so the state change remains clear.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Clipboard color", type: "color", default: "currentColor" },
      { key: "checkColor", label: "Check color", type: "color", default: "#ff4d29" },
    ],
  },
  {
    name: "check",
    type: "registry:icon",
    title: "Check",
    description: "A success badge that draws its circle and checkmark with a satisfying stroke animation.",
    categories: ["icons", "feedback"],
    files: [
      { source: "src/components/mirro/icons/check.tsx", target: "components/mirro/icons/check.tsx", type: "registry:icon" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height of the icon in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color of the badge." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "active", type: "boolean", description: "Controlled drawn state. When omitted the icon manages its own state." },
      { name: "defaultActive", type: "boolean", default: "true", description: "Initial drawn state when uncontrolled." },
      { name: "onToggle", type: "(active: boolean) => void", description: "Called when the badge is replayed." },
      { name: "label", type: "string", default: '"Check"', description: "Accessible label." },
    ],
    accessibility:
      "Renders as a button with an accessible label. Clicking replays the draw animation, which is decorative and conveys no essential information.",
    touch:
      "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping replays the draw directly.",
    reducedMotion:
      "The draw is skipped; the badge fades in with a short 150ms opacity transition.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "sun-moon",
    type: "registry:icon",
    title: "Sun / Moon",
    description: "A theme toggle that rotates and crossfades between a sun and a moon.",
    categories: ["icons", "navigation"],
    files: [
      { source: "src/components/mirro/icons/sun-moon.tsx", target: "components/mirro/icons/sun-moon.tsx", type: "registry:icon" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height of the icon in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "moon", type: "boolean", description: "Controlled moon state. When omitted the icon manages its own state." },
      { name: "defaultMoon", type: "boolean", default: "false", description: "Initial moon state when uncontrolled." },
      { name: "onToggle", type: "(moon: boolean) => void", description: "Called with the next moon state whenever the icon is toggled." },
      { name: "label", type: "string", default: '"Toggle theme"', description: "Accessible label." },
    ],
    accessibility:
      "Renders as a button with role=\"button\", aria-pressed reflecting the moon state, and an accessible label. Toggles on Enter and Space.",
    touch:
      "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the sun/moon crossfade directly.",
    reducedMotion:
      "The rotation is dropped; the sun and moon crossfade with a short 150ms opacity transition.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "search",
    type: "registry:icon",
    title: "Search",
    description: "A magnifying glass that sweeps a scan line across the lens when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/search.tsx", target: "components/mirro/icons/search.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "scanning", type: "boolean", description: "Controlled scanning state." },
      { name: "defaultScanning", type: "boolean", default: "false", description: "Initial scanning state when uncontrolled." },
      { name: "onScan", type: "(scanning: boolean) => void", description: "Called with the scanning state on change." },
      { name: "label", type: "string", default: '"Search"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the scanning state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the scan.",
    reducedMotion: "The scan sweep is skipped; the scan line toggles with a short opacity transition.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "bell",
    type: "registry:icon",
    title: "Bell",
    description: "A notification bell that shakes and pops a dot when activated.",
    categories: ["icons", "feedback"],
    files: [{ source: "src/components/mirro/icons/bell.tsx", target: "components/mirro/icons/bell.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "ringing", type: "boolean", description: "Controlled ringing state." },
      { name: "defaultRinging", type: "boolean", default: "false", description: "Initial ringing state when uncontrolled." },
      { name: "onRing", type: "(ringing: boolean) => void", description: "Called with the ringing state on change." },
      { name: "label", type: "string", default: '"Notifications"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the ringing state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the shake.",
    reducedMotion: "The shake is skipped; the dot toggles with a short opacity transition.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "arrow",
    type: "registry:icon",
    title: "Arrow",
    description: "An arrow that slides in its direction on hover.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/arrow.tsx", target: "components/mirro/icons/arrow.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "direction", type: '"up" | "right" | "down" | "left"', default: '"right"', description: "Arrow orientation." },
      { name: "label", type: "string", default: '"Arrow"', description: "Accessible label." },
    ],
    accessibility: "Renders as an image with an accessible label. Decorative unless given a meaningful label.",
    touch: "Directional slide is gated behind a (hover: hover) and (pointer: fine) check.",
    reducedMotion: "The directional slide is dropped.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
      { key: "direction", label: "Direction", type: "select", options: [{ label: "Right", value: "right" }, { label: "Up", value: "up" }, { label: "Down", value: "down" }, { label: "Left", value: "left" }], default: "right" },
    ],
  },
  {
    name: "download",
    type: "registry:icon",
    title: "Download",
    description: "A download icon whose arrow dips into the tray when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/download.tsx", target: "components/mirro/icons/download.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "downloaded", type: "boolean", description: "Controlled downloaded state." },
      { name: "defaultDownloaded", type: "boolean", default: "false", description: "Initial downloaded state when uncontrolled." },
      { name: "onDownload", type: "(downloaded: boolean) => void", description: "Called with the downloaded state on change." },
      { name: "label", type: "string", default: '"Download"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the downloaded state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the dip.",
    reducedMotion: "The dip is skipped; a short opacity transition indicates the state.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "plus",
    type: "registry:icon",
    title: "Plus",
    description: "A plus icon that rotates into an X when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/plus.tsx", target: "components/mirro/icons/plus.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "open", type: "boolean", description: "Controlled open state." },
      { name: "defaultOpen", type: "boolean", default: "false", description: "Initial open state when uncontrolled." },
      { name: "onToggle", type: "(open: boolean) => void", description: "Called with the open state on change." },
      { name: "label", type: "string", default: '"Add"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the open state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the morph.",
    reducedMotion: "The morph is instant under reduced motion.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "x",
    type: "registry:icon",
    title: "X",
    description: "A close icon that draws itself with a stroke animation.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/x.tsx", target: "components/mirro/icons/x.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "active", type: "boolean", description: "Controlled drawn state." },
      { name: "defaultActive", type: "boolean", default: "true", description: "Initial drawn state when uncontrolled." },
      { name: "onToggle", type: "(active: boolean) => void", description: "Called with the drawn state on change." },
      { name: "label", type: "string", default: '"Close"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the drawn state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping replays the draw.",
    reducedMotion: "The draw is skipped; the X fades with a short opacity transition.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "eye",
    type: "registry:icon",
    title: "Eye",
    description: "An eye icon that draws a slash and hides the pupil when toggled off.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/eye.tsx", target: "components/mirro/icons/eye.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "visible", type: "boolean", description: "Controlled visibility state." },
      { name: "defaultVisible", type: "boolean", default: "true", description: "Initial visibility when uncontrolled." },
      { name: "onToggle", type: "(visible: boolean) => void", description: "Called with the visibility state on change." },
      { name: "label", type: "string", default: '"Toggle visibility"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the visibility state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles.",
    reducedMotion: "The slash draw is skipped; opacity indicates the state.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "star",
    type: "registry:icon",
    title: "Star",
    description: "A star that fills and pops when activated.",
    categories: ["icons", "feedback"],
    files: [{ source: "src/components/mirro/icons/star.tsx", target: "components/mirro/icons/star.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "fillColor", type: "string", default: '"var(--accent)"', description: "Fill color when starred." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "filled", type: "boolean", description: "Controlled filled state." },
      { name: "defaultFilled", type: "boolean", default: "false", description: "Initial filled state when uncontrolled." },
      { name: "onToggle", type: "(filled: boolean) => void", description: "Called with the filled state on change." },
      { name: "label", type: "string", default: '"Star"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the filled state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the fill.",
    reducedMotion: "The pop is skipped; the fill transitions with a short ease-out.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
      { key: "fillColor", label: "Fill color", type: "color", default: "#ff4d29" },
    ],
  },
  {
    name: "send",
    type: "registry:icon",
    title: "Send",
    description: "A paper plane that lifts off when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/send.tsx", target: "components/mirro/icons/send.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "sent", type: "boolean", description: "Controlled sent state." },
      { name: "defaultSent", type: "boolean", default: "false", description: "Initial sent state when uncontrolled." },
      { name: "onSend", type: "(sent: boolean) => void", description: "Called with the sent state on change." },
      { name: "label", type: "string", default: '"Send"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the sent state. Toggles on Enter and Space.",
    touch: "Hover lift is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the launch.",
    reducedMotion: "The launch is skipped; a short opacity transition indicates the state.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "trash",
    type: "registry:icon",
    title: "Trash",
    description: "A trash can whose lid opens when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/trash.tsx", target: "components/mirro/icons/trash.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "deleted", type: "boolean", description: "Controlled deleted state." },
      { name: "defaultDeleted", type: "boolean", default: "false", description: "Initial deleted state when uncontrolled." },
      { name: "onDelete", type: "(deleted: boolean) => void", description: "Called with the deleted state on change." },
      { name: "label", type: "string", default: '"Delete"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the deleted state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the lid.",
    reducedMotion: "The lid rotation is skipped; opacity indicates the state.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "refresh",
    type: "registry:icon",
    title: "Refresh",
    description: "A refresh icon that spins when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/refresh.tsx", target: "components/mirro/icons/refresh.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "spinning", type: "boolean", description: "Controlled spinning state." },
      { name: "defaultSpinning", type: "boolean", default: "false", description: "Initial spinning state when uncontrolled." },
      { name: "onSpin", type: "(spinning: boolean) => void", description: "Called with the spinning state on change." },
      { name: "label", type: "string", default: '"Refresh"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the spinning state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the spin.",
    reducedMotion: "The spin is skipped; a short opacity pulse indicates the state.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "play",
    type: "registry:icon",
    title: "Play",
    description: "A play icon that morphs into a pause icon when activated.",
    categories: ["icons", "media"],
    files: [{ source: "src/components/mirro/icons/play.tsx", target: "components/mirro/icons/play.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "playing", type: "boolean", description: "Controlled playing state." },
      { name: "defaultPlaying", type: "boolean", default: "false", description: "Initial playing state when uncontrolled." },
      { name: "onTogglePlay", type: "(playing: boolean) => void", description: "Called with the playing state on change." },
      { name: "label", type: "string", default: '"Play"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the playing state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the morph.",
    reducedMotion: "The morph is instant under reduced motion.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
    ],
  },
  {
    name: "bookmark",
    type: "registry:icon",
    title: "Bookmark",
    description: "A bookmark icon whose fill drops downward into the shape when activated.",
    categories: ["icons", "interface"],
    files: [{ source: "src/components/mirro/icons/bookmark.tsx", target: "components/mirro/icons/bookmark.tsx", type: "registry:icon" }],
    dependencies: ["motion"],
    registryDependencies: ["cn", "use-hover-capable"],
    props: [
      { name: "size", type: "number", default: "24", description: "Width and height in pixels." },
      { name: "color", type: "string", default: '"currentColor"', description: "Stroke color." },
      { name: "fillColor", type: "string", default: '"var(--accent)"', description: "Fill color when bookmarked." },
      { name: "strokeWidth", type: "number", default: "1.5", description: "Stroke width." },
      { name: "filled", type: "boolean", description: "Controlled filled state." },
      { name: "defaultFilled", type: "boolean", default: "false", description: "Initial filled state when uncontrolled." },
      { name: "onToggle", type: "(filled: boolean) => void", description: "Called with the filled state on change." },
      { name: "label", type: "string", default: '"Bookmark"', description: "Accessible label." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the filled state. Toggles on Enter and Space.",
    touch: "Hover scale is gated behind a (hover: hover) and (pointer: fine) check. Tapping toggles the fill.",
    reducedMotion: "The dropping fill is skipped; the fill toggles instantly.",
    playground: [
      { key: "size", label: "Size", type: "slider", min: 16, max: 64, step: 1, default: 24 },
      { key: "strokeWidth", label: "Stroke width", type: "slider", min: 1, max: 3, step: 0.25, default: 1.5 },
      { key: "color", label: "Stroke color", type: "color", default: "currentColor" },
      { key: "fillColor", label: "Fill color", type: "color", default: "#ff4d29" },
    ],
  },
  {
    name: "magnetic-button",
    type: "registry:component",
    title: "Magnetic Button",
    description: "A button that follows the cursor with spring physics and snaps back on leave.",
    categories: ["buttons", "interactive"],
    files: [
      { source: "src/components/mirro/components/magnetic-button.tsx", target: "components/mirro/components/magnetic-button.tsx", type: "registry:component" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["use-magnetic", "use-hover-capable", "cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Button content." },
      { name: "strength", type: "number", default: "0.35", description: "How strongly the button follows the cursor, 0 to 1." },
      { name: "variant", type: '"primary" | "outline"', default: '"primary"', description: "Visual variant." },
      { name: "className", type: "string", description: "Additional classes for the button." },
      { name: "onClick", type: "() => void", description: "Click handler." },
      { name: "href", type: "string", description: "When provided, renders as a link instead of a button." },
    ],
    accessibility:
      "The underlying element is a real button (or link when href is set), so it is keyboard focusable and activates on Enter and Space. The magnetic wrapper is purely decorative and exposes no extra semantics.",
    touch:
      "Pointer-following is disabled on touch devices via a (hover: hover) and (pointer: fine) check. Tapping the button still gives spring press feedback, so the interaction translates naturally.",
    reducedMotion:
      "The magnetic follow is disabled; the button keeps its press feedback and hover lift so state changes remain visible.",
    playground: [
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 1, step: 0.05, default: 0.35 },
      { key: "variant", label: "Variant", type: "select", options: [{ label: "Primary", value: "primary" }, { label: "Outline", value: "outline" }], default: "primary" },
    ],
  },
  {
    name: "spotlight-card",
    type: "registry:component",
    title: "Spotlight Card",
    description: "A card with a soft radial glow that tracks the cursor.",
    categories: ["cards", "interactive"],
    files: [
      { source: "src/components/mirro/components/spotlight-card.tsx", target: "components/mirro/components/spotlight-card.tsx", type: "registry:component" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["use-hover-capable", "cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Card content." },
      { name: "className", type: "string", description: "Additional classes for the card." },
      { name: "spotlightColor", type: "string", default: '"255, 77, 41"', description: "RGB triplet for the glow, e.g. \"255, 77, 41\"." },
    ],
    accessibility:
      "The spotlight is an aria-hidden decorative layer. Card content keeps its own semantics and remains fully readable with the glow disabled.",
    touch:
      "Pointer-following is disabled on touch devices via a (hover: hover) and (pointer: fine) check. The card content is fully usable without the glow.",
    reducedMotion:
      "The glow follows the cursor but fades in and out with a short 150ms transition instead of spring smoothing.",
    playground: [
      { key: "spotlightColor", label: "Glow color", type: "color", default: "#ff4d29" },
    ],
  },
  {
    name: "text-reveal",
    type: "registry:component",
    title: "Text Reveal",
    description: "Reveals text with a blur, fade, and slide when it scrolls into view.",
    categories: ["text", "scroll"],
    files: [
      { source: "src/components/mirro/components/text-reveal.tsx", target: "components/mirro/components/text-reveal.tsx", type: "registry:component" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Text to reveal." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "delay", type: "number", default: "0", description: "Delay in seconds before the reveal starts." },
      { name: "as", type: '"span" | "div" | "h1" | "h2" | "h3" | "p"', default: '"span"', description: "Element to render." },
    ],
    accessibility:
      "The reveal is decorative; the text is present in the DOM and readable by screen readers regardless of animation state.",
    touch:
      "No pointer-following. The reveal triggers on scroll into view, which works identically on touch.",
    reducedMotion:
      "Blur and slide are dropped; the text fades in with a short opacity transition.",
    playground: [
      { key: "delay", label: "Delay", type: "slider", min: 0, max: 0.5, step: 0.05, default: 0 },
    ],
  },
  {
    name: "animated-tabs",
    type: "registry:component",
    title: "Animated Tabs",
    description: "Tabs with a spring-animated indicator that slides between items.",
    categories: ["interactive", "navigation"],
    files: [
      { source: "src/components/mirro/components/animated-tabs.tsx", target: "components/mirro/components/animated-tabs.tsx", type: "registry:component" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "tabs", type: "{ label: string; value: string }[]", description: "Tab items." },
      { name: "defaultValue", type: "string", description: "Initial active tab when uncontrolled." },
      { name: "value", type: "string", description: "Controlled active tab." },
      { name: "onChange", type: "(value: string) => void", description: "Called with the active tab value on change." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility:
      "Implements the tabs pattern with role=\"tablist\"/\"tab\", aria-selected, and a roving tabindex. Arrow keys, Home, and End move between tabs.",
    touch:
      "No pointer-following. Tapping a tab activates it and slides the indicator.",
    reducedMotion:
      "The indicator snaps instantly instead of springing.",
  },
  {
    name: "animated-accordion",
    type: "registry:component",
    title: "Animated Accordion",
    description: "An accordion with smooth height animation and a rotating chevron.",
    categories: ["interactive", "navigation"],
    files: [
      { source: "src/components/mirro/components/animated-accordion.tsx", target: "components/mirro/components/animated-accordion.tsx", type: "registry:component" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "items", type: "{ title: string; content: ReactNode }[]", description: "Accordion items." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "defaultOpen", type: "number | null", default: "0", description: "Index of the initially open item." },
    ],
    accessibility:
      "Each header is a button with aria-expanded and aria-controls; panels use role=\"region\" and aria-labelledby. Native button behavior gives Enter and Space support.",
    touch:
      "No pointer-following. Tapping a header toggles its panel.",
    reducedMotion:
      "The height animation shortens to 120ms and the chevron rotation is kept brief.",
  },
  {
    name: "shimmer-button",
    type: "registry:component",
    title: "Shimmer Button",
    description: "A button with a gradient shimmer that sweeps across on hover.",
    categories: ["buttons"],
    files: [{ source: "src/components/mirro/components/shimmer-button.tsx", target: "components/mirro/components/shimmer-button.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Button content." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "onClick", type: "() => void", description: "Click handler." },
    ],
    accessibility: "A real button, keyboard focusable and activatable on Enter and Space. The shimmer is decorative.",
    touch: "The shimmer sweep is disabled on touch; press feedback remains.",
    reducedMotion: "The shimmer sweep is disabled; press feedback remains.",
  },
  {
    name: "ripple-button",
    type: "registry:component",
    title: "Ripple Button",
    description: "A button that emits a ripple from the exact click point.",
    categories: ["buttons"],
    files: [{ source: "src/components/mirro/components/ripple-button.tsx", target: "components/mirro/components/ripple-button.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Button content." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "onClick", type: "() => void", description: "Click handler." },
    ],
    accessibility: "A real button, keyboard focusable and activatable on Enter and Space. The ripple is decorative.",
    touch: "The ripple originates from the tap point on touch devices.",
    reducedMotion: "The ripple is disabled; press feedback remains.",
  },
  {
    name: "border-beam-button",
    type: "registry:component",
    title: "Border Beam Button",
    description: "A button with a rotating gradient beam traveling around its border.",
    categories: ["buttons"],
    files: [{ source: "src/components/mirro/components/border-beam-button.tsx", target: "components/mirro/components/border-beam-button.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Button content." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "onClick", type: "() => void", description: "Click handler." },
    ],
    accessibility: "A real button, keyboard focusable and activatable on Enter and Space. The beam is decorative.",
    touch: "The beam is disabled on touch; press feedback remains.",
    reducedMotion: "The beam is disabled; press feedback remains.",
  },
  {
    name: "gradient-button",
    type: "registry:component",
    title: "Gradient Button",
    description: "A button with a smoothly panning gradient background.",
    categories: ["buttons"],
    files: [{ source: "src/components/mirro/components/gradient-button.tsx", target: "components/mirro/components/gradient-button.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Button content." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "onClick", type: "() => void", description: "Click handler." },
    ],
    accessibility: "A real button, keyboard focusable and activatable on Enter and Space. The gradient is decorative.",
    touch: "The gradient pan is disabled on touch; press feedback remains.",
    reducedMotion: "The gradient is static under reduced motion.",
  },
  {
    name: "tilt-card",
    type: "registry:component",
    title: "Tilt Card",
    description: "A card that tilts in 3D to follow the cursor.",
    categories: ["cards", "interactive"],
    files: [{ source: "src/components/mirro/components/tilt-card.tsx", target: "components/mirro/components/tilt-card.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["use-hover-capable", "cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Card content." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "max", type: "number", default: "10", description: "Maximum tilt angle in degrees." },
    ],
    accessibility: "Card content keeps its own semantics; the tilt is decorative and aria-hidden.",
    touch: "Pointer-following tilt is disabled on touch via a (hover: hover) and (pointer: fine) check.",
    reducedMotion: "The tilt is disabled; a subtle scale remains.",
    playground: [
      { key: "max", label: "Max tilt", type: "slider", min: 0, max: 20, step: 1, default: 10 },
    ],
  },
  {
    name: "flip-card",
    type: "registry:component",
    title: "Flip Card",
    description: "A card that flips in 3D to reveal a back face.",
    categories: ["cards", "interactive"],
    files: [{ source: "src/components/mirro/components/flip-card.tsx", target: "components/mirro/components/flip-card.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "front", type: "ReactNode", description: "Front face content." },
      { name: "back", type: "ReactNode", description: "Back face content." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility: "Renders as a button with aria-pressed reflecting the flipped state. Toggles on Enter and Space.",
    touch: "Tapping the card flips it.",
    reducedMotion: "The flip is instant under reduced motion.",
  },
  {
    name: "blur-text",
    type: "registry:component",
    title: "Blur Text",
    description: "Text that starts blurred and sharpens on hover.",
    categories: ["text"],
    files: [{ source: "src/components/mirro/components/blur-text.tsx", target: "components/mirro/components/blur-text.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["use-hover-capable", "cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Text content." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility: "The blur is decorative; the text is present in the DOM and readable regardless.",
    touch: "Hover de-blur is gated behind a (hover: hover) and (pointer: fine) check.",
    reducedMotion: "The blur is not applied.",
  },
  {
    name: "typewriter-text",
    type: "registry:component",
    title: "Typewriter Text",
    description: "Text that types itself out character by character when scrolled into view.",
    categories: ["text", "scroll"],
    files: [{ source: "src/components/mirro/components/typewriter-text.tsx", target: "components/mirro/components/typewriter-text.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Text content." },
      { name: "className", type: "string", description: "Additional classes." },
      { name: "speed", type: "number", default: "32", description: "Milliseconds per character." },
    ],
    accessibility: "The typing is decorative; the full text is present in the DOM and readable by screen readers.",
    touch: "No pointer-following; triggers on scroll into view.",
    reducedMotion: "The text appears immediately without typing.",
    playground: [
      { key: "speed", label: "Speed (ms)", type: "slider", min: 10, max: 100, step: 2, default: 32 },
    ],
  },
  {
    name: "scramble-text",
    type: "registry:component",
    title: "Scramble Text",
    description: "Text that decodes from random characters when scrolled into view.",
    categories: ["text", "scroll"],
    files: [{ source: "src/components/mirro/components/scramble-text.tsx", target: "components/mirro/components/scramble-text.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Text content." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility: "The scramble is decorative; the full text is present in the DOM and readable by screen readers.",
    touch: "No pointer-following; triggers on scroll into view.",
    reducedMotion: "The text appears immediately without scrambling.",
  },
  {
    name: "gradient-text",
    type: "registry:component",
    title: "Gradient Text",
    description: "Text with a smoothly panning gradient fill.",
    categories: ["text"],
    files: [{ source: "src/components/mirro/components/gradient-text.tsx", target: "components/mirro/components/gradient-text.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "children", type: "ReactNode", description: "Text content." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility: "The gradient is decorative; the text is present in the DOM and readable.",
    touch: "No pointer-following.",
    reducedMotion: "The gradient is static under reduced motion.",
  },
  {
    name: "switch",
    type: "registry:component",
    title: "Switch",
    description: "A toggle switch with a spring-animated thumb.",
    categories: ["interactive", "forms"],
    files: [{ source: "src/components/mirro/components/switch.tsx", target: "components/mirro/components/switch.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "checked", type: "boolean", description: "Controlled checked state." },
      { name: "defaultChecked", type: "boolean", default: "false", description: "Initial checked state when uncontrolled." },
      { name: "onCheckedChange", type: "(checked: boolean) => void", description: "Called with the checked state on change." },
      { name: "label", type: "string", description: "Accessible label." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility: "Implements role=\"switch\" with aria-checked. Toggles on Enter and Space.",
    touch: "Tapping toggles the switch.",
    reducedMotion: "The thumb snaps instantly instead of springing.",
  },
  {
    name: "checkbox",
    type: "registry:component",
    title: "Checkbox",
    description: "A checkbox whose background sweeps in before the checkmark stamps into place.",
    categories: ["interactive", "forms"],
    files: [{ source: "src/components/mirro/components/checkbox.tsx", target: "components/mirro/components/checkbox.tsx", type: "registry:component" }],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    props: [
      { name: "checked", type: "boolean", description: "Controlled checked state." },
      { name: "defaultChecked", type: "boolean", default: "false", description: "Initial checked state when uncontrolled." },
      { name: "onCheckedChange", type: "(checked: boolean) => void", description: "Called with the checked state on change." },
      { name: "label", type: "string", description: "Accessible label." },
      { name: "className", type: "string", description: "Additional classes." },
    ],
    accessibility: "Implements role=\"checkbox\" with aria-checked. Toggles on Enter and Space.",
    touch: "Tapping toggles the checkbox.",
    reducedMotion: "The sweep and stamp are skipped; the checked state appears instantly.",
  },
  {
    name: "animated-hero",
    type: "registry:block",
    title: "Animated Hero",
    description: "A complete hero section with a text-reveal headline, magnetic CTAs, and a live product visual.",
    categories: ["blocks", "hero"],
    files: [
      { source: "src/components/mirro/blocks/animated-hero.tsx", target: "components/mirro/blocks/animated-hero.tsx", type: "registry:block" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["text-reveal", "magnetic-button", "spotlight-card", "heart", "check", "copy", "sun-moon"],
    accessibility:
      "The headline uses TextReveal, which is decorative — the text is present in the DOM and readable regardless of animation. CTAs are real buttons with keyboard support.",
    touch:
      "Magnetic buttons disable pointer-following on touch and keep press feedback. The hero visual's spotlight glow is disabled on touch.",
    reducedMotion:
      "Text reveals fade without blur or slide; magnetic follow is disabled; the spotlight glow fades without spring smoothing.",
  },
  {
    name: "feature-showcase",
    type: "registry:block",
    title: "Feature Showcase",
    description: "A features section with a text-reveal heading and a grid of spotlight cards.",
    categories: ["blocks", "features"],
    files: [
      { source: "src/components/mirro/blocks/feature-showcase.tsx", target: "components/mirro/blocks/feature-showcase.tsx", type: "registry:block" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["spotlight-card", "text-reveal", "heart", "check", "copy", "sun-moon", "menu"],
    accessibility:
      "Card content keeps its own semantics; the spotlight glow is decorative. The heading reveal is decorative and the text is always present.",
    touch:
      "Spotlight cards disable pointer-following on touch; card content remains fully usable.",
    reducedMotion:
      "The heading reveal fades without blur or slide; spotlight glows fade without spring smoothing.",
  },
  {
    name: "pricing-section",
    type: "registry:block",
    title: "Pricing Section",
    description: "A pricing section with tiers, spotlight cards, and gradient CTAs.",
    categories: ["blocks", "pricing"],
    files: [{ source: "src/components/mirro/blocks/pricing-section.tsx", target: "components/mirro/blocks/pricing-section.tsx", type: "registry:block" }],
    dependencies: ["motion"],
    registryDependencies: ["spotlight-card", "gradient-button", "check", "text-reveal"],
    accessibility: "Card content keeps its own semantics; spotlight glows are decorative. Buttons are real and keyboard-accessible.",
    touch: "Spotlight glows are disabled on touch; content remains usable.",
    reducedMotion: "Heading reveal fades without blur; spotlight glows fade without spring smoothing.",
  },
  {
    name: "testimonials-section",
    type: "registry:block",
    title: "Testimonials Section",
    description: "A testimonials grid with spotlight cards and star ratings.",
    categories: ["blocks", "testimonials"],
    files: [{ source: "src/components/mirro/blocks/testimonials-section.tsx", target: "components/mirro/blocks/testimonials-section.tsx", type: "registry:block" }],
    dependencies: ["motion"],
    registryDependencies: ["spotlight-card", "star", "text-reveal"],
    accessibility: "Card content keeps its own semantics; spotlight glows are decorative.",
    touch: "Spotlight glows are disabled on touch; content remains usable.",
    reducedMotion: "Heading reveal fades without blur; spotlight glows fade without spring smoothing.",
  },
  {
    name: "cta-section",
    type: "registry:block",
    title: "CTA Section",
    description: "A call-to-action section with a text-reveal headline and magnetic buttons.",
    categories: ["blocks", "cta"],
    files: [{ source: "src/components/mirro/blocks/cta-section.tsx", target: "components/mirro/blocks/cta-section.tsx", type: "registry:block" }],
    dependencies: ["motion"],
    registryDependencies: ["magnetic-button", "text-reveal"],
    accessibility: "Buttons are real and keyboard-accessible; the headline reveal is decorative.",
    touch: "Magnetic buttons disable pointer-following on touch and keep press feedback.",
    reducedMotion:
      "Headline reveal fades without blur; magnetic follow is disabled.",
  },
  {
    name: "integrations-hero",
    type: "registry:block",
    title: "Integrations Hero",
    description: "A hero showing the stack Mirro is built on, with animated flowing lines converging on a center node.",
    categories: ["blocks", "hero"],
    files: [
      { source: "src/components/mirro/blocks/integrations-hero.tsx", target: "components/mirro/blocks/integrations-hero.tsx", type: "registry:block" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["cn"],
    accessibility:
      "The flowing lines and convergence are decorative. Icon tiles expose their label via title for screen readers.",
    touch:
      "The flowing line animation is CSS/transform-based and works on touch. No pointer-following.",
    reducedMotion:
      "The flowing pulse animation is disabled; lines render statically.",
  },
];
const allEntries = [...MIRRO_LIBS, ...entries];

const registryDir = path.join(root, "registry");
if (!fs.existsSync(registryDir)) fs.mkdirSync(registryDir, { recursive: true });

for (const entry of allEntries) {
  const files = entry.files.map((f) => ({
    path: f.target,
    type: f.type,
    content: fs.readFileSync(path.join(root, f.source), "utf-8"),
  }));
  const output = {
    $schema: "https://mirro-ui.com/schema/registry.json",
    name: entry.name,
    type: entry.type,
    title: entry.title,
    description: entry.description,
    categories: entry.categories,
    files,
    dependencies: entry.dependencies ?? [],
    registryDependencies: entry.registryDependencies ?? [],
    props: entry.props ?? [],
    accessibility: entry.accessibility,
    touch: entry.touch,
    reducedMotion: entry.reducedMotion,
    playground: entry.playground ?? [],
  };
  fs.writeFileSync(path.join(registryDir, `${entry.name}.json`), JSON.stringify(output, null, 2) + "\n");
  console.log(`registry/${entry.name}.json`);
}

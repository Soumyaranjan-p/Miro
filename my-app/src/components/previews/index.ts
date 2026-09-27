import type { ComponentType } from "react";
import type { ControlValues } from "./control-panel";
import { HeartPreview, type PreviewProps } from "./heart-preview";
import { MenuPreview } from "./menu-preview";
import { CopyPreview } from "./copy-preview";
import { CheckPreview } from "./check-preview";
import { SunMoonPreview } from "./sun-moon-preview";
import { MagneticButtonPreview } from "./magnetic-button-preview";
import { SpotlightCardPreview } from "./spotlight-card-preview";
import { TextRevealPreview } from "./text-reveal-preview";
import { AnimatedTabsPreview } from "./animated-tabs-preview";
import { AnimatedAccordionPreview } from "./animated-accordion-preview";
import { AnimatedHeroPreview } from "./animated-hero-preview";
import { FeatureShowcasePreview } from "./feature-showcase-preview";
import { SearchPreview } from "./search-preview";
import { BellPreview } from "./bell-preview";
import { ArrowPreview } from "./arrow-preview";
import { DownloadPreview } from "./download-preview";
import { PlusPreview } from "./plus-preview";
import { XPreview } from "./x-preview";
import { EyePreview } from "./eye-preview";
import { StarPreview } from "./star-preview";
import { SendPreview } from "./send-preview";
import { TrashPreview } from "./trash-preview";
import { RefreshPreview } from "./refresh-preview";
import { PlayPreview } from "./play-preview";
import { ShimmerButtonPreview } from "./shimmer-button-preview";
import { RippleButtonPreview } from "./ripple-button-preview";
import { BorderBeamButtonPreview } from "./border-beam-button-preview";
import { GradientButtonPreview } from "./gradient-button-preview";
import { TiltCardPreview } from "./tilt-card-preview";
import { FlipCardPreview } from "./flip-card-preview";
import { BlurTextPreview } from "./blur-text-preview";
import { TypewriterTextPreview } from "./typewriter-text-preview";
import { ScrambleTextPreview } from "./scramble-text-preview";
import { GradientTextPreview } from "./gradient-text-preview";
import { SwitchPreview } from "./switch-preview";
import { CheckboxPreview } from "./checkbox-preview";
import { PricingSectionPreview } from "./pricing-section-preview";
import { TestimonialsSectionPreview } from "./testimonials-section-preview";
import { CtaSectionPreview } from "./cta-section-preview";
import { IntegrationsHeroPreview } from "./integrations-hero-preview";
import { BookmarkPreview } from "./bookmark-preview";

export type { PreviewProps } from "./heart-preview";

export interface PreviewDefinition {
  component: ComponentType<PreviewProps>;
  generateCode?: (controls: ControlValues) => string;
}

function hexToRgbTriplet(hex: string | number | boolean): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
  if (!m) return "255, 77, 41";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function colorProp(c: ControlValues): string {
  return c.color && c.color !== "currentColor" ? `\n  color="${c.color}"` : "";
}

export const previews: Record<string, PreviewDefinition> = {
  heart: {
    component: HeartPreview,
    generateCode: (c) =>
      `<HeartIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n  fillColor="${c.fillColor}"\n/>`,
  },
  menu: {
    component: MenuPreview,
    generateCode: (c) =>
      `<MenuIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  copy: {
    component: CopyPreview,
    generateCode: (c) =>
      `<CopyIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n  checkColor="${c.checkColor}"\n/>`,
  },
  check: {
    component: CheckPreview,
    generateCode: (c) =>
      `<CheckIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  "sun-moon": {
    component: SunMoonPreview,
    generateCode: (c) =>
      `<SunMoonIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  "magnetic-button": {
    component: MagneticButtonPreview,
    generateCode: (c) =>
      `<MagneticButton strength={${c.strength}} variant="${c.variant}">\n  Hover me\n</MagneticButton>`,
  },
  "spotlight-card": {
    component: SpotlightCardPreview,
    generateCode: (c) =>
      `<SpotlightCard spotlightColor="${hexToRgbTriplet(c.spotlightColor)}">\n  <div className="p-6">Content</div>\n</SpotlightCard>`,
  },
  "text-reveal": {
    component: TextRevealPreview,
    generateCode: (c) =>
      `<TextReveal delay={${c.delay}}>\n  Motion for modern interfaces.\n</TextReveal>`,
  },
  "animated-tabs": {
    component: AnimatedTabsPreview,
    generateCode: () =>
      `<AnimatedTabs\n  tabs={[\n    { label: "Overview", value: "overview" },\n    { label: "Settings", value: "settings" },\n  ]}\n/>`,
  },
  "animated-accordion": {
    component: AnimatedAccordionPreview,
    generateCode: () =>
      `<AnimatedAccordion\n  items={[\n    { title: "Question", content: "Answer" },\n  ]}\n/>`,
  },
  "animated-hero": {
    component: AnimatedHeroPreview,
    generateCode: () => `<AnimatedHero />`,
  },
  "feature-showcase": {
    component: FeatureShowcasePreview,
    generateCode: () => `<FeatureShowcase />`,
  },
  search: {
    component: SearchPreview,
    generateCode: (c) =>
      `<SearchIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  bell: {
    component: BellPreview,
    generateCode: (c) =>
      `<BellIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  arrow: {
    component: ArrowPreview,
    generateCode: (c) =>
      `<ArrowIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n  direction="${c.direction}"\n/>`,
  },
  download: {
    component: DownloadPreview,
    generateCode: (c) =>
      `<DownloadIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  plus: {
    component: PlusPreview,
    generateCode: (c) =>
      `<PlusIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  x: {
    component: XPreview,
    generateCode: (c) =>
      `<XIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  eye: {
    component: EyePreview,
    generateCode: (c) =>
      `<EyeIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  star: {
    component: StarPreview,
    generateCode: (c) =>
      `<StarIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n  fillColor="${c.fillColor}"\n/>`,
  },
  send: {
    component: SendPreview,
    generateCode: (c) =>
      `<SendIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  trash: {
    component: TrashPreview,
    generateCode: (c) =>
      `<TrashIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  refresh: {
    component: RefreshPreview,
    generateCode: (c) =>
      `<RefreshIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  play: {
    component: PlayPreview,
    generateCode: (c) =>
      `<PlayIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n/>`,
  },
  "shimmer-button": {
    component: ShimmerButtonPreview,
    generateCode: () => `<ShimmerButton>Get started</ShimmerButton>`,
  },
  "ripple-button": {
    component: RippleButtonPreview,
    generateCode: () => `<RippleButton>Click me</RippleButton>`,
  },
  "border-beam-button": {
    component: BorderBeamButtonPreview,
    generateCode: () => `<BorderBeamButton>Hover me</BorderBeamButton>`,
  },
  "gradient-button": {
    component: GradientButtonPreview,
    generateCode: () => `<GradientButton>Get started</GradientButton>`,
  },
  "tilt-card": {
    component: TiltCardPreview,
    generateCode: (c) =>
      `<TiltCard max={${c.max}}>\n  <div className="p-6">Content</div>\n</TiltCard>`,
  },
  "flip-card": {
    component: FlipCardPreview,
    generateCode: () =>
      `<FlipCard\n  front={<div>Front</div>}\n  back={<div>Back</div>}\n/>`,
  },
  "blur-text": {
    component: BlurTextPreview,
    generateCode: () => `<BlurText>Hover to focus.</BlurText>`,
  },
  "typewriter-text": {
    component: TypewriterTextPreview,
    generateCode: (c) =>
      `<TypewriterText speed={${c.speed}}>\n  Typed character by character.\n</TypewriterText>`,
  },
  "scramble-text": {
    component: ScrambleTextPreview,
    generateCode: () => `<ScrambleText>Decoded from noise.</ScrambleText>`,
  },
  "gradient-text": {
    component: GradientTextPreview,
    generateCode: () => `<GradientText>Animated gradient text.</GradientText>`,
  },
  switch: {
    component: SwitchPreview,
    generateCode: () => `<Switch label="Toggle" />`,
  },
  checkbox: {
    component: CheckboxPreview,
    generateCode: () => `<Checkbox label="Check" />`,
  },
  "pricing-section": {
    component: PricingSectionPreview,
    generateCode: () => `<PricingSection />`,
  },
  "testimonials-section": {
    component: TestimonialsSectionPreview,
    generateCode: () => `<TestimonialsSection />`,
  },
  "cta-section": {
    component: CtaSectionPreview,
    generateCode: () => `<CtaSection />`,
  },
  "integrations-hero": {
    component: IntegrationsHeroPreview,
    generateCode: () => `<IntegrationsHero />`,
  },
  bookmark: {
    component: BookmarkPreview,
    generateCode: (c) =>
      `<BookmarkIcon\n  size={${c.size}}\n  strokeWidth={${c.strokeWidth}}\n  ${colorProp(c)}\n  fillColor="${c.fillColor}"\n/>`,
  },
};

export function getPreview(name: string): ComponentType<PreviewProps> | null {
  return previews[name]?.component ?? null;
}

export function getPreviewDefinition(name: string): PreviewDefinition | null {
  return previews[name] ?? null;
}

export type SoundName = "pop" | "tick" | "chime" | "affirm" | "whoosh" | "switch" | "thunk";

let ctx: AudioContext | null = null;
let enabled = false;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    enabled = localStorage.getItem("mirro-sound") === "on";
  } catch {}
}

function getCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  dest: AudioContext,
  { freq, freqEnd, type, volume, start, duration }: {
    freq: number;
    freqEnd?: number;
    type: OscillatorType;
    volume: number;
    start: number;
    duration: number;
  }
) {
  const osc = dest.createOscillator();
  const gain = dest.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);
  osc.connect(gain).connect(dest.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(
  dest: AudioContext,
  { volume, start, duration, from, to }: { volume: number; start: number; duration: number; from: number; to: number }
) {
  const len = Math.floor(dest.sampleRate * duration);
  const buffer = dest.createBuffer(1, len, dest.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = dest.createBufferSource();
  src.buffer = buffer;
  const filter = dest.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = dest.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);
  src.connect(filter).connect(gain).connect(dest.destination);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const SOUNDS: Record<SoundName, (dest: AudioContext) => void> = {
  pop: (dest) => {
    const t = dest.currentTime;
    tone(dest, { freq: 420, freqEnd: 130, type: "sine", volume: 0.16, start: t, duration: 0.09 });
  },
  tick: (dest) => {
    const t = dest.currentTime;
    tone(dest, { freq: 1250, type: "square", volume: 0.06, start: t, duration: 0.045 });
    tone(dest, { freq: 1800, type: "sine", volume: 0.04, start: t + 0.01, duration: 0.03 });
  },
  chime: (dest) => {
    const t = dest.currentTime;
    tone(dest, { freq: 880, type: "sine", volume: 0.07, start: t, duration: 0.12 });
    tone(dest, { freq: 1318, type: "sine", volume: 0.045, start: t, duration: 0.1 });
  },
  affirm: (dest) => {
    const t = dest.currentTime;
    tone(dest, { freq: 720, freqEnd: 520, type: "sine", volume: 0.1, start: t, duration: 0.07 });
  },
  whoosh: (dest) => {
    const t = dest.currentTime;
    noise(dest, { volume: 0.028, start: t, duration: 0.09, from: 700, to: 2400 });
  },
  switch: (dest) => {
    const t = dest.currentTime;
    tone(dest, { freq: 210, freqEnd: 150, type: "sine", volume: 0.12, start: t, duration: 0.055 });
  },
  thunk: (dest) => {
    const t = dest.currentTime;
    tone(dest, { freq: 180, freqEnd: 90, type: "sine", volume: 0.14, start: t, duration: 0.08 });
  },
};

export function setSoundEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem("mirro-sound", value ? "on" : "off");
  } catch {}
  listeners.forEach((fn) => fn());
}

export function getSoundEnabled() {
  return enabled;
}

export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    const dest = getCtx();
    SOUNDS[name](dest);
  } catch {}
}

export function primeSound() {
  try {
    getCtx();
  } catch {}
}

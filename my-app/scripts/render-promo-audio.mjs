/**
 * Offline render of the Mirro sound design to WAV.
 *
 * Reproduces the exact DSP recipes from src/lib/sound.ts (tone: oscillator
 * with exponential gain ramp to 0.0008; noise: white noise through a bandpass
 * with exponential frequency ramp) as sample-level synthesis in Node, placed
 * at the interaction timestamps of the promo take. A minimal ambient bed is
 * synthesized in the same style and kept well below the UI sounds.
 */
import { writeFileSync } from "node:fs";

const SR = 44100;
const DUR = 19.7; // match the recorded take
const N = Math.floor(SR * DUR);

// Master buses
const left = new Float64Array(N);
const right = new Float64Array(N);

const TAU = Math.PI * 2;

/** Phase-continuous oscillator bank so tones don't click. */
const oscPhase = new Map();
function phaseFor(id, freq, t) {
  const prev = oscPhase.get(id) ?? { phase: 0, freq: 0, t: 0 };
  const dt = t - prev.t;
  const f = prev.freq || freq;
  let phase = prev.phase + TAU * f * dt;
  if (dt > 0.1 || dt < 0) phase = 0; // long gap: reset
  const state = { phase, freq, t };
  oscPhase.set(id, state);
  return phase;
}

function wave(type, phase) {
  switch (type) {
    case "sine":
      return Math.sin(phase);
    case "square":
      return Math.sin(phase) >= 0 ? 1 : -1;
    default:
      return Math.sin(phase);
  }
}

/**
 * Exact port of sound.ts tone(): gain holds `volume` at start, then
 * exponential-ramps to 0.0008 across `duration`.
 */
function tone({ id, freq, freqEnd, type, volume, start, duration }) {
  const s0 = Math.floor(start * SR);
  const s1 = Math.min(N, Math.floor((start + duration + 0.02) * SR));
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const u = Math.min(1, (t - start) / duration);
    if (u < 0) continue;
    const f = freqEnd ? freq * Math.pow(freqEnd / freq, u) : freq;
    const phase = phaseFor(id, f, t);
    const g = volume * Math.pow(0.0008 / volume, u);
    const v = wave(type, phase) * g;
    left[i] += v;
    right[i] += v;
  }
}

/**
 * Port of sound.ts noise(): white noise through a bandpass whose center
 * frequency ramps exponentially from `from` to `to`.
 */
function noise({ volume, start, duration, from, to }) {
  const s0 = Math.floor(start * SR);
  const s1 = Math.min(N, Math.floor((start + duration + 0.02) * SR));
  // State-variable bandpass (Chamberlin), time-varying cutoff.
  let low = 0;
  let band = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const u = Math.min(1, (t - start) / duration);
    const fc = from * Math.pow(to / from, u);
    const f = 2 * Math.sin((Math.PI * fc) / SR);
    const white = Math.random() * 2 - 1;
    low += f * band;
    band += f * (white - low - band * 1.2);
    const g = volume * Math.pow(0.0008 / volume, u);
    const v = band * 4 * g;
    left[i] += v;
    right[i] += v;
  }
}

// ---- Sound recipes lifted verbatim from src/lib/sound.ts SOUNDS ----
const SOUNDS = {
  pop: () =>
    tone({ id: "pop", freq: 420, freqEnd: 130, type: "sine", volume: 0.16, start: 0, duration: 0.09 }),
  tick: () => {
    tone({ id: "tick1", freq: 1250, type: "square", volume: 0.06, start: 0, duration: 0.045 });
    tone({ id: "tick2", freq: 1800, type: "sine", volume: 0.04, start: 0.01, duration: 0.03 });
  },
  chime: () => {
    tone({ id: "chime1", freq: 880, type: "sine", volume: 0.07, start: 0, duration: 0.12 });
    tone({ id: "chime2", freq: 1318, type: "sine", volume: 0.045, start: 0, duration: 0.1 });
  },
  affirm: () =>
    tone({ id: "affirm", freq: 720, freqEnd: 520, type: "sine", volume: 0.1, start: 0, duration: 0.07 }),
  whoosh: () =>
    noise({ volume: 0.028, start: 0, duration: 0.09, from: 700, to: 2400 }),
  switch: () =>
    tone({ id: "switch", freq: 210, freqEnd: 150, type: "sine", volume: 0.12, start: 0, duration: 0.055 }),
  thunk: () =>
    tone({ id: "thunk", freq: 180, freqEnd: 90, type: "sine", volume: 0.14, start: 0, duration: 0.08 }),
};

/**
 * Recipes with explicit `at` offsets — same oscillator types, frequencies,
 * volumes, exponential-ramp targets and durations as the corresponding
 * entries in src/lib/sound.ts (which always start at t=0).
 */
function playAt(name, at) {
  const a = at;
  switch (name) {
    case "pop":
      tone({ id: `pop@${a}`, freq: 420, freqEnd: 130, type: "sine", volume: 0.16, start: a, duration: 0.09 });
      break;
    case "tick":
      tone({ id: `tick1@${a}`, freq: 1250, type: "square", volume: 0.06, start: a, duration: 0.045 });
      tone({ id: `tick2@${a}`, freq: 1800, type: "sine", volume: 0.04, start: a + 0.01, duration: 0.03 });
      break;
    case "chime":
      tone({ id: `chime1@${a}`, freq: 880, type: "sine", volume: 0.07, start: a, duration: 0.12 });
      tone({ id: `chime2@${a}`, freq: 1318, type: "sine", volume: 0.045, start: a, duration: 0.1 });
      break;
    case "affirm":
      tone({ id: `affirm@${a}`, freq: 720, freqEnd: 520, type: "sine", volume: 0.1, start: a, duration: 0.07 });
      break;
    case "whoosh":
      noise({ volume: 0.028, start: a, duration: 0.09, from: 700, to: 2400 });
      break;
    case "switch":
      tone({ id: `switch@${a}`, freq: 210, freqEnd: 150, type: "sine", volume: 0.12, start: a, duration: 0.055 });
      break;
    case "thunk":
      tone({ id: `thunk@${a}`, freq: 180, freqEnd: 90, type: "sine", volume: 0.14, start: a, duration: 0.08 });
      break;
  }
}

// ---- Soundtrack ----

// UI interaction sounds at the exact harness timestamps.
playAt("affirm", 0.62);   // scene 1: check draw completes (mount draw ~0.4 + 0.22)
playAt("pop", 5.15);      // heart click
playAt("whoosh", 6.05);   // menu morph
playAt("switch", 6.65);   // sun-moon
playAt("chime", 7.25);    // bell
playAt("tick", 8.35);     // tab slide
playAt("switch", 9.65);   // switch throw
playAt("thunk", 12.62);   // flip lands (click 12.5 + 0.12)
playAt("chime", 17.35);   // logo reveal

// Soft whoosh at each scene cut, lowered from 0.028 to 0.012.
for (const cut of [2.5, 5.0, 7.5, 11.0, 14.0, 17.0]) {
  noise({ volume: 0.012, start: cut - 0.08, duration: 0.14, from: 500, to: 2000 });
}

// Ambient bed: warm two-note pad (A2 + E3) with slow swell, plus a gentle
// 5th-above shimmer every 4.75s. Same sine/exponential-ramp vocabulary.
const padVolume = 0.028;
for (const [freq, detune] of [[110, 0.15], [110.4, -0.15], [164.8, 0.2]]) {
  for (let seg = 0; seg < Math.ceil(DUR / 4.75); seg++) {
    const start = seg * 4.75;
    const dur = Math.min(4.9, DUR - start);
    if (dur <= 0.2) break;
    tone({
      id: `pad${freq}@${seg}`,
      freq: freq + detune,
      type: "sine",
      volume: padVolume,
      start,
      duration: dur,
    });
  }
}
// Shimmer: soft high sine pings on the hub-cascade rhythm.
for (const at of [2.4, 7.15, 11.9, 14.6, 16.5]) {
  tone({ id: `shim@${at}`, freq: 1318.5, type: "sine", volume: 0.02, start: at, duration: 0.5 });
}

// Master fades: 120ms in, long fade-out from 18.6s.
const fadeIn = 0.12;
const fadeOutStart = 18.6;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = 1;
  if (t < fadeIn) g = t / fadeIn;
  if (t > fadeOutStart) g = Math.max(0, 1 - (t - fadeOutStart) / (DUR - fadeOutStart));
  left[i] *= g;
  right[i] *= g;
}

// Peak-normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const norm = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;

// 16-bit stereo WAV.
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * norm * 32767))), i * 4);
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * norm * 32767))), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

writeFileSync("render/promo-audio.wav", Buffer.concat([header, pcm]));
console.log("wrote render/promo-audio.wav", (N / SR).toFixed(2) + "s", "peak", peak.toFixed(3));

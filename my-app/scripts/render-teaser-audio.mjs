/**
 * Mirro launch-teaser sound design — 8s, offline render to WAV.
 *
 * Sound script (restraint over spectacle):
 *   0.00–2.60  sub-bass swell (55Hz sine, slow exponential attack), low noise floor
 *   1.10       one soft affirm tone as the checkmark completes (720→520)
 *   3.40       brand reveal: low root A2 lands, subtle octave shimmer above
 *   4.70       tagline: major 3rd interval (C#4) joins — warmth, not a fanfare
 *   6.40–8.00  everything decays; single sustained root holds to black
 *
 * All synthesis matches src/lib/sound.ts: sine oscillators, exponential gain
 * ramps toward 0.0008, bandpass noise — no loops, no samples.
 */
import { writeFileSync } from "node:fs";

const SR = 44100;
const DUR = 8.0;
const N = Math.floor(SR * DUR);
const TAU = Math.PI * 2;

const left = new Float64Array(N);
const right = new Float64Array(N);

/** Phase-continuous sine with exponential gain ramp (sound.ts tone()). */
function tone({ id, freq, freqEnd, volume, start, duration, attack = 0 }) {
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, Math.floor((start + duration + 0.02) * SR));
  let phase = 0;
  let lastF = freq;
  let lastT = start;
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const u = (t - start) / duration;
    if (u < 0) continue;
    const f = freqEnd ? freq * Math.pow(freqEnd / freq, u) : freq;
    phase += TAU * (lastF + f) / 2 * (t - lastT);
    lastF = f;
    lastT = t;
    // gain: optional linear attack, then exponential decay to 0.0008
    let g;
    if (attack > 0 && u * duration < attack) {
      g = volume * ((t - start) / attack);
    } else {
      const v = Math.max(0, (t - start - attack) / Math.max(0.001, duration - attack));
      g = volume * Math.pow(0.0008 / volume, v);
    }
    const s = Math.sin(phase) * g;
    left[i] += s;
    right[i] += s;
  }
  void id;
}

/** Chamberlin bandpass noise sweep (sound.ts noise()), very quiet. */
function noiseSweep({ volume, start, duration, from, to }) {
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, Math.floor((start + duration) * SR));
  let low = 0;
  let band = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const u = Math.min(1, Math.max(0, (t - start) / duration));
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

// ---- 1. Sub-bass swell — the "breath" under the black frame. ----
// 55Hz sine, 2.2s linear attack to a low plateau, slow decay after.
{
  const s0 = 0;
  const s1 = Math.floor(5.2 * SR);
  let phase = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const u = t / 2.2;
    let g;
    if (t < 2.2) g = 0.16 * Math.pow(u, 1.5); // slow cinematic swell
    else g = 0.16 * Math.pow(0.0008 / 0.16, Math.min(1, (t - 2.2) / 3.0)); // decay
    phase += TAU * 55 / SR;
    const s = Math.sin(phase) * g;
    left[i] += s;
    right[i] += s;
  }
}
// Low noise floor air (very quiet bandpass, wide)
noiseSweep({ volume: 0.006, start: 0, duration: 2.4, from: 120, to: 900 });

// ---- 2. The check completes: one soft, precise tone. ----
tone({ id: "check", freq: 720, freqEnd: 520, volume: 0.11, start: 1.12, duration: 0.16 });
// a barely-there sub "thock" to give the disc spring physical weight
tone({ id: "thock", freq: 120, freqEnd: 60, volume: 0.13, start: 1.06, duration: 0.09 });

// ---- 3. Brand reveal (3.4s): root note lands with the wordmark. ----
tone({ id: "root", freq: 110, volume: 0.15, start: 3.38, duration: 1.9, attack: 0.06 });
tone({ id: "oct", freq: 220, volume: 0.05, start: 3.42, duration: 1.6, attack: 0.1 });
// airy sweep into the reveal (quiet, upward)
noiseSweep({ volume: 0.01, start: 3.15, duration: 0.5, from: 400, to: 2600 });

// ---- 4. Tagline (4.7s): major 3rd joins — warmth. ----
tone({ id: "third", freq: 138.59, volume: 0.065, start: 4.7, duration: 1.6, attack: 0.12 });
tone({ id: "fifth", freq: 164.81, volume: 0.05, start: 5.1, duration: 1.5, attack: 0.15 });

// ---- 5. Decay to black: everything thins out from 6.4s. ----
// (handled by each tone's own exponential decay; final root holds longest)
tone({ id: "hold", freq: 110, volume: 0.06, start: 5.9, duration: 2.0, attack: 0.3 });

// ---- Master ----
const fadeIn = 0.06;
const fadeOutStart = 7.35;
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

writeFileSync("render/teaser-audio.wav", Buffer.concat([header, pcm]));
console.log("wrote render/teaser-audio.wav", (N / SR).toFixed(2) + "s", "peak", peak.toFixed(3));

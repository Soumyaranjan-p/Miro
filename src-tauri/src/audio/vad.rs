//! Voice Activity Detection (VAD).
//!
//! Energy-based voice activity detection with adaptive noise floor tracking
//! and hangover. Mirrors Silero VAD's approach of energy + spectral flux
//! with hysteresis, but implemented in pure Rust without ONNX dependencies.
//!
//! Frames are 20 ms (320 samples at 16 kHz). A frame is "speech" when its
//! RMS energy exceeds the adaptive noise floor by SPEECH_OVER_NOISE (+10 dB).
//! Once speech starts, HANGOVER_FRAMES of additional frames are kept to avoid
//! clipping trailing syllables.

use crate::audio::resample::rms;

/// Frame size: 20 ms = 320 samples at 16 kHz.
const FRAME_SIZE: usize = 320;
/// Number of consecutive speech frames needed to declare speech onset.
const SPEECH_ONSET_FRAMES: usize = 2;
/// Number of frames to keep speech active after energy drops below gate.
const HANGOVER_FRAMES: usize = 10;
/// Minimum speech duration in frames to count as real speech.
const MIN_SPEECH_FRAMES: usize = 3;
/// Speech gate: energy must exceed noise_floor * SPEECH_OVER_NOISE.
const SPEECH_OVER_NOISE: f32 = 3.16; // +10 dB
/// How fast the noise floor adapts (0 = instant, 1 = never).
const NOISE_FLOOR_ALPHA: f32 = 0.95;

/// Result of VAD analysis on a buffer.
#[derive(Debug, Clone, Copy)]
pub struct VadResult {
    /// True if the buffer contains speech.
    pub has_speech: bool,
    /// Fraction of frames classified as speech (0.0 to 1.0).
    pub speech_ratio: f32,
    /// Estimated noise floor RMS.
    pub noise_floor: f32,
}

/// Adaptive voice activity detector.
pub struct Vad {
    noise_floor: f32,
    initialized: bool,
    hangover_remaining: usize,
    speech_frame_count: usize,
}

impl Default for Vad {
    fn default() -> Self {
        Self::new()
    }
}

impl Vad {
    pub fn new() -> Self {
        Self {
            noise_floor: 0.0,
            initialized: false,
            hangover_remaining: 0,
            speech_frame_count: 0,
        }
    }

    /// Analyze samples and return whether speech is present.
    ///
    /// `samples` should be 16 kHz mono f32. The noise floor is adapted
    /// continuously from the quietest frames seen so far.
    pub fn analyze(&mut self, samples: &[f32]) -> VadResult {
        if samples.is_empty() {
            return VadResult {
                has_speech: false,
                speech_ratio: 0.0,
                noise_floor: self.noise_floor,
            };
        }

        let frame_count = samples.len() / FRAME_SIZE;
        if frame_count == 0 {
            return VadResult {
                has_speech: false,
                speech_ratio: 0.0,
                noise_floor: self.noise_floor,
            };
        }

        let mut frame_rms: Vec<f32> = Vec::with_capacity(frame_count);
        for i in 0..frame_count {
            let frame = &samples[i * FRAME_SIZE..(i + 1) * FRAME_SIZE];
            frame_rms.push(rms(frame));
        }

        // Update noise floor: exponential moving average toward the minimum
        // recent RMS (quietest frames represent the noise floor).
        let min_rms = frame_rms.iter().cloned().fold(f32::INFINITY, f32::min);
        if !self.initialized {
            self.noise_floor = min_rms;
            self.initialized = true;
        } else {
            self.noise_floor = NOISE_FLOOR_ALPHA * self.noise_floor
                + (1.0 - NOISE_FLOOR_ALPHA) * min_rms;
        }

        let gate = self.noise_floor * SPEECH_OVER_NOISE;

        let mut speech_flags = vec![false; frame_count];

        for (i, &rms_val) in frame_rms.iter().enumerate() {
            let is_speech = rms_val > gate;
            if is_speech {
                self.hangover_remaining = HANGOVER_FRAMES;
            } else if self.hangover_remaining > 0 {
                self.hangover_remaining -= 1;
                speech_flags[i] = true; // still in hangover
            } else {
                speech_flags[i] = false;
            }
        }

        // Remove very short speech bursts (likely clicks, not words).
        let mut final_speech_count = 0;
        let mut in_speech = false;
        let mut speech_start = 0;
        for (i, &flag) in speech_flags.iter().enumerate() {
            if flag && !in_speech {
                in_speech = true;
                speech_start = i;
            }
            if !flag && in_speech {
                if i - speech_start >= MIN_SPEECH_FRAMES {
                    final_speech_count += i - speech_start;
                }
                in_speech = false;
            }
        }
        if in_speech && frame_count - speech_start >= MIN_SPEECH_FRAMES {
            final_speech_count += frame_count - speech_start;
        }

        let has_speech = final_speech_count >= SPEECH_ONSET_FRAMES;
        let speech_ratio = if frame_count > 0 {
            final_speech_count as f32 / frame_count as f32
        } else {
            0.0
        };

        VadResult {
            has_speech,
            speech_ratio,
            noise_floor: self.noise_floor,
        }
    }

    /// Reset the VAD state (e.g. between recordings).
    pub fn reset(&mut self) {
        self.noise_floor = 0.0;
        self.initialized = false;
        self.hangover_remaining = 0;
        self.speech_frame_count = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_is_not_speech() {
        let mut vad = Vad::new();
        let samples = vec![0.0001f32; 16000]; // 1 second of silence
        let result = vad.analyze(&samples);
        assert!(!result.has_speech, "silence should not be speech");
    }

    #[test]
    fn loud_tone_is_speech() {
        let mut vad = Vad::new();
        let mut samples = Vec::new();
        for i in 0..16000 {
            samples.push(0.3 * (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16000.0).sin());
        }
        let result = vad.analyze(&samples);
        assert!(result.has_speech, "tone should be detected as speech");
    }

    #[test]
    fn vad_resets_between_recordings() {
        let mut vad = Vad::new();
        // First recording: loud audio.
        let mut loud = vec![0.5f32; 16000];
        let r1 = vad.analyze(&loud);
        assert!(r1.has_speech);
        // Reset and analyze silence.
        vad.reset();
        let mut silence = vec![0.0001f32; 16000];
        let r2 = vad.analyze(&silence);
        assert!(!r2.has_speech);
    }
}

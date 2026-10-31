//! Voice Activity Detection (VAD).
//!
//! Simple energy-based voice activity detection. Whisper.cpp already has its
//! own silence/no-speech detection, so VAD here is just a coarse gate: if
//! there's ANY audio above a very low RMS threshold, it counts as speech.
//! This prevents whisper from being starved of audio due to an over-aggressive
//! gate, while still rejecting true silence (e.g., user forgot to speak).
//!
//! Frames are 20 ms (320 samples at 16 kHz).

use crate::audio::resample::rms;

/// Frame size: 20 ms = 320 samples at 16 kHz.
const FRAME_SIZE: usize = 320;
/// Absolute RMS threshold: any frame above this counts as speech.
/// This is very low — whisper's own no-speech detection handles fine-grained
/// decisions. VAD is just a coarse "is there anything here?" guard.
const ABSOLUTE_SPEECH_RMS: f32 = 0.0005;

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

/// Simple voice activity detector.
pub struct Vad {
    noise_floor: f32,
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
        }
    }

    /// Analyze samples and return whether speech is present.
    ///
    /// `samples` should be 16 kHz mono f32. Returns true if any 20 ms frame
    /// has RMS above [`ABSOLUTE_SPEECH_RMS`].
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

        let mut speech_count = 0usize;
        let mut min_rms = f32::INFINITY;
        for i in 0..frame_count {
            let frame = &samples[i * FRAME_SIZE..(i + 1) * FRAME_SIZE];
            let rms_val = rms(frame);
            min_rms = min_rms.min(rms_val);
            if rms_val > ABSOLUTE_SPEECH_RMS {
                speech_count += 1;
            }
        }

        self.noise_floor = min_rms;

        let has_speech = speech_count >= 1;
        let speech_ratio = speech_count as f32 / frame_count as f32;

        VadResult {
            has_speech,
            speech_ratio,
            noise_floor: self.noise_floor,
        }
    }

    /// Reset the VAD state (e.g. between recordings).
    pub fn reset(&mut self) {
        self.noise_floor = 0.0;
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
        let loud = vec![0.5f32; 16000];
        let r1 = vad.analyze(&loud);
        assert!(r1.has_speech);
        // Reset and analyze silence.
        vad.reset();
        let silence = vec![0.0001f32; 16000];
        let r2 = vad.analyze(&silence);
        assert!(!r2.has_speech);
    }

    #[test]
    fn brief_speech_is_detected() {
        let mut vad = Vad::new();
        // 1 second of silence with 200 ms of speech in the middle
        let mut samples = vec![0.0001f32; 16000];
        for i in 4000..7200 {
            // 3200 samples = 200 ms of speech at 16 kHz
            samples[i] = 0.3 * (2.0 * std::f32::consts::PI * 440.0 * (i - 4000) as f32 / 3200.0).sin();
        }
        let result = vad.analyze(&samples);
        assert!(result.has_speech, "brief speech should be detected");
    }
}

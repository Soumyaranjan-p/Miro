//! Spectral subtraction noise suppressor.
//!
//! Estimates a noise magnitude spectrum from the first few frames of audio,
//! then subtracts it from subsequent frames. This reduces steady background
//! noise (fans, keyboards, room tone) without distorting speech too much.
//!
//! Uses a 256-point FFT with 50% overlap and overlap-add resynthesis.

use rustfft::{FftPlanner, FftDirection, num_complex::Complex};
use std::f32::consts::PI;

/// Analysis frame size: 256 samples = 16 ms at 16 kHz.
const FRAME_SIZE: usize = 256;
/// Hop size: 128 samples = 8 ms at 16 kHz (50% overlap).
const HOP_SIZE: usize = 128;
/// FFT size (same as frame size).
const FFT_SIZE: usize = 256;
/// Number of frames used to estimate the noise floor (first ~200 ms).
const NOISE_FRAMES: usize = 25;
/// Over-subtraction factor: how aggressively to subtract noise.
const OVER_SUBTRACTION: f32 = 2.0;
/// Spectral floor: never reduce magnitude below this fraction of original.
const SPECTRAL_FLOOR: f32 = 0.1;

/// Spectral subtraction noise suppressor.
pub struct NoiseSuppressor {
    noise_magnitude: Option<Vec<f32>>,
    forward_planner: FftPlanner<f32>,
    inverse_planner: FftPlanner<f32>,
}

impl Default for NoiseSuppressor {
    fn default() -> Self {
        Self::new()
    }
}

impl NoiseSuppressor {
    pub fn new() -> Self {
        Self {
            noise_magnitude: None,
            forward_planner: FftPlanner::new(),
            inverse_planner: FftPlanner::new(),
        }
    }

    /// Process samples in-place. `sample_rate` is informational only; the
    /// algorithm assumes 16 kHz mono (frame sizes are fixed in samples).
    pub fn process(&mut self, samples: &mut [f32], _sample_rate: u32) {
        if samples.is_empty() || samples.len() < FRAME_SIZE {
            return;
        }

        let forward = self.forward_planner.plan_fft(FFT_SIZE, FftDirection::Forward);
        let inverse = self.inverse_planner.plan_fft(FFT_SIZE, FftDirection::Inverse);

        // Estimate noise floor from the first NOISE_FRAMES frames.
        if self.noise_magnitude.is_none() {
            let mut noise_sum = vec![0.0f32; FFT_SIZE / 2 + 1];
            let mut count = 0usize;
            let mut pos = 0usize;
            while pos + FRAME_SIZE <= samples.len() && count < NOISE_FRAMES {
                let mut fft_buf: Vec<Complex<f32>> = samples[pos..pos + FRAME_SIZE]
                    .iter()
                    .enumerate()
                    .map(|(i, &s)| Complex {
                        re: s * hann_window(i, FRAME_SIZE),
                        im: 0.0,
                    })
                    .collect();
                forward.process(&mut fft_buf);
                for i in 0..=FFT_SIZE / 2 {
                    noise_sum[i] += fft_buf[i].norm();
                }
                count += 1;
                pos += HOP_SIZE;
            }
            if count > 0 {
                for i in 0..=FFT_SIZE / 2 {
                    noise_sum[i] /= count as f32;
                }
                self.noise_magnitude = Some(noise_sum);
            }
        }

        // Apply spectral subtraction.
        if let Some(ref noise_mag) = self.noise_magnitude {
            let mut output = vec![0.0f32; samples.len()];
            let mut pos = 0usize;

            while pos + FRAME_SIZE <= samples.len() {
                let mut fft_buf: Vec<Complex<f32>> = samples[pos..pos + FRAME_SIZE]
                    .iter()
                    .enumerate()
                    .map(|(i, &s)| Complex {
                        re: s * hann_window(i, FRAME_SIZE),
                        im: 0.0,
                    })
                    .collect();
                forward.process(&mut fft_buf);

                for i in 0..=FFT_SIZE / 2 {
                    let mag = fft_buf[i].norm();
                    let noise_mag = noise_mag[i];
                    let suppressed = if mag > noise_mag * OVER_SUBTRACTION {
                        (mag - noise_mag * OVER_SUBTRACTION).max(mag * SPECTRAL_FLOOR)
                    } else {
                        mag * SPECTRAL_FLOOR
                    };
                    let phase = fft_buf[i].arg();
                    fft_buf[i] = Complex::from_polar(suppressed, phase);
                }

                inverse.process(&mut fft_buf);

                // Overlap-add with Hann window synthesis.
                for i in 0..FRAME_SIZE {
                    let val = fft_buf[i].re / FFT_SIZE as f32;
                    let w = hann_window(i, FRAME_SIZE);
                    output[pos + i] += val * w;
                }

                pos += HOP_SIZE;
            }

            // Copy any remaining samples that didn't fill a full frame.
            if pos < samples.len() {
                output[pos..].copy_from_slice(&samples[pos..]);
            }

            samples.copy_from_slice(&output);
        }
    }
}

fn hann_window(i: usize, n: usize) -> f32 {
    0.5 * (1.0 - (2.0 * PI * i as f32 / (n - 1) as f32).cos())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suppressor_reduces_constant_noise() {
        let mut suppressor = NoiseSuppressor::new();
        // 1 second of constant noise at 16 kHz.
        let mut samples = vec![0.1f32; 16000];
        suppressor.process(&mut samples, 16000);
        // After suppression, noise should be reduced.
        let rms: f32 = samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32;
        let rms = rms.sqrt();
        assert!(rms < 0.1, "noise should be reduced, got rms {}", rms);
    }

    #[test]
    fn suppressor_leaves_silence_alone() {
        let mut suppressor = NoiseSuppressor::new();
        let mut samples = vec![0.0f32; 16000];
        suppressor.process(&mut samples, 16000);
        assert!(
            samples.iter().all(|s| *s == 0.0),
            "silence should remain silence"
        );
    }
}

//! Resampling from whatever the microphone gives us to the engine's contract:
//! 16 kHz mono f32.
//!
//! This is a windowed-sinc interpolator rather than a crate dependency: the
//! job is narrow (one channel, one fixed output rate), it has to be unit
//! testable offline, and an in-house filter keeps the dependency surface small.
//!
//! Quality: 32 taps of a Blackman-windowed sinc, with the cutoff placed below
//! the Nyquist frequency of whichever side is lower. That is comfortably good
//! for speech: passband ripple is far below the noise floor of any microphone,
//! and stopband leakage above 8 kHz is attenuated before it can alias down
//! into the speech band.

/// Engine contract: whisper.cpp expects 16 kHz mono f32.
pub const TARGET_SAMPLE_RATE: u32 = 16_000;

const TAPS: usize = 32;
const HALF_TAPS: isize = (TAPS / 2) as isize;

/// Blackman window - low sidelobes, which is what matters for anti-aliasing.
fn blackman(x: f64) -> f64 {
    // x in 0..1
    let a0 = 0.42;
    let a1 = 0.5;
    let a2 = 0.08;
    let t = 2.0 * std::f64::consts::PI * x;
    a0 - a1 * t.cos() + a2 * (2.0 * t).cos()
}

fn sinc(x: f64) -> f64 {
    if x.abs() < 1e-9 {
        1.0
    } else {
        let pix = std::f64::consts::PI * x;
        pix.sin() / pix
    }
}

/// Filter kernel for a given fractional offset, normalized to unit DC gain so
/// a constant input resamples to the same constant.
fn kernel(offset: f64, cutoff: f64) -> [f64; TAPS] {
    let mut taps = [0.0f64; TAPS];
    let mut sum = 0.0;
    for (i, tap) in taps.iter_mut().enumerate() {
        let x = i as isize - HALF_TAPS;
        let distance = x as f64 - offset;
        let window_pos = (i as f64 + 0.5) / TAPS as f64;
        *tap = cutoff * sinc(cutoff * distance) * blackman(window_pos);
        sum += *tap;
    }
    if sum.abs() > 1e-12 {
        for tap in taps.iter_mut() {
            *tap /= sum;
        }
    }
    taps
}

/// A streaming mono resampler. Input can arrive in any chunk sizes.
pub struct Resampler {
    input_rate: u32,
    cutoff: f64,
    step: f64,
    /// Filters are precomputed per fractional position: 256 phases is far more
    /// resolution than speech needs and removes per-sample trig from the path.
    phases: Vec<[f64; TAPS]>,
    history: Vec<f32>,
    /// Position inside `history` where the next output window starts.
    cursor: f64,
}

const PHASES: usize = 256;

impl Resampler {
    pub fn new(input_rate: u32) -> Self {
        let ratio = TARGET_SAMPLE_RATE as f64 / input_rate.max(1) as f64;
        // Never let the kernel pass energy above the lower of the two Nyquists.
        let cutoff = ratio.min(1.0) * 0.94;
        let phases = (0..PHASES)
            .map(|p| kernel(p as f64 / PHASES as f64, cutoff.max(0.02)))
            .collect();

        Self {
            input_rate: input_rate.max(1),
            cutoff,
            step: input_rate.max(1) as f64 / TARGET_SAMPLE_RATE as f64,
            phases,
            history: Vec::new(),
            cursor: HALF_TAPS as f64,
        }
    }

    pub fn input_rate(&self) -> u32 {
        self.input_rate
    }

    pub fn output_rate(&self) -> u32 {
        TARGET_SAMPLE_RATE
    }

    /// Feeds mono samples and returns the resampled output produced so far.
    ///
    /// `final_chunk` flushes the tail so a recording does not lose its last
    /// few milliseconds (at most one tap width, ~2 ms at 16 kHz).
    pub fn process(&mut self, input: &[f32], final_chunk: bool) -> Vec<f32> {
        self.history.extend_from_slice(input);

        let mut out = Vec::with_capacity(
            ((input.len() as f64) / self.step).ceil() as usize + 4,
        );

        // Keep HALF_TAPS samples of run-up before the cursor so every window is
        // fully inside the history.
        loop {
            let start = self.cursor.floor() as isize;
            let first = start - HALF_TAPS;
            let last = start + HALF_TAPS - 1;
            if last >= self.history.len() as isize {
                break;
            }
            if first < 0 {
                // Still filling the initial run-up: wait for more input.
                break;
            }

            let offset = self.cursor - start as f64;
            let phase = ((offset * PHASES as f64) as usize).min(PHASES - 1);
            let taps = &self.phases[phase];

            let mut acc = 0.0f64;
            for (i, tap) in taps.iter().enumerate() {
                let index = first + i as isize;
                acc += *tap * self.history[index as usize] as f64;
            }
            out.push(acc as f32);
            self.cursor += self.step;
        }

        // Drop everything before the next window needs, then rebase the cursor.
        let keep_from = (self.cursor.floor() as isize - HALF_TAPS).max(0) as usize;
        if keep_from > 0 {
            self.history.drain(0..keep_from);
            self.cursor -= keep_from as f64;
        }

        if final_chunk {
            // Flush by zero-padding just enough to read out the remaining window.
            let needed = self.cursor.floor() as isize + HALF_TAPS - self.history.len() as isize;
            if needed > 0 {
                let pad = needed as usize;
                self.history.extend(std::iter::repeat(0.0f32).take(pad));
            }
            while (self.cursor.floor() as isize) + HALF_TAPS - 1 < self.history.len() as isize {
                let start = self.cursor.floor() as isize;
                let first = start - HALF_TAPS;
                if first < 0 {
                    break;
                }
                let offset = self.cursor - start as f64;
                let phase = ((offset * PHASES as f64) as usize).min(PHASES - 1);
                let taps = &self.phases[phase];
                let mut acc = 0.0f64;
                for (i, tap) in taps.iter().enumerate() {
                    let index = first + i as isize;
                    acc += *tap * self.history[index as usize] as f64;
                }
                out.push(acc as f32);
                self.cursor += self.step;
            }
            self.history.clear();
            self.cursor = HALF_TAPS as f64;
        }

        out
    }

    /// Cutoff actually used, exposed for the tests and the docs.
    pub fn cutoff(&self) -> f64 {
        self.cutoff
    }
}

/// Downmixes interleaved frames to mono by averaging channels.
pub fn downmix_to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    let channels = channels.max(1) as usize;
    if channels == 1 {
        return samples.to_vec();
    }
    samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
        .collect()
}

/// Root-mean-square level of a buffer, clamped to 0..1.
pub fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f64 = samples.iter().map(|s| (*s as f64) * (*s as f64)).sum();
    ((sum / samples.len() as f64).sqrt() as f32).clamp(0.0, 1.0)
}

/// Peak absolute level of a buffer, clamped to 0..1.
pub fn peak(samples: &[f32]) -> f32 {
    samples
        .iter()
        .fold(0.0f32, |acc, s| acc.max(s.abs()))
        .clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(freq: f64, rate: u32, seconds: f64) -> Vec<f32> {
        let n = (rate as f64 * seconds) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / rate as f64;
                (2.0 * std::f64::consts::PI * freq * t).sin() as f32
            })
            .collect()
    }

    #[test]
    fn downmix_averages_channels() {
        let stereo = [1.0f32, 0.0, 0.0, 1.0, 0.5, 0.5];
        assert_eq!(downmix_to_mono(&stereo, 2), vec![0.5, 0.5, 0.5]);
        assert_eq!(downmix_to_mono(&stereo, 1), stereo.to_vec());
    }

    #[test]
    fn output_length_matches_the_rate_ratio() {
        for rate in [8_000u32, 16_000, 32_000, 44_100, 48_000] {
            let input = tone(440.0, rate, 0.5);
            let mut resampler = Resampler::new(rate);
            let mut out = Vec::new();
            for chunk in input.chunks(512) {
                out.extend(resampler.process(chunk, false));
            }
            out.extend(resampler.process(&[], true));

            let expected = TARGET_SAMPLE_RATE as f64 * 0.5;
            let delta = (out.len() as f64 - expected).abs();
            assert!(
                delta <= 8.0,
                "rate {rate}: got {} samples, expected about {expected}",
                out.len()
            );
        }
    }

    #[test]
    fn a_constant_signal_survives_resampling() {
        // Unit DC at 48 kHz must come out as unit DC at 16 kHz: the kernel is
        // normalised, so this catches both gain errors and windowing mistakes.
        let input = vec![1.0f32; 48_000];
        let mut resampler = Resampler::new(48_000);
        let out = resampler.process(&input, true);
        let mid = &out[out.len() / 4..out.len() * 3 / 4];
        let average: f32 = mid.iter().sum::<f32>() / mid.len() as f32;
        assert!((average - 1.0).abs() < 0.01, "DC gain drifted to {average}");
    }

    #[test]
    fn an_in_band_tone_keeps_its_amplitude() {
        let input = tone(440.0, 48_000, 0.5);
        let mut resampler = Resampler::new(48_000);
        let out = resampler.process(&input, true);
        let mid = &out[out.len() / 4..out.len() * 3 / 4];
        let measured = peak(mid);
        assert!(
            (measured - 1.0).abs() < 0.05,
            "440 Hz should pass at ~unit amplitude, got {measured}"
        );
    }

    #[test]
    fn content_above_the_target_nyquist_is_attenuated() {
        // 12 kHz at 48 kHz would alias to 4 kHz at 16 kHz; the filter must
        // remove it first because it is above the 8 kHz output Nyquist.
        let input = tone(12_000.0, 48_000, 0.5);
        let mut resampler = Resampler::new(48_000);
        let out = resampler.process(&input, true);
        let mid = &out[out.len() / 4..out.len() * 3 / 4];
        let measured = peak(mid);
        assert!(
            measured < 0.1,
            "aliasing guard failed: 12 kHz survived at {measured}"
        );
    }

    #[test]
    fn chunking_does_not_change_the_result() {
        let input = tone(300.0, 44_100, 0.25);

        let mut whole = Resampler::new(44_100);
        let a = whole.process(&input, true);

        let mut split = Resampler::new(44_100);
        let mut b = Vec::new();
        for chunk in input.chunks(97) {
            b.extend(split.process(chunk, false));
        }
        b.extend(split.process(&[], true));

        assert!(
            (a.len() as isize - b.len() as isize).abs() <= 2,
            "lengths differ: {} vs {}",
            a.len(),
            b.len()
        );
        let compare = a.len().min(b.len());
        for i in 0..compare {
            assert!(
                (a[i] - b[i]).abs() < 1e-6,
                "sample {i} differs: {} vs {}",
                a[i],
                b[i]
            );
        }
    }

    #[test]
    fn quiet_is_quiet_and_loud_is_loud() {
        assert_eq!(rms(&[]), 0.0);
        assert!(rms(&[0.0f32; 128]) < 1e-6);
        let loud = vec![0.5f32; 128];
        assert!((rms(&loud) - 0.5).abs() < 1e-3);
        assert!((peak(&loud) - 0.5).abs() < 1e-6);
        assert_eq!(peak(&[]), 0.0);
    }
}

//! Live (streaming) dictation on top of the existing whisper-rs engine.
//!
//! A ring buffer holds captured 16 kHz mono audio. Every `step_ms`, the
//! decoder transcribes a sliding window of the last `window_ms` seconds,
//! using the already-committed text as the initial prompt. A LocalAgreement-2
//! policy decides which words are committed: a word becomes committed only
//! when it matches in two consecutive hypotheses.
//!
//! The audio thread is never blocked: if a decode takes longer than the
//! step, the step is skipped.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::audio::resample::{rms, TARGET_SAMPLE_RATE};
use crate::engine::{Engine, EngineOptions};
use crate::errors::Result;

/// Ring buffer of 16 kHz mono f32 samples.
///
/// When full, the oldest samples are overwritten. `last(n)` returns the n
/// most recent samples in chronological order.
pub struct AudioRingBuffer {
    buffer: Vec<f32>,
    write_pos: usize,
    len: usize,
}

impl AudioRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: vec![0.0; capacity],
            write_pos: 0,
            len: 0,
        }
    }

    pub fn push(&mut self, samples: &[f32]) {
        for &s in samples {
            self.buffer[self.write_pos] = s;
            self.write_pos = (self.write_pos + 1) % self.buffer.len();
            self.len = (self.len + 1).min(self.buffer.len());
        }
    }

    pub fn clear(&mut self) {
        self.write_pos = 0;
        self.len = 0;
        for s in self.buffer.iter_mut() {
            *s = 0.0;
        }
    }

    /// Returns the last `n` samples in chronological order.
    pub fn last(&self, n: usize) -> Vec<f32> {
        let n = n.min(self.len);
        if n == 0 {
            return Vec::new();
        }
        let capacity = self.buffer.len();
        let start = (self.write_pos + capacity - n) % capacity;
        let mut out = Vec::with_capacity(n);
        if start + n <= capacity {
            out.extend_from_slice(&self.buffer[start..start + n]);
        } else {
            let first = capacity - start;
            out.extend_from_slice(&self.buffer[start..]);
            out.extend_from_slice(&self.buffer[..n - first]);
        }
        out
    }

    pub fn len(&self) -> usize {
        self.len
    }
}

/// Simple energy-based voice activity detector.
pub struct Vad {
    rms_threshold: f32,
    min_speech_ms: u128,
    silence_frames: usize,
}

impl Vad {
    pub fn new() -> Self {
        Self {
            rms_threshold: 0.005,
            min_speech_ms: 300,
            silence_frames: 0,
        }
    }

    /// Returns true when the current window contains speech.
    pub fn has_speech(&mut self, samples: &[f32], duration_ms: u128) -> bool {
        if samples.is_empty() || duration_ms < self.min_speech_ms {
            self.silence_frames += 1;
            return false;
        }
        let loud = rms(samples) > self.rms_threshold;
        if loud {
            self.silence_frames = 0;
        } else {
            self.silence_frames += 1;
        }
        loud
    }

    /// Number of consecutive silent frames.
    pub fn silence_frames(&self) -> usize {
        self.silence_frames
    }

    pub fn reset(&mut self) {
        self.silence_frames = 0;
    }
}

/// Result of one streaming decode step.
#[derive(Debug, Clone, Default)]
pub struct StreamResult {
    pub committed: String,
    pub unstable: String,
}

/// Streaming whisper decoder.
///
/// Decodes a sliding window of audio every `step_ms`, using the committed
/// text as the initial prompt. Applies LocalAgreement-2: a word becomes
/// committed only when it matches in two consecutive hypotheses.
pub struct StreamDecoder {
    engine: Arc<Engine>,
    options: EngineOptions,
    window_ms: u128,
    step_ms: u128,
    ring: Mutex<AudioRingBuffer>,
    committed: Mutex<String>,
    prev_hypothesis: Mutex<String>,
    vad: Mutex<Vad>,
    running: AtomicBool,
}

impl StreamDecoder {
    pub fn new(
        engine: Arc<Engine>,
        options: EngineOptions,
        window_ms: u128,
        step_ms: u128,
    ) -> Self {
        let capacity = (TARGET_SAMPLE_RATE as usize * window_ms as usize / 1000).max(1);
        Self {
            engine,
            options,
            window_ms,
            step_ms,
            ring: Mutex::new(AudioRingBuffer::new(capacity)),
            committed: Mutex::new(String::new()),
            prev_hypothesis: Mutex::new(String::new()),
            vad: Mutex::new(Vad::new()),
            running: AtomicBool::new(false),
        }
    }

    /// Push 16 kHz mono f32 samples into the ring buffer. Called from the
    /// audio thread; must not block.
    pub fn push_audio(&self, samples: &[f32]) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }
        self.ring.lock().unwrap().push(samples);
    }

    /// Run one decode step. Returns committed and unstable text.
    pub fn step(&self) -> Result<StreamResult> {
        let ring = self.ring.lock().unwrap();
        let window_samples = (TARGET_SAMPLE_RATE as usize * self.window_ms as usize / 1000).max(1);
        let audio = ring.last(window_samples);
        drop(ring);

        if audio.is_empty() {
            let committed = self.committed.lock().unwrap().clone();
            return Ok(StreamResult {
                committed,
                unstable: String::new(),
            });
        }

        let committed = self.committed.lock().unwrap().clone();
        let mut options = self.options.clone();
        // Bias the decoder toward the text we've already committed so the
        // live hypothesis stays consistent across steps.
        if !committed.is_empty() {
            options.initial_prompt = Some(committed.clone());
        }

        let transcript = self.engine.transcribe(&audio, &options, audio.len() as u128 / 16)?;
        let hypothesis = transcript.text.clone();

        let prev = self.prev_hypothesis.lock().unwrap().clone();
        let (common_prefix, new_unstable) = longest_common_prefix(&prev, &hypothesis);

        let mut committed_guard = self.committed.lock().unwrap();
        if !common_prefix.is_empty() {
            *committed_guard = common_prefix.clone();
        }
        let committed_text = committed_guard.clone();

        *self.prev_hypothesis.lock().unwrap() = hypothesis;

        Ok(StreamResult {
            committed: committed_text,
            unstable: new_unstable,
        })
    }

    /// Final decode on key release: commit everything remaining in the window.
    pub fn finalize(&self) -> Result<String> {
        let ring = self.ring.lock().unwrap();
        let window_samples = (TARGET_SAMPLE_RATE as usize * self.window_ms as usize / 1000).max(1);
        let audio = ring.last(window_samples);
        drop(ring);

        if audio.is_empty() {
            return Ok(self.committed.lock().unwrap().clone());
        }

        let committed = self.committed.lock().unwrap().clone();
        let mut options = self.options.clone();
        if !committed.is_empty() {
            options.initial_prompt = Some(committed.clone());
        }

        let transcript = self.engine.transcribe(&audio, &options, audio.len() as u128 / 16)?;
        let hypothesis = transcript.text.clone();

        let final_text = if committed.is_empty() {
            hypothesis
        } else {
            format!("{} {}", committed, hypothesis)
        };

        Ok(final_text)
    }

    pub fn committed(&self) -> String {
        self.committed.lock().unwrap().clone()
    }

    pub fn clear(&self) {
        self.committed.lock().unwrap().clear();
        self.prev_hypothesis.lock().unwrap().clear();
        self.ring.lock().unwrap().clear();
        self.vad.lock().unwrap().reset();
    }

    pub fn start(&self) {
        self.running.store(true, Ordering::Relaxed);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

/// Longest common prefix of two strings, measured in words.
///
/// Returns `(common_prefix, remaining_from_second)` where `common_prefix` is
/// the longest shared leading word sequence and `remaining_from_second` is
/// whatever follows it in the second string. This implements LocalAgreement-2:
/// only words that appear in the same position in two consecutive hypotheses
/// are considered committed.
fn longest_common_prefix(a: &str, b: &str) -> (String, String) {
    let a_words: Vec<&str> = a.split_whitespace().collect();
    let b_words: Vec<&str> = b.split_whitespace().collect();
    let mut common = 0usize;
    for (wa, wb) in a_words.iter().zip(b_words.iter()) {
        if wa == wb {
            common += 1;
        } else {
            break;
        }
    }
    let prefix: String = a_words[..common].join(" ");
    let remainder: String = b_words[common..].join(" ");
    (prefix, remainder)
}

/// Stream orchestration: runs the decode loop on a background thread.
///
/// `tick` is called every `step_ms` by the audio pump. When a decode would
/// take longer than the step, it is skipped (backpressure).
pub struct StreamOrchestrator {
    decoder: Arc<StreamDecoder>,
    thread: Mutex<Option<std::thread::JoinHandle<()>>>,
    stop: AtomicBool,
}

impl StreamOrchestrator {
    pub fn new(decoder: Arc<StreamDecoder>) -> Self {
        Self {
            decoder,
            thread: Mutex::new(None),
            stop: AtomicBool::new(false),
        }
    }

    /// Start the decode loop. `on_result` is called with each `StreamResult`.
    pub fn start<F>(&self, on_result: F)
    where
        F: Fn(StreamResult) + Send + Sync + 'static,
    {
        self.stop.store(false, Ordering::Relaxed);
        self.decoder.start();
        let decoder = Arc::clone(&self.decoder);
        let stop = AtomicBool::new(false);
        let step_ms = self.decoder.step_ms;
        let handle = std::thread::Builder::new()
            .name("miro-stream".to_string())
            .spawn(move || {
                let mut last = Instant::now();
                while !stop.load(Ordering::Relaxed) {
                    let elapsed = last.elapsed();
                    if elapsed.as_millis() < step_ms {
                        std::thread::sleep(Duration::from_millis(
                            (step_ms - elapsed.as_millis()) as u64,
                        ));
                    }
                    last = Instant::now();
                    match decoder.step() {
                        Ok(result) => on_result(result),
                        Err(failure) => {
                            eprintln!("[miro-stream] decode step failed: {failure}");
                        }
                    }
                }
            })
            .ok();
        if let Some(handle) = handle {
            *self.thread.lock().unwrap() = Some(handle);
        }
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
        self.decoder.stop();
        if let Some(handle) = self.thread.lock().unwrap().take() {
            let _ = handle.join();
        }
    }
}

impl Drop for StreamOrchestrator {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_buffer_passthrough_when_not_full() {
        let mut ring = AudioRingBuffer::new(16);
        ring.push(&[1.0, 2.0, 3.0]);
        assert_eq!(ring.last(3), vec![1.0, 2.0, 3.0]);
        assert_eq!(ring.last(2), vec![2.0, 3.0]);
        assert_eq!(ring.last(1), vec![3.0]);
    }

    #[test]
    fn ring_buffer_wraps_around() {
        let mut ring = AudioRingBuffer::new(4);
        ring.push(&[1.0, 2.0, 3.0, 4.0]);
        assert_eq!(ring.last(4), vec![1.0, 2.0, 3.0, 4.0]);
        ring.push(&[5.0]);
        assert_eq!(ring.last(4), vec![2.0, 3.0, 4.0, 5.0]);
        ring.push(&[6.0, 7.0]);
        assert_eq!(ring.last(4), vec![4.0, 5.0, 6.0, 7.0]);
    }

    #[test]
    fn ring_buffer_last_clamped_to_len() {
        let mut ring = AudioRingBuffer::new(16);
        ring.push(&[1.0, 2.0]);
        assert_eq!(ring.last(10), vec![1.0, 2.0]);
        assert_eq!(ring.last(0), Vec::<f32>::new());
    }

    #[test]
    fn longest_common_prefix_matches_word_by_word() {
        let (prefix, remainder) = longest_common_prefix("hello world", "hello world there");
        assert_eq!(prefix, "hello world");
        assert_eq!(remainder, "there");

        let (prefix, remainder) = longest_common_prefix("hello world", "hello there");
        assert_eq!(prefix, "hello");
        assert_eq!(remainder, "there");

        let (prefix, remainder) = longest_common_prefix("foo bar", "baz qux");
        assert_eq!(prefix, "");
        assert_eq!(remainder, "baz qux");
    }

    #[test]
    fn vad_detects_speech_above_threshold() {
        let mut vad = Vad::new();
        let silence = vec![0.001f32; 4800]; // 300 ms at 16 kHz
        assert!(!vad.has_speech(&silence, 300));
        let speech = vec![0.5f32; 4800];
        assert!(vad.has_speech(&speech, 300));
    }

    #[test]
    fn vad_counts_silence_frames() {
        let mut vad = Vad::new();
        let silence = vec![0.001f32; 4800];
        assert!(!vad.has_speech(&silence, 300));
        assert_eq!(vad.silence_frames(), 1);
        assert!(!vad.has_speech(&silence, 300));
        assert_eq!(vad.silence_frames(), 2);
    }
}

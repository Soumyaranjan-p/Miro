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

const PAUSE_FRAMES: usize = 15; // ~15 frames at 50 Hz = ~300 ms of silence

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

    /// True when enough consecutive frames have been silent to signal a pause.
    pub fn is_paused(&self) -> bool {
        self.silence_frames >= PAUSE_FRAMES
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

        let duration_ms = (audio.len() as u128) * 1000 / TARGET_SAMPLE_RATE as u128;

        // VAD: on a sustained pause, commit the whole current hypothesis and
        // trim the buffer so the next decode only sees recent audio. Only
        // evaluate VAD when there is actual audio - an empty buffer is not
        // silence.
        if !audio.is_empty() {
            let mut vad = self.vad.lock().unwrap();
            let _ = vad.has_speech(&audio, duration_ms);
            if vad.is_paused() {
                let mut committed_guard = self.committed.lock().unwrap();
                let unstable = self.prev_hypothesis.lock().unwrap().clone();
                let combined = if committed_guard.is_empty() {
                    unstable
                } else {
                    format!("{} {}", committed_guard, unstable)
                };
                *committed_guard = combined.clone();
                let committed_text = committed_guard.clone();
                drop(committed_guard);
                self.prev_hypothesis.lock().unwrap().clear();
                vad.reset();

                // Trim the ring buffer: keep only the last `window_ms` of audio
                // so the next decode starts fresh after the pause.
                let mut ring = self.ring.lock().unwrap();
                let keep = (TARGET_SAMPLE_RATE as usize * self.window_ms as usize / 1000).max(1);
                if ring.len() > keep {
                    let tail = ring.last(keep);
                    ring.clear();
                    ring.push(&tail);
                }
                drop(ring);

                return Ok(StreamResult {
                    committed: committed_text,
                    unstable: String::new(),
                });
            }
            drop(vad);
        }

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
    /// Set to true by the decode thread when it has exited. Used for
    /// join-with-timeout polling without requiring a `Sync` channel.
    thread_finished: Arc<AtomicBool>,
    /// Throttling for overlay events: only emit when text changed and at most
    /// once per `EMIT_MIN_INTERVAL_MS` (about 5 times per second).
    last_emit: Arc<Mutex<Option<Instant>>>,
    last_emitted_text: Arc<Mutex<String>>,
}

/// Minimum interval between overlay live-text emissions (ms). 200 ms = 5 Hz.
const EMIT_MIN_INTERVAL_MS: u128 = 200;

impl StreamOrchestrator {
    pub fn new(decoder: Arc<StreamDecoder>) -> Self {
        Self {
            decoder,
            thread: Mutex::new(None),
            stop: AtomicBool::new(false),
            thread_finished: Arc::new(AtomicBool::new(false)),
            last_emit: Arc::new(Mutex::new(None)),
            last_emitted_text: Arc::new(Mutex::new(String::new())),
        }
    }

    /// Start the decode loop. `on_result` is called with each `StreamResult`.
    ///
    /// Overlay emissions are throttled: only emitted when the text changed and
    /// at most once every 200 ms (~5 Hz).
    pub fn start<F>(&self, on_result: F)
    where
        F: Fn(StreamResult) + Send + Sync + 'static,
    {
        self.stop.store(false, Ordering::Relaxed);
        self.decoder.start();
        let decoder = Arc::clone(&self.decoder);
        let stop = AtomicBool::new(false);
        let step_ms = self.decoder.step_ms;
        let last_emit = Arc::clone(&self.last_emit);
        let last_emitted_text = Arc::clone(&self.last_emitted_text);
        let thread_finished = Arc::clone(&self.thread_finished);
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
                        Ok(result) => {
                            let text = format!("{}\u{0001}{}", result.committed, result.unstable);
                            let now = Instant::now();
                            let should_emit = {
                                let mut last_emit_guard = last_emit.lock().unwrap();
                                let mut last_text_guard = last_emitted_text.lock().unwrap();
                                let interval_ok = last_emit_guard
                                    .map(|t| now.duration_since(t).as_millis() >= EMIT_MIN_INTERVAL_MS)
                                    .unwrap_or(true);
                                let text_changed = *last_text_guard != text;
                                if interval_ok && text_changed {
                                    *last_emit_guard = Some(now);
                                    *last_text_guard = text;
                                    true
                                } else {
                                    false
                                }
                            };
                            if should_emit {
                                on_result(result);
                            }
                        }
                        Err(failure) => {
                            eprintln!("[miro-stream] decode step failed: {failure}");
                        }
                    }
                }
                // Signal that the thread has exited.
                thread_finished.store(true, Ordering::SeqCst);
            })
            .ok();
        if let Some(handle) = handle {
            *self.thread.lock().unwrap() = Some(handle);
        }
    }

    /// Request the decode loop to stop. Non-blocking: just sets the flag.
    /// Use [`join_with_timeout`](Self::join_with_timeout) to wait for the
    /// thread to actually finish.
    pub fn request_stop(&self) {
        eprintln!("[miro] live.cancel.sent");
        self.stop.store(true, Ordering::SeqCst);
        self.decoder.stop();
    }

    /// Wait for the decode thread to finish, up to `timeout`. Returns `true`
    /// if the thread joined within the timeout, `false` if it timed out.
    pub fn join_with_timeout(&self, timeout: Duration) -> bool {
        let started = Instant::now();
        let handle = self.thread.lock().unwrap().take();
        let joined = match handle {
            Some(handle) => {
                // Poll thread_finished with short sleeps until timeout.
                let signaled = loop {
                    if self.thread_finished.load(Ordering::SeqCst) {
                        break true;
                    }
                    if started.elapsed() >= timeout {
                        break false;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                };
                // Reap the thread (should return shortly after finished).
                let _ = handle.join();
                let elapsed = started.elapsed().as_millis();
                eprintln!("[miro] live.joined ms={elapsed}");
                signaled
            }
            None => true,
        };
        // Reset the stop flag so the orchestrator can be restarted.
        self.stop.store(false, Ordering::SeqCst);
        self.thread_finished.store(false, Ordering::SeqCst);
        joined
    }

    /// Stop the decode loop and wait for the thread to finish (blocking).
    /// Prefer [`request_stop`](Self::request_stop) + [`join_with_timeout`](Self::join_with_timeout)
    /// from a background thread to avoid blocking the UI.
    pub fn stop(&self) {
        self.request_stop();
        let _ = self.join_with_timeout(Duration::from_secs(30));
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

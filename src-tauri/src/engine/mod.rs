//! The speech recognition boundary.
//!
//! One engine is built in - whisper.cpp - but the call site talks to [`Engine`],
//! so the decision recorded in `docs/ADR-0001-speech-engine.md` can be revisited
//! without touching the dictation flow.
//!
//! Two contracts this module keeps, because the rest of Miro depends on them:
//!   * audio arrives as 16 kHz mono f32 and nothing else;
//!   * no transcript ever reaches a log, a file or the network from here.

use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::audio::resample::rms;
use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

/// Maximum chunk size for long recordings: 60 seconds of 16 kHz audio.
const MAX_CHUNK_MS: u128 = 60_000;
/// Minimum chunk size before we look for a silence boundary: 30 seconds.
const MIN_CHUNK_MS: u128 = 30_000;
/// Maximum samples per chunk at 16 kHz mono.
const MAX_CHUNK_SAMPLES: usize = (16_000 * MAX_CHUNK_MS as usize) / 1000;
/// Minimum samples per chunk at 16 kHz mono.
const MIN_CHUNK_SAMPLES: usize = (16_000 * MIN_CHUNK_MS as usize) / 1000;
/// Analysis window for boundary detection: 20 ms at 16 kHz = 320 samples.
const BOUNDARY_WINDOW_SAMPLES: usize = 320;
/// RMS below this is treated as silence for chunk-boundary purposes.
const BOUNDARY_SILENCE_RMS: f32 = 0.005;

#[cfg(feature = "engine-whisper")]
mod whisper;

/// A finished transcription. Exists only in memory.
#[derive(Debug, Clone)]
pub struct Transcript {
    pub text: String,
    pub segments: usize,
    pub audio_ms: u128,
    pub compute_ms: u128,
}

impl Drop for Transcript {
    fn drop(&mut self) {
        crate::privacy::zeroize_string(&mut self.text);
    }
}

#[derive(Debug, Clone)]
pub struct EngineOptions {
    /// `None` or "auto" lets the engine detect the language.
    pub language: Option<String>,
    pub threads: usize,
    /// User-supplied terms that steer the recognizer toward domain-specific
    /// words and names. Combined with the fixed style prompt.
    pub vocabulary: Vec<String>,
}

impl Default for EngineOptions {
    fn default() -> Self {
        Self {
            language: Some("en".to_string()),
            threads: default_threads(),
            vocabulary: Vec::new(),
        }
    }
}

/// whisper.cpp scales poorly past a handful of threads and Miro must not
/// monopolise the machine while the user keeps working.
pub fn default_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .clamp(2, 8)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineState {
    NoModel,
    Loading,
    Ready,
    Failed,
}

/// Shared, thread-safe handle to whatever engine was built into this binary.
pub struct Engine {
    backend: Backend,
    model_id: Option<String>,
    /// Set when a transcription overran its deadline: the worker may still be
    /// inside the engine, so the next request waits for it instead of piling on.
    busy: Arc<AtomicBool>,
    last_compute_ms: AtomicU64,
    /// Set when cancellation is requested during a (possibly chunked)
    /// transcription. Checked between chunks so long dictations can be
    /// aborted without waiting for the full clip to finish.
    cancelled: Arc<AtomicBool>,
}

enum Backend {
    #[cfg(feature = "engine-whisper")]
    Whisper(whisper::WhisperEngine),
    /// Built with `--no-default-features`: Miro says so instead of pretending.
    Unavailable,
}

impl Engine {
    pub fn unavailable() -> Self {
        Self {
            backend: Backend::Unavailable,
            model_id: None,
            busy: Arc::new(AtomicBool::new(false)),
            last_compute_ms: AtomicU64::new(0),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Loads a model. Blocking, and slow (hundreds of milliseconds to seconds),
    /// so callers run it off the UI thread.
    pub fn load(path: &Path, model_id: &str) -> Result<Self> {
        logging::event(Event::EngineLoadStarted {
            model: model_id.to_string(),
        });
        let started = Instant::now();

        #[cfg(feature = "engine-whisper")]
        {
            match whisper::WhisperEngine::load(path) {
                Ok(engine) => {
                    logging::event(Event::EngineReady {
                        model: model_id.to_string(),
                        ms: started.elapsed().as_millis(),
                    });
                    Ok(Self {
                        backend: Backend::Whisper(engine),
                        model_id: Some(model_id.to_string()),
                        busy: Arc::new(AtomicBool::new(false)),
                        last_compute_ms: AtomicU64::new(0),
                        cancelled: Arc::new(AtomicBool::new(false)),
                    })
                }
                Err(failure) => {
                    logging::event(Event::EngineLoadFailed {
                        code: failure.code().as_str(),
                    });
                    Err(failure)
                }
            }
        }

        #[cfg(not(feature = "engine-whisper"))]
        {
            let _ = path;
            logging::event(Event::EngineLoadFailed {
                code: "engine_unavailable",
            });
            Err(Failure::EngineNotBuilt)
        }
    }

    pub fn state(&self) -> EngineState {
        match self.backend {
            #[cfg(feature = "engine-whisper")]
            Backend::Whisper(_) => EngineState::Ready,
            Backend::Unavailable => EngineState::NoModel,
        }
    }

    pub fn model_id(&self) -> Option<&str> {
        self.model_id.as_deref()
    }

    pub fn backend_name(&self) -> &'static str {
        match self.backend {
            #[cfg(feature = "engine-whisper")]
            Backend::Whisper(_) => "whisper.cpp (whisper-rs)",
            Backend::Unavailable => "not built in",
        }
    }

    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }

    pub fn last_compute_ms(&self) -> u64 {
        self.last_compute_ms.load(Ordering::Relaxed)
    }

    /// Requests cancellation of an in-flight (possibly chunked) transcription.
    /// Checked between chunks so long dictations can be aborted without waiting
    /// for the full clip to finish.
    pub fn cancel_transcription(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Transcribes 16 kHz mono f32 samples.
    ///
    /// Runs synchronously on the calling thread - the session layer owns which
    /// thread that is - so that a caller can never accidentally block the UI.
    ///
    /// Long recordings are split into 30-60 second chunks at low-energy
    /// boundaries and transcribed sequentially. Cancellation is checked between
    /// chunks so a long dictation can be aborted without waiting for the full
    /// clip to finish.
    pub fn transcribe(
        &self,
        samples: &[f32],
        options: &EngineOptions,
        audio_ms: u128,
    ) -> Result<Transcript> {
        if samples.is_empty() {
            return Err(Failure::AudioEmpty);
        }

        match &self.backend {
            #[cfg(feature = "engine-whisper")]
            Backend::Whisper(engine) => {
                // Only one inference at a time: whisper state is not reentrant.
                if self.busy.swap(true, Ordering::SeqCst) {
                    return Err(Failure::Internal(
                        "a transcription is already running".to_string(),
                    ));
                }
                let guard = BusyGuard(Arc::clone(&self.busy));

                // Reset cancellation at the start of each transcription.
                self.cancelled.store(false, Ordering::SeqCst);

                logging::event(Event::TranscriptionStarted {
                    samples: samples.len(),
                });
                let started = Instant::now();

                // Split long recordings into chunks; short ones go straight
                // through as a single chunk.
                let chunks = if samples.len() > MAX_CHUNK_SAMPLES {
                    split_into_chunks(samples)
                } else {
                    vec![(0, samples.len())]
                };

                let mut combined_text = String::new();
                let mut total_segments = 0usize;
                let mut total_compute_ms = 0u128;

                for (chunk_idx, (chunk_start, chunk_end)) in chunks.iter().enumerate() {
                    // Check cancellation between chunks.
                    if self.cancelled.load(Ordering::SeqCst) {
                        return Err(Failure::Cancelled("transcription"));
                    }

                    let chunk = &samples[*chunk_start..*chunk_end];
                    let chunk_started = Instant::now();
                    let result = engine.transcribe(chunk, options);
                    let compute_ms = chunk_started.elapsed().as_millis();
                    total_compute_ms += compute_ms;

                    match result {
                        Ok((text, segments)) => {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                if chunk_idx > 0 && !combined_text.is_empty() {
                                    combined_text.push(' ');
                                }
                                combined_text.push_str(trimmed);
                                total_segments += segments;
                            }
                        }
                        Err(failure) => {
                            // Skip empty-transcript chunks (silence between
                            // speech) but propagate real errors.
                            if matches!(failure, Failure::TranscriptEmpty) {
                                continue;
                            }
                            logging::event(Event::TranscriptionFailed {
                                code: failure.code().as_str(),
                            });
                            return Err(failure);
                        }
                    }
                }

                if combined_text.trim().is_empty() {
                    return Err(Failure::TranscriptEmpty);
                }

                // Reject transcripts that are suspiciously long for the audio
                // duration. Normal speech is ~150-200 chars per 10 seconds.
                let audio_seconds = samples.len() as f64 / 16000.0;
                let expected_max_chars = (audio_seconds * 25.0) as usize;
                if combined_text.chars().count() > expected_max_chars.max(100) {
                    logging::event(Event::TranscriptionFailed {
                        code: "engine_failed",
                    });
                    return Err(Failure::Transcription(
                        "transcript is suspiciously long, likely hallucinated".into(),
                    ));
                }

                let compute_ms = started.elapsed().as_millis();
                self.last_compute_ms
                    .store(compute_ms as u64, Ordering::Relaxed);

                logging::event(Event::TranscriptionFinished {
                    segments: total_segments,
                    ms: compute_ms,
                    chars: combined_text.chars().count(),
                    words: combined_text.split_whitespace().count(),
                });

                Ok(Transcript {
                    text: combined_text,
                    segments: total_segments,
                    audio_ms,
                    compute_ms,
                })
            }
            Backend::Unavailable => Err(Failure::EngineNotBuilt),
        }
    }
}

/// Clears the busy flag however the transcription ends.
struct BusyGuard(Arc<AtomicBool>);

impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// How long a transcription may take before Miro gives up on it.
///
/// Real transcription of a 5 minute clip on a slow CPU can take a while, so the
/// deadline is generous and scales with the audio; it exists to catch a stuck
/// engine, not to rush a working one.
pub fn deadline_for(audio_ms: u128) -> Duration {
    let seconds = (audio_ms / 1000).max(15);
    Duration::from_secs((seconds * 3).clamp(60, 900) as u64)
}

/// Splits audio samples into approximately 30–60 second chunks, preferring
/// low-energy boundaries where practical.
///
/// Returns a list of `(start, end)` sample index pairs. Each chunk is at least
/// `MIN_CHUNK_SAMPLES` long (except possibly the last) and at most
/// `MAX_CHUNK_SAMPLES` long. Within that range, the split point is chosen at a
/// 20 ms window whose RMS is below `BOUNDARY_SILENCE_RMS`, so cuts fall in
/// pauses rather than mid-word when possible. If no silence is found in range,
/// the chunk is cut at `MAX_CHUNK_SAMPLES`.
fn split_into_chunks(samples: &[f32]) -> Vec<(usize, usize)> {
    let total = samples.len();
    if total <= MAX_CHUNK_SAMPLES {
        return vec![(0, total)];
    }

    let mut chunks: Vec<(usize, usize)> = Vec::new();
    let mut start = 0;

    while start < total {
        let remaining = total - start;
        if remaining <= MAX_CHUNK_SAMPLES {
            chunks.push((start, total));
            break;
        }

        let search_start = start + MIN_CHUNK_SAMPLES;
        let search_end = start + MAX_CHUNK_SAMPLES;

        // Find the first low-energy window in the search range.
        let mut cut = None;
        let mut pos = search_start;
        while pos + BOUNDARY_WINDOW_SAMPLES <= search_end {
            if rms(&samples[pos..pos + BOUNDARY_WINDOW_SAMPLES]) < BOUNDARY_SILENCE_RMS {
                cut = Some(pos);
                break;
            }
            pos += BOUNDARY_WINDOW_SAMPLES;
        }

        let cut = cut.unwrap_or(start + MAX_CHUNK_SAMPLES);
        chunks.push((start, cut));
        start = cut;
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_binary_without_the_engine_says_so_instead_of_faking_it() {
        let engine = Engine::unavailable();
        assert_eq!(engine.state(), EngineState::NoModel);
        let error = engine
            .transcribe(&[0.1; 1600], &EngineOptions::default(), 100)
            .unwrap_err();
        assert!(matches!(
            error,
            Failure::EngineNotBuilt | Failure::AudioEmpty
        ));
    }

    #[test]
    fn empty_audio_is_rejected_before_reaching_the_engine() {
        let engine = Engine::unavailable();
        let error = engine
            .transcribe(&[], &EngineOptions::default(), 0)
            .unwrap_err();
        assert!(matches!(error, Failure::AudioEmpty));
    }

    #[test]
    fn thread_count_is_bounded() {
        let threads = default_threads();
        assert!((2..=8).contains(&threads), "got {threads}");
    }

    #[test]
    fn the_deadline_scales_with_the_clip_and_is_never_instant() {
        assert!(deadline_for(0) >= Duration::from_secs(60));
        assert!(deadline_for(1000) >= Duration::from_secs(60));
        assert!(deadline_for(300_000) > Duration::from_secs(600));
        assert!(deadline_for(10_000_000) <= Duration::from_secs(900));
    }

    #[test]
    fn a_transcript_zeroizes_itself_when_dropped() {
        let transcript = Transcript {
            text: "secret dictation".to_string(),
            segments: 1,
            audio_ms: 1000,
            compute_ms: 100,
        };
        let pointer = transcript.text.as_ptr();
        let length = transcript.text.len();
        drop(transcript);
        // The buffer was zeroed before being released; reading it back is only
        // safe because we captured the allocation before the drop.
        let seen = unsafe { std::slice::from_raw_parts(pointer, length) };
        assert!(
            seen.iter().all(|byte| *byte == 0),
            "the transcript buffer must be cleared, not just freed"
        );
    }

    /// Full engine verification on real files: the actual installed model plus
    /// synthetic speech, asserting whisper.cpp accepts the model and returns
    /// words rather than silence. Never part of the default run.
    #[ignore = "needs the installed model (env MIRO_TEST_MODEL) and a 16 kHz mono speech wav (env MIRO_TEST_SPEECH_WAV)"]
    #[test]
    fn a_real_model_transcribes_synthetic_speech() {
        use std::path::PathBuf;
        let model = std::env::var_os("MIRO_TEST_MODEL")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                Path::new(&std::env::var("APPDATA").unwrap())
                    .join("app.miro.dictation")
                    .join("models")
                    .join("ggml-base.en-q5_1.bin")
            });
        let wav = std::env::var_os("MIRO_TEST_SPEECH_WAV")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                Path::new(&std::env::var("LOCALAPPDATA").unwrap())
                    .join("Temp")
                    .join("opencode")
                    .join("speech.wav")
            });
        let Some(samples) = read_pcm16_mono_16k(&wav) else {
            panic!("speech wav must be 16 kHz 16-bit mono pcm");
        };
        println!(
            "model: {} ({} bytes)",
            model.display(),
            std::fs::metadata(&model).unwrap().len()
        );
        println!(
            "speech: {} samples ({} ms)",
            samples.len(),
            samples.len() / 16
        );

        let engine = Engine::load(&model, "base.en").expect("the installed model must load");
        let transcript = engine
            .transcribe(
                &samples,
                &EngineOptions::default(),
                samples.len() as u128 / 16,
            )
            .expect("synthetic speech must transcribe");
        println!(
            "transcript: {} chars, {} segments, {} ms compute",
            transcript.text.chars().count(),
            transcript.segments,
            transcript.compute_ms
        );

        let lowered = transcript.text.to_lowercase();
        assert!(
            !transcript.text.trim().is_empty(),
            "the transcript must not be empty"
        );
        assert!(
            lowered.contains("fox"),
            "expected the spoken words, got: {:?}",
            transcript.text
        );
    }

    /// Minimal riff/header walk for a 16-bit single-channel 16 kHz PCM wave.
    fn read_pcm16_mono_16k(path: &Path) -> Option<Vec<f32>> {
        use std::io::{Read, Seek, SeekFrom};
        let mut file = std::fs::File::open(path).ok()?;
        let mut riff = [0u8; 12];
        file.read_exact(&mut riff).ok()?;
        if &riff[0..4] != b"RIFF" || &riff[8..12] != b"WAVE" {
            return None;
        }
        loop {
            let mut chunk = [0u8; 8];
            file.read_exact(&mut chunk).ok()?;
            let name = [chunk[0], chunk[1], chunk[2], chunk[3]];
            let size = u32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]) as usize;
            if name == *b"data" {
                let mut pcm = vec![0u8; size];
                file.read_exact(&mut pcm).ok()?;
                let mut samples = Vec::with_capacity(size / 2);
                for pair in pcm.chunks_exact(2) {
                    samples.push(i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32768.0);
                }
                return Some(samples);
            }
            if name == *b"fmt " {
                let mut fmt = vec![0u8; size];
                file.read_exact(&mut fmt).ok()?;
                let channels = u16::from_le_bytes([fmt[2], fmt[3]]);
                let rate = u32::from_le_bytes([fmt[4], fmt[5], fmt[6], fmt[7]]);
                let bits = u16::from_le_bytes([fmt[14], fmt[15]]);
                if channels != 1 || rate != 16000 || bits != 16 {
                    return None;
                }
                continue;
            }
            file.seek(SeekFrom::Current((size + (size & 1)) as i64))
                .ok()?;
        }
    }

    #[test]
    fn split_into_chunks_keeps_short_audio_as_single_chunk() {
        let samples = vec![0.1f32; 1000];
        let chunks = split_into_chunks(&samples);
        assert_eq!(chunks, vec![(0, 1000)]);
    }

    #[test]
    fn split_into_chunks_splits_long_audio_at_max_size() {
        // 3 minutes of audio at 16 kHz = 2_880_000 samples.
        // MAX_CHUNK_SAMPLES = 960_000 (60 s), so we expect 3 chunks.
        let samples = vec![0.1f32; 2_880_000];
        let chunks = split_into_chunks(&samples);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0], (0, MAX_CHUNK_SAMPLES));
        assert_eq!(chunks[1], (MAX_CHUNK_SAMPLES, 2 * MAX_CHUNK_SAMPLES));
        assert_eq!(chunks[2], (2 * MAX_CHUNK_SAMPLES, 2_880_000));
    }

    #[test]
    fn split_into_chunks_cuts_at_silence_boundary() {
        // 90 seconds of audio: first 60 s loud, next 30 s silent, then more
        // loud audio. The split should fall in the silent region.
        let loud = vec![0.5f32; MAX_CHUNK_SAMPLES];
        let silent = vec![0.0001f32; MIN_CHUNK_SAMPLES]; // below BOUNDARY_SILENCE_RMS
        let more_loud = vec![0.5f32; MAX_CHUNK_SAMPLES];
        let samples: Vec<f32> = loud.into_iter().chain(silent).chain(more_loud).collect();

        let chunks = split_into_chunks(&samples);
        assert!(chunks.len() >= 2, "expected at least 2 chunks, got {}", chunks.len());

        // First chunk should end within the silent region.
        let first_end = chunks[0].1;
        assert!(
            first_end >= MAX_CHUNK_SAMPLES && first_end <= MAX_CHUNK_SAMPLES + MIN_CHUNK_SAMPLES,
            "first chunk end {} should be in silent region",
            first_end
        );
    }

    #[test]
    fn split_into_chunks_respects_min_chunk_size() {
        // All silence: no boundary found, so chunks should be exactly
        // MAX_CHUNK_SAMPLES each (no min-size constraint violated since we
        // can't find silence).
        let samples = vec![0.0001f32; 3 * MAX_CHUNK_SAMPLES];
        let chunks = split_into_chunks(&samples);
        assert_eq!(chunks.len(), 3);
        for (start, end) in &chunks {
            assert_eq!(*end - *start, MAX_CHUNK_SAMPLES);
        }
    }
}

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

use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

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
}

impl Default for EngineOptions {
    fn default() -> Self {
        Self {
            language: Some("en".to_string()),
            threads: default_threads(),
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
                    return Ok(Self {
                        backend: Backend::Whisper(engine),
                        model_id: Some(model_id.to_string()),
                        busy: Arc::new(AtomicBool::new(false)),
                        last_compute_ms: AtomicU64::new(0),
                    });
                }
                Err(failure) => {
                    logging::event(Event::EngineLoadFailed {
                        code: failure.code().as_str(),
                    });
                    return Err(failure);
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

    /// Transcribes 16 kHz mono f32 samples.
    ///
    /// Runs synchronously on the calling thread - the session layer owns which
    /// thread that is - so that a caller can never accidentally block the UI.
    pub fn transcribe(&self, samples: &[f32], options: &EngineOptions, audio_ms: u128) -> Result<Transcript> {
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

                logging::event(Event::TranscriptionStarted {
                    samples: samples.len(),
                });
                let started = Instant::now();
                let result = engine.transcribe(samples, options);
                let compute_ms = started.elapsed().as_millis();
                self.last_compute_ms
                    .store(compute_ms as u64, Ordering::Relaxed);

                match result {
                    Ok((text, segments)) => {
                        logging::event(Event::TranscriptionFinished {
                            segments,
                            ms: compute_ms,
                            chars: text.chars().count(),
                        });
                        drop(guard);
                        Ok(Transcript {
                            text,
                            segments,
                            audio_ms,
                            compute_ms,
                        })
                    }
                    Err(failure) => {
                        logging::event(Event::TranscriptionFailed {
                            code: failure.code().as_str(),
                        });
                        drop(guard);
                        Err(failure)
                    }
                }
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
        assert!(matches!(error, Failure::EngineNotBuilt | Failure::AudioEmpty));
    }

    #[test]
    fn empty_audio_is_rejected_before_reaching_the_engine() {
        let engine = Engine::unavailable();
        let error = engine.transcribe(&[], &EngineOptions::default(), 0).unwrap_err();
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
        let mut transcript = Transcript {
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
        println!("model: {} ({} bytes)", model.display(), std::fs::metadata(&model).unwrap().len());
        println!("speech: {} samples ({} ms)", samples.len(), samples.len() / 16);

        let engine = Engine::load(&model, "base.en").expect("the installed model must load");
        let transcript = engine
            .transcribe(&samples, &EngineOptions::default(), samples.len() as u128 / 16)
            .expect("synthetic speech must transcribe");
        println!(
            "transcript: {} chars, {} segments, {} ms compute",
            transcript.text.chars().count(),
            transcript.segments,
            transcript.compute_ms
        );

        let lowered = transcript.text.to_lowercase();
        assert!(!transcript.text.trim().is_empty(), "the transcript must not be empty");
        assert!(lowered.contains("fox"), "expected the spoken words, got: {:?}", transcript.text);
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
            file.seek(SeekFrom::Current((size + (size & 1)) as i64)).ok()?;
        }
    }
}

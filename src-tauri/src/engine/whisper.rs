//! whisper.cpp via `whisper-rs`.
//!
//! Notes on the choices here:
//!   * A **fresh decoder state per transcription**. whisper.cpp keeps a
//!     decoder state that can carry text between calls; creating one per
//!     request guarantees that nothing a previous dictation produced can
//!     influence - or be recovered from - the next one. It also keeps this
//!     module free of self-referential lifetimes.
//!   * Every `print_*` flag is off, and whisper.cpp's own logging is routed to
//!     a callback that discards it, so segment text has no route to stderr.
//!   * Context **is** carried across whisper.cpp's 30 s windows inside one
//!     recording. The fresh state above is what keeps dictations isolated; the
//!     in-recording context is what keeps a long sentence coherent instead of
//!     restarting the decoder every 30 seconds.
//!   * Translation is always off. Miro transcribes; it does not translate.
//!   * Beam search plus silence/hallucination guards favour accuracy over
//!     raw speed. The initial prompt is a fixed constant, never user text.

use std::path::Path;

use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperSegment,
    WhisperState,
};

use super::EngineOptions;
use crate::errors::{Failure, Result};

/// A fixed style hint. It nudges Whisper toward punctuated, sentence-cased
/// output and the correct spelling of common technical terms. It is a
/// constant: nothing from a previous dictation ever enters it.
const STYLE_PROMPT: &str =
    "Hello, this is a sentence. I use TypeScript, JavaScript, GitHub, Node.js, and Kubernetes.";

/// Maximum characters in the combined initial prompt.
const MAX_PROMPT_CHARS: usize = 500;
/// Maximum number of vocabulary terms kept after dedup.
const MAX_VOCAB_TERMS: usize = 64;
/// Maximum characters per vocabulary term.
const MAX_VOCAB_TERM_LEN: usize = 100;

/// Builds whisper.cpp's initial prompt from the fixed style hint plus
/// user-supplied vocabulary terms.
///
/// Terms are trimmed, deduplicated case-insensitively, filtered for emptiness
/// and per-term length, then appended after STYLE_PROMPT. The combined prompt
/// is truncated to [`MAX_PROMPT_CHARS`]. Returns `None` when there are no
/// terms to contribute (either no vocabulary or the caller is not English).
fn build_initial_prompt(vocabulary: &[String]) -> Option<String> {
    let mut seen: Vec<String> = Vec::new();
    for term in vocabulary {
        let trimmed = term.trim().to_string();
        if trimmed.is_empty() || trimmed.chars().count() > MAX_VOCAB_TERM_LEN {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if !seen.iter().any(|s| s.to_lowercase() == lower) {
            seen.push(trimmed);
        }
        if seen.len() >= MAX_VOCAB_TERMS {
            break;
        }
    }
    if seen.is_empty() {
        return None;
    }
    let mut prompt = String::with_capacity(MAX_PROMPT_CHARS);
    prompt.push_str(STYLE_PROMPT);
    prompt.push(' ');
    for term in &seen {
        if prompt.len() + term.len() + 1 > MAX_PROMPT_CHARS {
            break;
        }
        prompt.push_str(term);
        prompt.push(' ');
    }
    prompt.truncate(MAX_PROMPT_CHARS);
    Some(prompt.trim().to_string())
}

/// Segments whose no-speech probability is this high are a *candidate* for
/// silence. They are only discarded when the words they contain are also
/// low-confidence: accented speech and a noisy room can push a real segment
/// over this threshold, and dropping it silently loses part of the dictation.
const NO_SPEECH_THRESHOLD: f32 = 0.6;

/// Mean per-word token probability below this means the decoder was guessing.
/// Used together with [`NO_SPEECH_THRESHOLD`], never on its own.
const LOW_CONFIDENCE: f32 = 0.55;

pub struct WhisperEngine {
    context: WhisperContext,
}

impl WhisperEngine {
    pub fn load(path: &Path) -> Result<Self> {
        install_quiet_logging();

        let path = path
            .to_str()
            .ok_or_else(|| Failure::ModelLoad("the model path is not valid UTF-8".into()))?;

        let mut parameters = WhisperContextParameters::default();
        // Only has an effect in builds compiled with CUDA/Vulkan support; the
        // default CPU build ignores it, so it is safe to leave on.
        parameters.use_gpu(true);

        let context = WhisperContext::new_with_params(path, parameters)
            .map_err(|error| Failure::ModelLoad(describe(error)))?;

        Ok(Self { context })
    }

    /// Returns `(text, segment_count)`.
    pub fn transcribe(&self, samples: &[f32], options: &EngineOptions) -> Result<(String, usize)> {
        let mut state: WhisperState = self
            .context
            .create_state()
            .map_err(|error| Failure::ModelLoad(describe(error)))?;

        let mut params = FullParams::new(SamplingStrategy::BeamSearch {
            beam_size: 1, // Greedy decoding reduces hallucinations
            patience: -1.0,
        });
        params.set_n_threads(options.threads as i32);
        params.set_translate(false);
        // Keep the decoder's own context across the 30 s windows of a long
        // recording. Dictations are still isolated because this state was
        // created fresh above; clearing the in-recording context only makes
        // whisper restart mid-thought every 30 seconds.
        params.set_no_context(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        // Silence and hallucination guards: stops phantom output such as
        // "Thank you." or "[BLANK_AUDIO]" on quiet or empty clips.
        params.set_no_speech_thold(NO_SPEECH_THRESHOLD);
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);

        match options.language.as_deref() {
            Some("auto") | Some("") | None => params.set_detect_language(true),
            Some(language) => params.set_language(Some(language)),
        }

        // The style prompt is English, so only use it for English dictation.
        // User vocabulary terms are appended after it to steer recognition
        // toward domain-specific words and names.
        let initial_prompt: Option<String> = match options.language.as_deref() {
            Some("en") => {
                // English: always have at least the fixed style prompt.
                Some(
                    build_initial_prompt(&options.vocabulary)
                        .unwrap_or_else(|| STYLE_PROMPT.to_string()),
                )
            }
            _ => build_initial_prompt(&options.vocabulary),
        };
        if let Some(prompt) = initial_prompt {
            params.set_initial_prompt(&prompt);
        }

        state
            .full(params, samples)
            .map_err(|error| Failure::Transcription(describe(error)))?;

        // `full_n_segments` answers with a plain count now, and segments are
        // read back through a borrowed view instead of a text call.
        let segments = state.full_n_segments().max(0);

        let mut text = String::new();
        let mut segments_used = 0usize;
        let mut dropped = 0usize;
        let mut last_end_cs = 0i64;
        let mut kept_end_cs = 0i64;

        for index in 0..segments {
            let Some(segment) = state.get_segment(index) else {
                continue;
            };
            last_end_cs = last_end_cs.max(segment.end_timestamp());

            // whisper.cpp's no_speech_thold is not actually implemented, so
            // quiet or noisy clips can still produce phantom segments. A high
            // no-speech probability alone is not enough to throw a segment
            // away, though: real accented speech can score the same. Only drop
            // it when the decoded words are also low-confidence.
            if is_silent_segment(
                segment.no_speech_probability(),
                mean_word_probability(&segment),
            ) {
                dropped += 1;
                continue;
            }

            let segment_text = segment
                .to_str()
                .map_err(|error| Failure::Transcription(describe(error)))?;
            let trimmed = segment_text.trim();
            if trimmed.is_empty() {
                dropped += 1;
                continue;
            }
            // Whisper hallucinates these stock phrases on noise even when
            // no_speech_probability is low. Only multi-word phrases are listed:
            // a single "you" or "bye" is ordinary dictation.
            let lowered = trimmed.to_lowercase();
            let hallucinations = [
                "thanks for watching",
                "thank you",
                "subscribe",
                "blank_audio",
                "thank you for watching",
                "thanks for listening",
                "see you next time",
            ];
            let is_hallucination = hallucinations.iter().any(|phrase| {
                lowered == *phrase
                    || lowered == format!("{phrase}.")
                    || lowered == format!("{phrase}!")
                    || lowered == format!("{phrase},")
                    || lowered == format!("{phrase}?")
            });
            if is_hallucination {
                dropped += 1;
                continue;
            }
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(trimmed);
            segments_used += 1;
            kept_end_cs = kept_end_cs.max(segment.end_timestamp());
        }

        // Content-free coverage diagnostic: if `kept_end_ms` is far short of
        // the recording, speech at the end was not transcribed and the log
        // says so instead of leaving a silently truncated dictation.
        eprintln!(
            "[miro-engine] segments={segments} kept={segments_used} dropped={dropped} \
             last_end_ms={} kept_end_ms={} audio_ms={}",
            last_end_cs.saturating_mul(10),
            kept_end_cs.saturating_mul(10),
            samples.len() / 16
        );

        if segments_used == 0 || text.trim().is_empty() {
            return Err(Failure::TranscriptEmpty);
        }

        // Reject transcripts that are suspiciously long for the audio duration.
        // Normal speech is ~150-200 chars per 10 seconds. If we get much more,
        // the engine is likely hallucinating or repeating.
        let audio_seconds = samples.len() as f64 / 16000.0;
        let expected_max_chars = (audio_seconds * 25.0) as usize; // ~25 chars per second max
        let actual_chars = text.chars().count();
        if actual_chars > expected_max_chars.max(100) {
            eprintln!(
                "[miro-engine] transcript too long: {} chars for {:.1}s audio (expected ~{})",
                actual_chars, audio_seconds, expected_max_chars
            );
            return Err(Failure::Transcription(
                "transcript is suspiciously long, likely hallucinated".into()
            ));
        }

        Ok((text, segments as usize))
    }
}

/// True when a segment should be treated as silence rather than dictation.
///
/// Both signals must agree. A high no-speech probability from a noisy room is
/// not enough on its own to delete words whisper was confident about.
fn is_silent_segment(no_speech: f32, confidence: Option<f32>) -> bool {
    no_speech > NO_SPEECH_THRESHOLD && confidence.map_or(true, |p| p < LOW_CONFIDENCE)
}

/// Mean probability of the segment's word tokens.
///
/// Special tokens, punctuation and whitespace carry no word-level confidence,
/// so they are skipped. `None` means the segment had no word tokens at all,
/// which is treated as low confidence by the caller.
fn mean_word_probability(segment: &WhisperSegment<'_>) -> Option<f32> {
    let mut sum = 0.0f64;
    let mut count = 0u32;

    for index in 0..segment.n_tokens() {
        let Some(token) = segment.get_token(index) else {
            continue;
        };
        let Ok(token_text) = token.to_str_lossy() else {
            continue;
        };
        if !token_text
            .chars()
            .any(|character| character.is_alphanumeric())
        {
            continue;
        }
        let probability = token.token_probability();
        if !probability.is_finite() {
            continue;
        }
        sum += f64::from(probability);
        count += 1;
    }

    (count > 0).then(|| (sum / f64::from(count)) as f32)
}

/// whisper.cpp and GGML log model dimensions and timings to stderr by default.
/// Miro keeps its own event log instead, so both streams are handed to
/// whisper-rs' logging hooks: it routes them into `log`/`tracing`, and this
/// build enables neither backend (see Cargo.toml), so every message is dropped
/// rather than printed. Nothing the engine logs reaches a console or a crash
/// report, and the callback is no longer our own C-ABI code.
fn install_quiet_logging() {
    whisper_rs::install_logging_hooks();
}

fn describe(error: whisper_rs::WhisperError) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whisper_cpp_version_is_reported_for_the_about_screen() {
        // The version string is the one thing this module can assert without a
        // model file, and it is what the ADR records.
        let version = whisper_rs::WHISPER_CPP_VERSION;
        assert!(!version.is_empty());
    }

    #[test]
    fn the_language_helpers_accept_known_codes() {
        // The lookup answers with an option now rather than a sentinel id.
        assert!(whisper_rs::get_lang_id("en").is_some());
        assert!(whisper_rs::get_lang_id("de").is_some());
        assert!(whisper_rs::get_lang_str(0).is_some());
        assert!(whisper_rs::get_lang_id("not-a-language").is_none());
    }

    #[test]
    fn a_confident_segment_is_never_discarded_for_noise_probability_alone() {
        // Accented speech in a noisy room can score above the no-speech
        // threshold. If the decoded words themselves are confident, the text
        // is real and must survive.
        assert!(!is_silent_segment(0.95, Some(0.8)));
        // The same score with no word tokens, or with guessing-level
        // confidence, is silence.
        assert!(is_silent_segment(0.95, None));
        assert!(is_silent_segment(0.95, Some(0.1)));
    }

    #[test]
    fn a_low_noise_probability_keeps_the_segment_even_when_confidence_is_low() {
        // Whisper itself says this is speech. The guard is a silence filter,
        // not a general confidence filter, so it does not second-guess that.
        assert!(!is_silent_segment(0.1, Some(0.05)));
    }

    #[test]
    fn build_initial_prompt_empty_returns_none() {
        assert_eq!(build_initial_prompt(&[]), None);
        assert_eq!(
            build_initial_prompt(&["   ".into(), "\t".into()]),
            None
        );
    }

    #[test]
    fn build_initial_prompt_deduplicates_case_insensitively() {
        let prompt = build_initial_prompt(&[
            "TypeScript".into(),
            "typescript".into(),
            "TYPESCRIPT".into(),
            "Rust".into(),
        ])
        .unwrap();
        let typescript_count = prompt
            .split_whitespace()
            .filter(|w| w.eq_ignore_ascii_case("typescript"))
            .count();
        assert_eq!(typescript_count, 1, "typescript must appear once: {prompt}");
        assert!(prompt.contains("Rust"), "rust must appear: {prompt}");
    }

    #[test]
    fn build_initial_prompt_trims_and_filters_empty() {
        let prompt = build_initial_prompt(&[
            "  hello  ".into(),
            "".into(),
            "   ".into(),
            "world".into(),
        ])
        .unwrap();
        let words: Vec<&str> = prompt.split_whitespace().collect();
        assert!(!words.iter().any(|w| w.is_empty()), "no empty words: {prompt}");
        assert!(words.contains(&"hello"), "hello kept: {prompt}");
        assert!(words.contains(&"world"), "world kept: {prompt}");
    }

    #[test]
    fn build_initial_prompt_truncates_to_max_chars() {
        let terms: Vec<String> = (0..80).map(|i| format!("word{i:03}")).collect();
        let prompt = build_initial_prompt(&terms).unwrap();
        assert!(
            prompt.chars().count() <= MAX_PROMPT_CHARS,
            "prompt must not exceed {MAX_PROMPT_CHARS} chars, got {}",
            prompt.chars().count()
        );
        assert!(
            prompt.starts_with(STYLE_PROMPT),
            "prompt must start with style prompt: {prompt}"
        );
    }

    #[test]
    fn build_initial_prompt_rejects_overly_long_terms() {
        let too_long: String = (0..MAX_VOCAB_TERM_LEN + 1).map(|_| 'x').collect();
        let prompt = build_initial_prompt(&[too_long.clone(), "ok".into()]).unwrap();
        assert!(
            !prompt.contains(&too_long[..]),
            "overly long term must be dropped: {prompt}"
        );
        assert!(prompt.contains("ok"), "short term must survive: {prompt}");
    }

    #[test]
    fn build_initial_prompt_caps_term_count() {
        let many: Vec<String> = (0..MAX_VOCAB_TERMS * 2)
            .map(|i| format!("t{i}"))
            .collect();
        let prompt = build_initial_prompt(&many).unwrap();
        let count = prompt
            .split_whitespace()
            .filter(|w| w.len() > 1 && w[1..].chars().all(|c| c.is_ascii_digit()))
            .count();
        assert!(
            count <= MAX_VOCAB_TERMS,
            "term count capped at {MAX_VOCAB_TERMS}, got {count}: {prompt}"
        );
    }
}

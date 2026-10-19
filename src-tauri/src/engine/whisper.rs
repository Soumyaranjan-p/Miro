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
//!   * `no_context` is set for the same reason: each dictation stands alone.
//!   * Translation is always off. Miro transcribes; it does not translate.
//!   * Beam search plus silence/hallucination guards favour accuracy over
//!     raw speed. The initial prompt is a fixed constant, never user text.

use std::path::Path;

use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

use super::EngineOptions;
use crate::errors::{Failure, Result};

/// A fixed style hint. It nudges Whisper toward punctuated, sentence-cased
/// output and the correct spelling of common technical terms. It is a
/// constant: nothing from a previous dictation ever enters it.
const STYLE_PROMPT: &str =
    "Hello, this is a sentence. I use TypeScript, JavaScript, GitHub, Node.js, and Kubernetes.";

/// Segments whose no-speech probability is above this are treated as silence.
const NO_SPEECH_THRESHOLD: f32 = 0.6;

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
            beam_size: 5,
            patience: -1.0,
        });
        params.set_n_threads(options.threads as i32);
        params.set_translate(false);
        params.set_no_context(true);
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
        if matches!(options.language.as_deref(), Some("en")) {
            params.set_initial_prompt(STYLE_PROMPT);
        }

        state
            .full(params, samples)
            .map_err(|error| Failure::Transcription(describe(error)))?;

        // `full_n_segments` answers with a plain count now, and segments are
        // read back through a borrowed view instead of a text call.
        let segments = state.full_n_segments().max(0);

        let mut text = String::new();
        for index in 0..segments {
            let Some(segment) = state.get_segment(index) else {
                continue;
            };
            let segment = segment
                .to_str()
                .map_err(|error| Failure::Transcription(describe(error)))?;
            let trimmed = segment.trim();
            if trimmed.is_empty() {
                continue;
            }
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(trimmed);
        }

        Ok((text, segments as usize))
    }
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
}

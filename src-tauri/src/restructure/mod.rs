//! Turning spoken intent into a prompt, with a deadline and a guaranteed
//! fallback.
//!
//! The rest of Miro only needs one promise from this module: the text that
//! reaches review (or insertion) is either a sanitized prompt from the chosen
//! backend, or the raw transcript. A backend that is slow, dead, or replies
//! with packaging never blocks or loses a dictation.

pub mod backends;
pub mod sanitize;

use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

pub use backends::{CloudRestructurer, LocalOllama};

use sanitize::sanitize;

/// The instruction every backend receives. It is a constant: no transcript,
/// endpoint or user text is ever concatenated into it.
pub const SYSTEM_PROMPT: &str = "\
You rewrite a spoken request into a short, clear prompt for an AI agent.
Preserve every constraint, name, number, file, tool and requirement the speaker stated.
Never invent requirements, tools, steps or details that were not spoken.
Remove filler words, repetition and false starts.
Keep the result as short as possible while retaining every constraint.
Return plain text only: no preamble, no explanation, no markdown fences, no surrounding quotes.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RestructureError {
    Timeout,
    Empty,
    Transport(String),
    Provider(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FallbackReason {
    Timeout,
    Error,
    Empty,
    Malformed,
}

impl FallbackReason {
    /// A content-free code for the event log.
    pub fn code(self) -> &'static str {
        match self {
            FallbackReason::Timeout => "timeout",
            FallbackReason::Error => "error",
            FallbackReason::Empty => "empty",
            FallbackReason::Malformed => "malformed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestructureOutcome {
    /// Sanitized prompt on success, raw transcript on every fallback.
    pub text: String,
    pub used_fallback: bool,
    pub fallback: Option<FallbackReason>,
}

impl RestructureOutcome {
    pub fn fallback_code(&self) -> Option<&'static str> {
        self.fallback.map(FallbackReason::code)
    }
}

#[derive(Debug, Clone)]
pub struct RestructureOptions {
    pub endpoint: String,
    pub model: String,
    pub timeout_ms: u32,
    pub max_output_chars: usize,
}

#[derive(Debug, Clone)]
pub struct RestructureRequest {
    pub transcript: String,
    pub endpoint: String,
    pub model: String,
    pub timeout: Duration,
    pub max_output_chars: usize,
}

/// One backend. Implementations do the network call and nothing else; the
/// deadline, sanitizer and fallback live in [`restructure_or_raw`].
pub trait PromptRestructurer: Send + Sync {
    fn name(&self) -> &'static str;
    fn restructure(&self, request: &RestructureRequest) -> Result<String, RestructureError>;
}

/// Runs the backend under a hard deadline and returns either a usable prompt
/// or the raw transcript.
pub fn restructure_or_raw(
    restructurer: Arc<dyn PromptRestructurer>,
    transcript: &str,
    options: &RestructureOptions,
) -> RestructureOutcome {
    if transcript.trim().is_empty() {
        return fallback(transcript, FallbackReason::Empty);
    }

    let request = RestructureRequest {
        transcript: transcript.to_string(),
        endpoint: options.endpoint.clone(),
        model: options.model.clone(),
        timeout: Duration::from_millis(options.timeout_ms as u64),
        max_output_chars: options.max_output_chars,
    };

    let (sender, receiver) = mpsc::channel();
    let thread_request = request.clone();
    let spawned = thread::Builder::new()
        .name("miro-restructure".to_string())
        .spawn(move || {
            let result = restructurer.restructure(&thread_request);
            let _ = sender.send(result);
        });

    if spawned.is_err() {
        return fallback(transcript, FallbackReason::Error);
    }

    let result = match receiver.recv_timeout(request.timeout) {
        Ok(result) => result,
        Err(RecvTimeoutError::Timeout) => return fallback(transcript, FallbackReason::Timeout),
        Err(RecvTimeoutError::Disconnected) => return fallback(transcript, FallbackReason::Error),
    };

    match result {
        Ok(raw) => match sanitize(&raw, request.max_output_chars) {
            Some(text) => RestructureOutcome {
                text,
                used_fallback: false,
                fallback: None,
            },
            None => fallback(
                transcript,
                if raw.trim().is_empty() {
                    FallbackReason::Empty
                } else {
                    FallbackReason::Malformed
                },
            ),
        },
        Err(RestructureError::Timeout) => fallback(transcript, FallbackReason::Timeout),
        Err(RestructureError::Empty) => fallback(transcript, FallbackReason::Empty),
        Err(RestructureError::Transport(_)) | Err(RestructureError::Provider(_)) => {
            fallback(transcript, FallbackReason::Error)
        }
    }
}

fn fallback(transcript: &str, reason: FallbackReason) -> RestructureOutcome {
    RestructureOutcome {
        text: transcript.to_string(),
        used_fallback: true,
        fallback: Some(reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Mock {
        reply: Result<String, RestructureError>,
        delay: Duration,
    }

    impl Mock {
        fn reply(text: &str) -> Self {
            Self {
                reply: Ok(text.to_string()),
                delay: Duration::ZERO,
            }
        }

        fn error(error: RestructureError) -> Self {
            Self {
                reply: Err(error),
                delay: Duration::ZERO,
            }
        }

        fn slow(text: &str, delay: Duration) -> Self {
            Self {
                reply: Ok(text.to_string()),
                delay,
            }
        }
    }

    impl PromptRestructurer for Mock {
        fn name(&self) -> &'static str {
            "mock"
        }

        fn restructure(&self, _request: &RestructureRequest) -> Result<String, RestructureError> {
            thread::sleep(self.delay);
            self.reply.clone()
        }
    }

    fn options(timeout_ms: u32) -> RestructureOptions {
        RestructureOptions {
            endpoint: "http://127.0.0.1:11434".into(),
            model: "test".into(),
            timeout_ms,
            max_output_chars: 1_200,
        }
    }

    #[test]
    fn a_successful_reply_is_sanitized() {
        let outcome = restructure_or_raw(
            Arc::new(Mock::reply(
                "Here is the prompt:\n\nFix the login bug. Keep the existing API.",
            )),
            "um so fix the login bug and keep the existing api",
            &options(4_000),
        );

        assert!(!outcome.used_fallback);
        assert_eq!(outcome.text, "Fix the login bug. Keep the existing API.");
        assert_eq!(outcome.fallback, None);
    }

    #[test]
    fn a_timeout_falls_back_to_the_raw_transcript() {
        let raw = "make the upload retry but do not change the timeout";
        let outcome = restructure_or_raw(
            Arc::new(Mock::slow(
                "This should never be used.",
                Duration::from_millis(250),
            )),
            raw,
            &options(20),
        );

        assert!(outcome.used_fallback);
        assert_eq!(outcome.fallback, Some(FallbackReason::Timeout));
        assert_eq!(outcome.text, raw);
    }

    #[test]
    fn a_backend_error_falls_back_to_the_raw_transcript() {
        let raw = "keep the existing api";
        let outcome = restructure_or_raw(
            Arc::new(Mock::error(RestructureError::Provider(
                "HTTP 500".to_string(),
            ))),
            raw,
            &options(4_000),
        );

        assert!(outcome.used_fallback);
        assert_eq!(outcome.fallback, Some(FallbackReason::Error));
        assert_eq!(outcome.text, raw);
    }

    #[test]
    fn an_empty_reply_falls_back_to_the_raw_transcript() {
        let raw = "keep the existing api";
        let outcome = restructure_or_raw(Arc::new(Mock::reply("   ")), raw, &options(4_000));

        assert!(outcome.used_fallback);
        assert_eq!(outcome.fallback, Some(FallbackReason::Empty));
        assert_eq!(outcome.text, raw);
    }

    #[test]
    fn a_malformed_reply_falls_back_to_the_raw_transcript() {
        let raw = "keep the existing api";
        let outcome = restructure_or_raw(
            Arc::new(Mock::reply("Here is the prompt:")),
            raw,
            &options(4_000),
        );

        assert!(outcome.used_fallback);
        assert_eq!(outcome.fallback, Some(FallbackReason::Malformed));
        assert_eq!(outcome.text, raw);
    }

    #[test]
    fn an_empty_transcript_never_reaches_the_backend() {
        let outcome =
            restructure_or_raw(Arc::new(Mock::reply("never used")), "   ", &options(4_000));
        assert!(outcome.used_fallback);
        assert_eq!(outcome.fallback, Some(FallbackReason::Empty));
    }

    #[test]
    fn the_system_prompt_requires_constraints_and_plain_text() {
        for required in [
            "Preserve every constraint",
            "Never invent",
            "plain text only",
            "no preamble",
        ] {
            assert!(
                SYSTEM_PROMPT.contains(required),
                "system prompt is missing `{required}`"
            );
        }
    }
}

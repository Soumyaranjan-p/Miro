//! Miro's error taxonomy.
//!
//! Two layers on purpose:
//!   * [`Failure`] is what the Rust core works with: rich, typed, `thiserror`.
//!   * [`ErrorCode`] is the only thing the interface ever sees, plus a short
//!     operator detail that is guaranteed to be free of dictation content.
//!
//! Keeping the mapping in one place is what makes the promise "Miro never
//! shows or logs transcript text in an error" checkable rather than aspirational.

use serde::Serialize;

/// Wire-level failure codes, shared with `src/lib/types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    ModelMissing,
    ModelCorrupt,
    ModelUnavailable,
    DownloadFailed,
    DownloadCancelled,
    MicPermissionDenied,
    MicMissing,
    MicDisconnected,
    MicUnsupportedFormat,
    EngineFailed,
    EngineTimeout,
    EngineUnavailable,
    AudioEmpty,
    AudioSilent,
    TranscriptEmpty,
    AudioTooLong,
    ShortcutConflict,
    ShortcutInvalid,
    FocusChanged,
    InsertionFailed,
    InsertionBlocked,
    ClipboardFailed,
    TempCleanupFailed,
    ConfigWriteFailed,
    Cancelled,
    InternalError,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::ModelMissing => "model_missing",
            ErrorCode::ModelCorrupt => "model_corrupt",
            ErrorCode::ModelUnavailable => "model_unavailable",
            ErrorCode::DownloadFailed => "download_failed",
            ErrorCode::DownloadCancelled => "download_cancelled",
            ErrorCode::MicPermissionDenied => "mic_permission_denied",
            ErrorCode::MicMissing => "mic_missing",
            ErrorCode::MicDisconnected => "mic_disconnected",
            ErrorCode::MicUnsupportedFormat => "mic_unsupported_format",
            ErrorCode::EngineFailed => "engine_failed",
            ErrorCode::EngineTimeout => "engine_timeout",
            ErrorCode::EngineUnavailable => "engine_unavailable",
            ErrorCode::AudioEmpty => "audio_empty",
            ErrorCode::AudioSilent => "audio_silent",
            ErrorCode::TranscriptEmpty => "transcript_empty",
            ErrorCode::AudioTooLong => "audio_too_long",
            ErrorCode::ShortcutConflict => "shortcut_conflict",
            ErrorCode::ShortcutInvalid => "shortcut_invalid",
            ErrorCode::FocusChanged => "focus_changed",
            ErrorCode::InsertionFailed => "insertion_failed",
            ErrorCode::InsertionBlocked => "insertion_blocked",
            ErrorCode::ClipboardFailed => "clipboard_failed",
            ErrorCode::TempCleanupFailed => "temp_cleanup_failed",
            ErrorCode::ConfigWriteFailed => "config_write_failed",
            ErrorCode::Cancelled => "cancelled",
            ErrorCode::InternalError => "internal_error",
        }
    }
}

/// A failure the core can act on. Variants carry only non-sensitive detail:
/// device names, model ids, OS error strings, counts - never audio or text.
#[derive(Debug, thiserror::Error)]
pub enum Failure {
    #[error("no speech model is selected")]
    ModelMissing,
    #[error("model {0} is missing from the models folder")]
    ModelFileMissing(String),
    #[error("model {model} failed its integrity check")]
    ModelCorrupt { model: String },
    #[error("the engine is not built into this binary")]
    EngineNotBuilt,
    #[error("model failed to load: {0}")]
    ModelLoad(String),
    #[error("transcription failed: {0}")]
    Transcription(String),
    #[error("download failed: {0}")]
    Download(String),
    #[error("download cancelled by the user")]
    DownloadCancelled,
    #[error("microphone permission was denied by Windows")]
    MicPermissionDenied,
    #[error("no input device is available")]
    MicMissing,
    #[error("the input device disappeared")]
    MicDisconnected,
    #[error("no supported input configuration: {0}")]
    MicUnsupportedFormat(String),
    #[error("recording captured no usable audio")]
    AudioEmpty,
    #[error("the microphone gave no audio at all - check the mic device and Windows' microphone privacy setting")]
    AudioSilent,
    #[error("the engine transcribed no words from the recording")]
    TranscriptEmpty,
    #[error("recording reached the maximum length")]
    AudioTooLong,
    #[error("shortcut {shortcut} could not be registered: {reason}")]
    ShortcutConflict { shortcut: String, reason: String },
    #[error("shortcut {0} is not a valid combination")]
    ShortcutInvalid(String),
    #[error("the target window is no longer in the foreground")]
    FocusChanged,
    #[error("text insertion failed: {0}")]
    Insertion(String),
    #[error("the target window belongs to an elevated process")]
    InsertionBlocked,
    #[error("clipboard could not be used: {0}")]
    Clipboard(String),
    #[error("temporary file cleanup failed: {0}")]
    TempCleanup(String),
    #[error("settings could not be saved: {0}")]
    ConfigWrite(String),
    #[error("cancelled during {0}")]
    Cancelled(&'static str),
    #[error("{0}")]
    Internal(String),
}

impl Failure {
    pub fn code(&self) -> ErrorCode {
        match self {
            Failure::ModelMissing | Failure::ModelFileMissing(_) => ErrorCode::ModelMissing,
            Failure::ModelCorrupt { .. } => ErrorCode::ModelCorrupt,
            Failure::EngineNotBuilt => ErrorCode::EngineUnavailable,
            Failure::ModelLoad(_) => ErrorCode::ModelUnavailable,
            Failure::Transcription(_) => ErrorCode::EngineFailed,
            Failure::Download(_) => ErrorCode::DownloadFailed,
            Failure::DownloadCancelled => ErrorCode::DownloadCancelled,
            Failure::MicPermissionDenied => ErrorCode::MicPermissionDenied,
            Failure::MicMissing => ErrorCode::MicMissing,
            Failure::MicDisconnected => ErrorCode::MicDisconnected,
            Failure::MicUnsupportedFormat(_) => ErrorCode::MicUnsupportedFormat,
            Failure::AudioEmpty => ErrorCode::AudioEmpty,
            Failure::AudioSilent => ErrorCode::AudioSilent,
            Failure::TranscriptEmpty => ErrorCode::TranscriptEmpty,
            Failure::AudioTooLong => ErrorCode::AudioTooLong,
            Failure::ShortcutConflict { .. } => ErrorCode::ShortcutConflict,
            Failure::ShortcutInvalid(_) => ErrorCode::ShortcutInvalid,
            Failure::FocusChanged => ErrorCode::FocusChanged,
            Failure::Insertion(_) => ErrorCode::InsertionFailed,
            Failure::InsertionBlocked => ErrorCode::InsertionBlocked,
            Failure::Clipboard(_) => ErrorCode::ClipboardFailed,
            Failure::TempCleanup(_) => ErrorCode::TempCleanupFailed,
            Failure::ConfigWrite(_) => ErrorCode::ConfigWriteFailed,
            Failure::Cancelled(_) => ErrorCode::Cancelled,
            Failure::Internal(_) => ErrorCode::InternalError,
        }
    }

    /// Short, content-free operator detail. Never derived from audio or text.
    pub fn detail(&self) -> Option<String> {
        match self {
            Failure::ModelMissing
            | Failure::EngineNotBuilt
            | Failure::DownloadCancelled
            | Failure::MicPermissionDenied
            | Failure::MicMissing
            | Failure::MicDisconnected
            | Failure::AudioEmpty
            | Failure::AudioSilent
            | Failure::TranscriptEmpty
            | Failure::AudioTooLong
            | Failure::FocusChanged
            | Failure::InsertionBlocked
            | Failure::Cancelled(_) => None,

            Failure::ModelFileMissing(model) | Failure::ModelCorrupt { model } => {
                Some(format!("model: {model}"))
            }
            Failure::ModelLoad(detail)
            | Failure::Transcription(detail)
            | Failure::Download(detail)
            | Failure::MicUnsupportedFormat(detail)
            | Failure::Insertion(detail)
            | Failure::Clipboard(detail)
            | Failure::TempCleanup(detail)
            | Failure::ConfigWrite(detail)
            | Failure::Internal(detail) => Some(clip_detail(detail)),
            Failure::ShortcutConflict { shortcut, reason } => {
                Some(format!("{shortcut}: {}", clip_detail(reason)))
            }
            Failure::ShortcutInvalid(shortcut) => Some(clip_detail(shortcut)),
        }
    }

    /// Whether keeping the transcript around for a retry is meaningful.
    pub fn retryable(&self) -> bool {
        matches!(
            self,
            Failure::FocusChanged
                | Failure::Insertion(_)
                | Failure::InsertionBlocked
                | Failure::Clipboard(_)
        )
    }
}

/// OS error strings can be long; the overlay shows one line.
fn clip_detail(detail: &str) -> String {
    const MAX: usize = 160;
    let cleaned: String = detail.chars().filter(|c| !c.is_control()).collect();
    if cleaned.chars().count() <= MAX {
        cleaned
    } else {
        cleaned.chars().take(MAX - 1).collect::<String>() + "\u{2026}"
    }
}

pub type Result<T> = std::result::Result<T, Failure>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_match_the_wire_contract() {
        assert_eq!(ErrorCode::InsertionBlocked.as_str(), "insertion_blocked");
        assert_eq!(ErrorCode::AudioEmpty.as_str(), "audio_empty");
        assert_eq!(ErrorCode::TempCleanupFailed.as_str(), "temp_cleanup_failed");
    }

    #[test]
    fn serde_uses_snake_case_for_the_ui() {
        let json = serde_json::to_string(&ErrorCode::FocusChanged).unwrap();
        assert_eq!(json, "\"focus_changed\"");
    }

    #[test]
    fn only_insertion_failures_offer_a_retry() {
        assert!(Failure::FocusChanged.retryable());
        assert!(Failure::Clipboard("locked".into()).retryable());
        assert!(!Failure::AudioEmpty.retryable());
        assert!(!Failure::ModelMissing.retryable());
    }

    #[test]
    fn details_are_clipped_and_stripped_of_control_characters() {
        let long = "x".repeat(500);
        let detail = Failure::Internal(long).detail().unwrap();
        assert!(detail.chars().count() <= 160);

        let noisy = Failure::Internal("a\n\r\tb".into()).detail().unwrap();
        assert_eq!(noisy, "ab");
    }
}

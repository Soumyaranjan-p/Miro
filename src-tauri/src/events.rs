//! The event contract with the two webviews.
//!
//! Payload types live here rather than next to the commands that emit them, so
//! there is exactly one place to check when the TypeScript types in
//! `src/lib/types.ts` are updated.

use serde::Serialize;

use crate::audio::LevelFrame;
use crate::errors::{ErrorCode, Failure};
use crate::models::DownloadState;

pub const OVERLAY_EVENT: &str = "miro://overlay";
pub const SETTINGS_EVENT: &str = "miro://settings";
pub const RUNTIME_EVENT: &str = "miro://runtime-status";
pub const MODEL_PROGRESS_EVENT: &str = "miro://model-progress";
pub const MIC_LEVEL_EVENT: &str = "miro://mic-level";

/// What the overlay window is showing.
///
/// There is deliberately no transcript here. The retryable text stays inside
/// the Rust process and is reached only through `retry_insertion` /
/// `copy_pending_transcript`, so a transcript never enters a webview at all.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OverlayState {
    Hidden,
    /// A short-lived acknowledgment for a mode hotkey. Shown even when the
    /// mode did not change, so pressing Ctrl+Alt while already in Normal
    /// mode answers "Miro is calm" instead of silence.
    Mode {
        /// "home" (Miro calm) or "intent" (Miro on guard).
        #[serde(rename = "homeMode")]
        home_mode: &'static str,
    },
    Recording {
        #[serde(rename = "deviceLabel")]
        device_label: String,
        #[serde(rename = "startedAtMs")]
        started_at_ms: u64,
        #[serde(rename = "maxSeconds")]
        max_seconds: u32,
    },
    Processing {
        #[serde(rename = "startedAtMs")]
        started_at_ms: u64,
    },
    Inserted {
        characters: usize,
        #[serde(rename = "audioMs")]
        audio_ms: u128,
        /// Where the transcript is kept in memory for the Home panel's Copy
        /// and Paste actions. Still no transcript text in the event.
        #[serde(rename = "retryId")]
        retry_id: Option<u64>,
    },
    /// The transcript went to the clipboard instead of being typed.
    Copied {
        characters: usize,
    },
    Error {
        code: ErrorCode,
        detail: Option<String>,
        retryable: bool,
        #[serde(rename = "retryId")]
        retry_id: Option<u64>,
    },
}

impl OverlayState {
    pub fn error(failure: &Failure, retry_id: Option<u64>) -> Self {
        OverlayState::Error {
            code: failure.code(),
            detail: failure.detail(),
            retryable: failure.retryable() && retry_id.is_some(),
            retry_id,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub state: EngineStateWire,
    pub model_id: Option<String>,
    pub backend: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineStateWire {
    NoModel,
    Loading,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub registered: bool,
    pub shortcut: String,
    pub mechanism: &'static str,
    pub detail: Option<String>,
}

/// Status of one named global hotkey, addressed by role. The Shortcuts page
/// renders one row per entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub role: &'static str,
    pub registered: bool,
    pub shortcut: String,
    pub mechanism: &'static str,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneStatus {
    pub state: crate::audio::MicrophoneState,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempStatus {
    pub state: &'static str,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub version: String,
    pub platform: String,
    pub models_dir: String,
    pub engine: EngineStatus,
    pub shortcut: ShortcutStatus,
    /// Every named global hotkey with its live registration status.
    pub hotkeys: Vec<HotkeyStatus>,
    pub microphone: MicrophoneStatus,
    pub temp: TempStatus,
}

/// Progress for one model download.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgress {
    pub model_id: String,
    pub status: &'static str,
    pub received_bytes: u64,
    pub total_bytes: Option<u64>,
    pub detail: Option<String>,
}

/// Converts the internal download state into the wire shape.
pub fn progress_from_state(
    model_id: &str,
    status: &'static str,
    state: &DownloadState,
) -> ModelProgress {
    ModelProgress {
        model_id: model_id.to_string(),
        status,
        received_bytes: state.received_bytes,
        total_bytes: state.total_bytes,
        detail: None,
    }
}

pub use crate::audio::LevelFrame as MicLevel;

#[allow(dead_code)]
fn level_frame_is_serializable(frame: LevelFrame) -> LevelFrame {
    frame
}

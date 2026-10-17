//! Content-free event logging.
//!
//! Everything Miro is willing to say out loud is a variant of [`Event`], so a
//! transcript, a model output or a clipboard payload has no route into the log
//! at all - it is not that the code is careful, it is that the API cannot
//! express it.
//!
//! Logs go to stderr only. Miro writes no log file, which keeps the "allowed on
//! disk" list in `docs/PRIVACY.md` true.

use std::fmt;

#[derive(Debug)]
pub enum Event {
    Startup {
        version: &'static str,
        platform: String,
    },
    ConfigLoaded {
        path: String,
        existed: bool,
    },
    ConfigRecovered {
        path: String,
    },
    ConfigSaved,
    TempRecovery {
        removed: usize,
        failed: usize,
    },
    ModelDownloadStarted {
        model: String,
        bytes: u64,
    },
    ModelDownloadProgress {
        model: String,
        percent: u32,
    },
    ModelDownloadFinished {
        model: String,
    },
    ModelVerified {
        model: String,
        ok: bool,
    },
    EngineLoadStarted {
        model: String,
    },
    EngineReady {
        model: String,
        ms: u128,
    },
    EngineLoadFailed {
        code: &'static str,
    },
    ShortcutRegistered {
        shortcut: String,
        mechanism: &'static str,
    },
    ShortcutRegisterFailed {
        shortcut: String,
        code: &'static str,
    },
    ShortcutSuspended,
    ShortcutResumed,
    ShortcutTriggered {
        state: &'static str,
    },
    RecordingStarted {
        device: String,
        sample_rate: u32,
        channels: u16,
    },
    RecordingStopped {
        samples: usize,
        ms: u128,
    },
    RecordingFailed {
        code: &'static str,
    },
    TranscriptionStarted {
        samples: usize,
    },
    DictationStarted {
        mode: &'static str,
    },
    TranscriptionFinished {
        segments: usize,
        ms: u128,
        chars: usize,
    },
    TranscriptionFailed {
        code: &'static str,
    },
    TranscriptProcessed {
        characters: usize,
    },
    InsertionAttempt {
        target: &'static str,
        mode: &'static str,
    },
    InsertionFinished {
        ok: bool,
        code: &'static str,
        characters: usize,
    },
    ClipboardSnapshot {
        formats: usize,
        skipped: usize,
    },
    ClipboardRestored {
        ok: bool,
    },
    RetryWindowExpired,
    Cancelled {
        stage: &'static str,
    },
    Failure {
        code: &'static str,
        detail: String,
    },
    Shutdown,
}

impl fmt::Display for Event {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // One line per event, key=value, stable enough to grep in a dev loop.
        match self {
            Event::Startup { version, platform } => write!(f, "startup version={version} platform={platform}"),
            Event::ConfigLoaded { path, existed } => write!(f, "config.loaded path={path} existed={existed}"),
            Event::ConfigRecovered { path } => write!(f, "config.recovered path={path}"),
            Event::ConfigSaved => write!(f, "config.saved"),
            Event::TempRecovery { removed, failed } => {
                write!(f, "temp.recovery removed={removed} failed={failed}")
            }
            Event::ModelDownloadStarted { model, bytes } => {
                write!(f, "model.download.started model={model} bytes={bytes}")
            }
            Event::ModelDownloadProgress { model, percent } => {
                write!(f, "model.download.progress model={model} percent={percent}")
            }
            Event::ModelDownloadFinished { model } => write!(f, "model.download.finished model={model}"),
            Event::ModelVerified { model, ok } => write!(f, "model.verified model={model} ok={ok}"),
            Event::EngineLoadStarted { model } => write!(f, "engine.load.started model={model}"),
            Event::EngineReady { model, ms } => write!(f, "engine.ready model={model} ms={ms}"),
            Event::EngineLoadFailed { code } => write!(f, "engine.load.failed code={code}"),
            Event::ShortcutRegistered { shortcut, mechanism } => {
                write!(f, "shortcut.registered shortcut={shortcut} mechanism={mechanism}")
            }
            Event::ShortcutRegisterFailed { shortcut, code } => {
                write!(f, "shortcut.register.failed shortcut={shortcut} code={code}")
            }
            Event::ShortcutSuspended => write!(f, "shortcut.suspended"),
            Event::ShortcutResumed => write!(f, "shortcut.resumed"),
            Event::ShortcutTriggered { state } => write!(f, "shortcut.triggered state={state}"),
            Event::RecordingStarted {
                device,
                sample_rate,
                channels,
            } => write!(
                f,
                "audio.recording.started device={device} sample_rate={sample_rate} channels={channels}"
            ),
            Event::RecordingStopped { samples, ms } => {
                write!(f, "audio.recording.stopped samples={samples} ms={ms}")
            }
            Event::RecordingFailed { code } => write!(f, "audio.recording.failed code={code}"),
            Event::DictationStarted { mode } => write!(f, "session.started mode={mode}"),
            Event::TranscriptionStarted { samples } => {
                write!(f, "engine.transcribe.started samples={samples}")
            }
            Event::TranscriptionFinished { segments, ms, chars } => {
                write!(f, "engine.transcribe.finished segments={segments} ms={ms} chars={chars}")
            }
            Event::TranscriptionFailed { code } => write!(f, "engine.transcribe.failed code={code}"),
            Event::TranscriptProcessed { characters } => {
                write!(f, "transcript.processed characters={characters}")
            }
            Event::InsertionAttempt { target, mode } => {
                write!(f, "insertion.attempt target={target} mode={mode}")
            }
            Event::InsertionFinished {
                ok,
                code,
                characters,
            } => write!(f, "insertion.finished ok={ok} code={code} characters={characters}"),
            Event::ClipboardSnapshot { formats, skipped } => {
                write!(f, "clipboard.snapshot formats={formats} skipped={skipped}")
            }
            Event::ClipboardRestored { ok } => write!(f, "clipboard.restored ok={ok}"),
            Event::RetryWindowExpired => write!(f, "insertion.retry.expired"),
            Event::Cancelled { stage } => write!(f, "cancelled stage={stage}"),
            Event::Failure { code, detail } => write!(f, "failure code={code} detail={detail}"),
            Event::Shutdown => write!(f, "shutdown"),
        }
    }
}

pub fn event(event: Event) {
    eprintln!("[miro] {event}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_render_as_single_lines() {
        let rendered = Event::InsertionFinished {
            ok: false,
            code: "focus_changed",
            characters: 0,
        }
        .to_string();
        assert_eq!(
            rendered,
            "insertion.finished ok=false code=focus_changed characters=0"
        );
        assert!(!rendered.contains('\n'));
    }

    #[test]
    fn failure_detail_is_the_operator_detail_not_content() {
        let rendered = Event::Failure {
            code: "microphone_unavailable",
            detail: "device=Microphone Array".into(),
        }
        .to_string();
        assert!(rendered.contains("device=Microphone Array"));
    }
}

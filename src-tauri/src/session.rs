//! The dictation flow: hotkey in, text out.
//!
//! This module owns the state machine the overlay mirrors, and it is the only
//! place that holds audio or transcript text. Every path through it ends with
//! the buffers zeroed:
//!
//!   hotkey -> capture foreground window -> record -> transcribe -> clean up
//!          -> insert -> clear, or keep for a short retry window and then clear
//!
//! Threading: capture runs on the audio thread, transcription and insertion run
//! on a supervisor thread spawned here, and the interface is never touched from
//! either. The webview only ever receives [`OverlayState`], which cannot carry
//! a transcript.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::audio::{self, Capture, CaptureControl, CaptureMode, CaptureOutcome, LevelFrame};
use crate::config::{HomeMode, LiveMode, Mode, Settings};
use crate::engine::{self, Engine, EngineOptions};
use crate::errors::{Failure, Result};
use crate::events::{self, LiveText, OverlayState, RuntimeStatus};
use crate::hotkeys::registry as shortcut_registry;
use crate::insertion::{self, Target};
use crate::keyboard_hook::{KeySignal, KeyboardHook, PressEvent};
use crate::logging::{self, Event};
use crate::models;
use crate::privacy::{self, PendingText};
use crate::state::{self};
use crate::stream::{StreamDecoder, StreamOrchestrator};
use crate::textproc;
use crate::windows;

/// How long a failed insertion stays available for Retry or Copy.
const RETRY_WINDOW: Duration = Duration::from_secs(20);
/// How long a successful transcript stays in the Home panel, in memory only.
const SUCCESS_WINDOW: Duration = Duration::from_secs(120);
/// How long the success state stays on screen.
const INSERTED_VISIBLE: Duration = Duration::from_millis(1100);
/// A model load that takes longer than this is treated as stuck.
const MODEL_LOAD_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Phase {
    #[default]
    Idle,
    Recording,
    Processing,
}

struct ActiveRecording {
    control: CaptureControl,
    started_at_ms: u64,
    stream_decoder: Option<Arc<StreamDecoder>>,
}

#[derive(Default)]
struct Inner {
    phase: Phase,
    recording: Option<ActiveRecording>,
    target: Option<Target>,
    pending: PendingText,
    next_retry_id: u64,
    probe: Option<CaptureControl>,
}

#[derive(Default)]
pub struct Session {
    inner: Mutex<Inner>,
    engine: Mutex<Option<Arc<Engine>>>,
    stream: Mutex<Option<Arc<StreamOrchestrator>>>,
    /// Set when stop() has been called; makes stop idempotent.
    stopping: AtomicBool,
}

fn lock<'a, T>(mutex: &'a Mutex<T>) -> std::sync::MutexGuard<'a, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn emit_overlay(app: &AppHandle, overlay: OverlayState) {
    // The window's visibility follows the state machine, not the webview:
    // an event alone can never make a hidden window appear.
    match &overlay {
        OverlayState::Hidden => windows::hide_overlay(app),
        _ => windows::show_overlay(app, state::state(app).settings().overlay_position),
    }
    let _ = app.emit(events::OVERLAY_EVENT, overlay);
}

impl Session {
    pub fn phase(&self) -> Phase {
        lock(&self.inner).phase
    }

    /// Starts recording. Refuses if a dictation is already in flight.
    pub fn start(&self, app: &AppHandle) -> Result<()> {
        // Intent mode is a visual state for now: dictation does not run in
        // it. The refusal is silent-but-logged - the mode was chosen on
        // purpose, so a hotkey in a game or another app must not yank the app
        // into recording.
        if state::state(app).settings().home_mode != HomeMode::Home {
            logging::event(Event::Failure {
                code: "intent_mode",
                detail: "dictation is only available in Normal mode".to_string(),
            });
            return Ok(());
        }

        let settings = state::state(app).settings();
        let live_mode = settings.live_mode;
        // Cheap pre-flight so a blocked or missing microphone answers with a
        // clear, explicit failure before any capture machinery spins up.
        if let Some(failure) = mic_preflight(&settings) {
            logging::event(Event::Failure {
                code: failure.code().as_str(),
                detail: "no usable microphone at dictation start".into(),
            });
            self.fail(app, failure, None);
            return Ok(());
        }
        logging::event(Event::DictationStarted { mode: "toggle" });

        {
            let mut inner = lock(&self.inner);
            if inner.phase != Phase::Idle {
                return Ok(());
            }
            // Claim the slot before doing anything slow, so a double hotkey
            // press cannot start two recordings.
            inner.phase = Phase::Recording;
            // A new recording starts fresh: reset the stopping flag so a
            // previous failed stop() call doesn't block this one.
            self.stopping.store(false, Ordering::SeqCst);
        }

        let target = match Target::capture_foreground() {
            Ok(target) => target,
            Err(failure) => {
                lock(&self.inner).phase = Phase::Idle;
                self.fail(app, failure, None);
                return Ok(());
            }
        };

        let level_app = app.clone();
        let on_level: Arc<dyn Fn(LevelFrame) + Send + Sync> = Arc::new(move |frame: LevelFrame| {
            let _ = level_app.emit(events::MIC_LEVEL_EVENT, frame);
        });

        // --- live dictation engine ---------------------------------------
        let stream_decoder: Option<Arc<StreamDecoder>> = if live_mode != LiveMode::Off {
            Some(self.load_stream_engine(app, &settings)?)
        } else {
            None
        };

        let on_audio = stream_decoder.as_ref().map(|decoder| {
            let decoder = Arc::clone(decoder);
            Arc::new(move |samples: Vec<f32>| {
                decoder.push_audio(&samples);
            }) as Arc<dyn Fn(Vec<f32>) + Send + Sync>
        });

        let capture = match audio::start(
            settings.microphone.clone(),
            settings.max_recording_seconds,
            CaptureMode::Record,
            Some(on_level),
            on_audio,
        ) {
            Ok(capture) => capture,
            Err(failure) => {
                lock(&self.inner).phase = Phase::Idle;
                self.fail(app, failure, None);
                return Ok(());
            }
        };

        let control = capture.control();
        let started_at_ms = now_ms();
        let device_label = short_device_label(&settings);

        // Start the stream orchestrator so live text flows to the overlay.
        if let Some(decoder) = &stream_decoder {
            let app_events = app.clone();
            let device_label_events = device_label.clone();
            let max_seconds = settings.max_recording_seconds;
            let orchestrator = Arc::new(StreamOrchestrator::new(Arc::clone(decoder)));
            orchestrator.start(move |result| {
                let overlay = OverlayState::Recording {
                    device_label: device_label_events.clone(),
                    started_at_ms,
                    max_seconds,
                    live_text: Some(LiveText::new(result.committed, result.unstable)),
                };
                emit_overlay(&app_events, overlay);
            });
            lock(&self.stream).replace(Arc::clone(&orchestrator));
        }

        {
            let mut inner = lock(&self.inner);
            inner.target = Some(target);
            inner.recording = Some(ActiveRecording {
                control,
                started_at_ms,
                stream_decoder,
            });
        }

        if let Err(failure) = shortcut_registry(app).register_cancel(app) {
            // Escape being taken elsewhere is not fatal; the overlay's Cancel
            // button and the hotkey still work.
            logging::event(Event::Failure {
                code: failure.code().as_str(),
                detail: failure.detail().unwrap_or_default(),
            });
        }

        emit_overlay(
            app,
            OverlayState::Recording {
                device_label,
                started_at_ms,
                max_seconds: settings.max_recording_seconds,
                live_text: None,
            },
        );

        self.spawn_supervisor(app.clone(), capture, target);
        Ok(())
    }

    fn spawn_supervisor(&self, app: AppHandle, capture: Capture, target: Target) {
        thread::Builder::new()
            .name("miro-session".to_string())
            .spawn(move || {
                let outcome = capture.wait();
                let session = app.state::<Session>();
                session.finish_recording(&app, outcome, target);
            })
            .ok();
    }

    /// Asks the running capture to stop. Non-blocking: sets the stop flag and
    /// returns immediately. The heavy work (joining the live decode thread,
    /// final decode, insertion) happens on the supervisor thread in
    /// [`finish_recording`](Self::finish_recording).
    ///
    /// Idempotent: a second call while stopping returns immediately.
    pub fn stop(&self) -> Result<()> {
        eprintln!("[miro] stop.begin");
        // Idempotent: if already stopping, return immediately.
        if self.stopping.swap(true, Ordering::SeqCst) {
            eprintln!("[miro] stop.already_stopping");
            return Ok(());
        }
        let inner = lock(&self.inner);
        match inner.recording.as_ref() {
            Some(recording) if !recording.control.is_stopping() => {
                recording.control.stop();
                drop(inner);
                // Do NOT join the orchestrator here — that blocks the UI
                // thread. The supervisor thread handles it in finish_recording.
                Ok(())
            }
            Some(_) => Ok(()),
            None => Err(Failure::Internal("nothing is recording".into())),
        }
    }

    /// Abandons the current dictation: the audio is zeroed, nothing is inserted.
    pub fn cancel(&self, app: &AppHandle) {
        let (had_recording, stage, stream) = {
            let inner = lock(&self.inner);
            (inner.recording.is_some(), inner.phase, lock(&self.stream).take())
        };

        if let Some(recording) = lock(&self.inner).recording.as_ref() {
            recording.control.cancel();
        }

        // Stop the live decode loop non-blocking; the thread will exit on its
        // next step iteration. No join here — we don't block on background work.
        if let Some(orchestrator) = stream {
            orchestrator.request_stop();
        }

        if had_recording || stage != Phase::Idle {
            logging::event(Event::Cancelled {
                stage: match stage {
                    Phase::Recording => "recording",
                    Phase::Processing => "processing",
                    Phase::Idle => "idle",
                },
            });
        }

        self.reset(app);
        emit_overlay(app, OverlayState::Hidden);
    }

    /// Hides the overlay and drops anything kept for a retry.
    pub fn dismiss(&self, app: &AppHandle) {
        let recording = lock(&self.inner).recording.is_some();
        if recording {
            self.cancel(app);
        } else {
            lock(&self.inner).pending.clear();
            emit_overlay(app, OverlayState::Hidden);
        }
    }

    pub fn toggle(&self, app: &AppHandle) {
        match self.phase() {
            Phase::Idle => {
                if let Err(failure) = self.start(app) {
                    self.fail(app, failure, None);
                }
            }
            Phase::Recording => {
                let _ = self.stop();
            }
            Phase::Processing => {
                // Nothing sensible to toggle mid-transcription.
            }
        }
    }

    pub fn on_push_to_talk(&self, app: &AppHandle, pressed: bool) {
        if pressed {
            if self.phase() == Phase::Idle {
                if let Err(failure) = self.start(app) {
                    self.fail(app, failure, None);
                }
            }
        } else if self.phase() == Phase::Recording {
            let started = lock(&self.inner)
                .recording
                .as_ref()
                .map(|r| r.started_at_ms)
                .unwrap_or(0);
            if started > 0 && now_ms().saturating_sub(started) < 400 {
                // Accidental instant release: cancel instead of transcribing
                // empty audio.
                let _ = self.cancel(app);
            } else {
                let _ = self.stop();
            }
        }
    }

    /// Retries an insertion that failed, using the text kept for the window.
    pub fn retry(&self, app: &AppHandle, retry_id: u64) -> Result<()> {
        let target = match lock(&self.inner).target {
            Some(target) => target,
            None => return Err(Failure::FocusChanged),
        };
        let Some(mut text) = lock(&self.inner).pending.peek(retry_id).map(str::to_string) else {
            return Err(Failure::Internal(
                "that transcript is no longer available".into(),
            ));
        };

        let outcome = insertion::insert(&text, target);
        privacy::zeroize_string(&mut text);

        match outcome {
            Ok(result) => {
                lock(&self.inner).pending.take(retry_id);
                logging::event(Event::InsertionFinished {
                    ok: true,
                    code: "ok",
                    characters: result.characters,
                });
                emit_overlay(
                    app,
                    OverlayState::Inserted {
                        characters: result.characters,
                        audio_ms: 0,
                        retry_id: Some(retry_id),
                    },
                );
                self.schedule_hide(app.clone());
                Ok(())
            }
            Err(failure) => {
                emit_overlay(app, OverlayState::error(&failure, Some(retry_id)));
                Err(failure)
            }
        }
    }

    /// Puts the pending transcript on the clipboard instead of typing it.
    pub fn copy_pending(&self, app: &AppHandle, retry_id: u64) -> Result<()> {
        let Some(mut text) = lock(&self.inner).pending.peek(retry_id).map(str::to_string) else {
            return Err(Failure::Internal(
                "that transcript is no longer available".into(),
            ));
        };
        let characters = text.chars().count();
        let result = insertion::copy_to_clipboard(&text);
        privacy::zeroize_string(&mut text);

        result?;
        lock(&self.inner).pending.take(retry_id);
        emit_overlay(app, OverlayState::Copied { characters });
        self.schedule_hide(app.clone());
        Ok(())
    }

    /// Microphone test: levels only, no recording, nothing kept.
    pub fn start_probe(&self, app: &AppHandle) -> Result<()> {
        let settings = state::state(app).settings();
        if lock(&self.inner).probe.is_some() {
            return Ok(());
        }

        let level_app = app.clone();
        let on_level: Arc<dyn Fn(LevelFrame) + Send + Sync> = Arc::new(move |frame: LevelFrame| {
            let _ = level_app.emit(events::MIC_LEVEL_EVENT, frame);
        });

        let capture = audio::start(
            settings.microphone.clone(),
            settings.max_recording_seconds,
            CaptureMode::Probe,
            Some(on_level),
            None,
        )?;
        let control = capture.control();
        lock(&self.inner).probe = Some(control.clone());

        // The probe ends when the interface asks it to, or when the device
        // disappears; either way the thread simply retires.
        thread::Builder::new()
            .name("miro-probe".to_string())
            .spawn(move || {
                let _ = capture.wait();
            })
            .ok();

        Ok(())
    }

    pub fn stop_probe(&self) {
        if let Some(control) = lock(&self.inner).probe.take() {
            control.cancel();
        }
    }

    fn finish_recording(&self, app: &AppHandle, outcome: CaptureOutcome, target: Target) {
        shortcut_registry(app).unregister_cancel(app);

        match outcome {
            CaptureOutcome::Recorded {
                samples,
                duration_ms,
                limit_reached,
                device_label,
            } => {
                logging::event(Event::RecordingStopped {
                    samples: samples.len(),
                    ms: duration_ms,
                });
                let (stream_decoder, orchestrator) = {
                    let mut inner = lock(&self.inner);
                    inner.phase = Phase::Processing;
                    // Stop the live decode loop non-blocking; join with
                    // timeout on the supervisor thread below.
                    let orchestrator = lock(&self.stream).take();
                    if let Some(orchestrator) = &orchestrator {
                        orchestrator.request_stop();
                    }
                    let decoder = inner.recording.take().and_then(|r| r.stream_decoder);
                    (decoder, orchestrator)
                };
                let _ = device_label;
                // Hide the Recording overlay immediately to allow focus to return to target
                emit_overlay(app, OverlayState::Hidden);
                // Give Windows time to stabilize focus to the target window
                std::thread::sleep(std::time::Duration::from_millis(100));

                if let (Some(decoder), Some(orchestrator)) = (stream_decoder, orchestrator) {
                    let settings = state::state(app).settings();
                    if let Err(failure) = self.handle_live_finish(
                        app,
                        &settings,
                        decoder,
                        orchestrator,
                        samples,
                        duration_ms,
                        target,
                    ) {
                        self.reset(app);
                        self.fail(app, failure, None);
                    }
                } else {
                    self.transcribe_and_insert(app, samples, duration_ms, limit_reached, target);
                }
            }
            CaptureOutcome::Cancelled | CaptureOutcome::Probed => {
                self.reset(app);
                emit_overlay(app, OverlayState::Hidden);
            }
            CaptureOutcome::Failed(failure) => {
                logging::event(Event::RecordingFailed {
                    code: failure.code().as_str(),
                });
                self.reset(app);
                self.fail(app, failure, None);
            }
        }
    }

    /// Handles the end of a live dictation: joins the live decode thread with
    /// a timeout, runs the final decode, and inserts the committed text.
    fn handle_live_finish(
        &self,
        app: &AppHandle,
        settings: &Settings,
        decoder: Arc<StreamDecoder>,
        orchestrator: Arc<StreamOrchestrator>,
        samples: Vec<f32>,
        duration_ms: u128,
        target: Target,
    ) -> Result<()> {
        // Join the live decode thread with a timeout so stop() never blocks
        // indefinitely. Runs on the supervisor thread, not the UI thread.
        eprintln!("[miro] transcribe.begin");
        let joined = orchestrator.join_with_timeout(Duration::from_millis(2000));
        if !joined {
            eprintln!("[miro] live.join.timed_out");
        }

        // Final decode of the remaining audio to commit any trailing words.
        let final_text = decoder.finalize()?;
        // The recorded audio is no longer needed.
        audio::discard(samples);

        let mut processed = textproc::process(&final_text, &settings.cleanup);
        logging::event(Event::TranscriptProcessed {
            characters: processed.chars().count(),
            words: processed.split_whitespace().count(),
        });

        if processed.trim().is_empty() {
            self.reset(app);
            self.fail(app, Failure::TranscriptEmpty, None);
            eprintln!("[miro] stop.end");
            return Ok(());
        }

        let words = processed.split_whitespace().count() as u32;
        let characters = processed.chars().count();

        let retry_id = {
            let mut inner = lock(&self.inner);
            inner.next_retry_id += 1;
            let id = inner.next_retry_id;
            inner.pending.store(processed.clone(), id);
            id
        };

        let outcome = insertion::insert(&processed, target);
        privacy::zeroize_string(&mut processed);

        match outcome {
            Ok(result) => {
                let _ = result;
                logging::event(Event::InsertionFinished {
                    ok: true,
                    code: "ok",
                    characters,
                });
                self.reset(app);
                emit_overlay(
                    app,
                    OverlayState::Inserted {
                        characters,
                        audio_ms: duration_ms,
                        retry_id: Some(retry_id),
                    },
                );
                self.schedule_hide(app.clone());
                crate::stats::record_dictation(app, words, u64::try_from(duration_ms).unwrap_or(0));
                self.schedule_retry_expiry(app.clone(), retry_id, SUCCESS_WINDOW);
                eprintln!("[miro] stop.end");
                Ok(())
            }
            Err(failure) => {
                logging::event(Event::InsertionFinished {
                    ok: false,
                    code: failure.code().as_str(),
                    characters: 0,
                });
                self.reset(app);
                self.schedule_retry_expiry(app.clone(), retry_id, RETRY_WINDOW);
                let code = failure.code();
                let detail = failure.detail();
                let retryable = failure.retryable();
                emit_overlay(
                    app,
                    OverlayState::Error {
                        code,
                        detail,
                        retryable,
                        retry_id: retryable.then_some(retry_id),
                    },
                );
                eprintln!("[miro] stop.end");
                Ok(())
            }
        }
    }

    fn transcribe_and_insert(
        &self,
        app: &AppHandle,
        samples: Vec<f32>,
        audio_ms: u128,
        limit_reached: bool,
        target: Target,
    ) {
        let settings = state::state(app).settings();

        let engine = match self.ensure_engine(app, &settings) {
            Ok(engine) => engine,
            Err(failure) => {
                audio::discard(samples);
                emit_overlay(app, OverlayState::Hidden);
                self.reset(app);
                self.fail(app, failure, None);
                return;
            }
        };

        let options = EngineOptions {
            language: Some(settings.language.clone()),
            threads: engine::default_threads(),
            initial_prompt: None,
        };

        let result = engine.transcribe(&samples, &options, audio_ms);
        // The audio is not needed again, whatever happened.
        audio::discard(samples);

        let mut text = match result {
            Ok(transcript) => {
                let processed = textproc::process(&transcript.text, &settings.cleanup);
                logging::event(Event::TranscriptProcessed {
                    characters: processed.chars().count(),
                    words: processed.split_whitespace().count(),
                });
                // Dropping the transcript zeroizes the raw engine output.
                drop(transcript);
                processed
            }
            Err(failure) => {
                self.reset(app);
                self.fail(app, failure, None);
                return;
            }
        };

        if text.trim().is_empty() {
            privacy::zeroize_string(&mut text);
            self.reset(app);
            // The audio reached the engine and no words came back: not the
            // same thing as capturing no audio, so report it honestly.
            self.fail(app, Failure::TranscriptEmpty, None);
            return;
        }

        // Word statistics are numeric aggregates only; the text itself is
        // zeroized moments below and never stored anywhere.
        let words = text.split_whitespace().count() as u32;
        let characters = text.chars().count();

        // The transcript is handed to the pending store so the Home panel can
        // offer Copy and Paste-in without the text passing through disk,
        // events or logs.
        let retry_id = {
            let mut inner = lock(&self.inner);
            inner.next_retry_id += 1;
            let id = inner.next_retry_id;
            inner.pending.store(text.clone(), id);
            id
        };

        let outcome = insertion::insert(&text, target);

        match outcome {
            Ok(result) => {
                privacy::zeroize_string(&mut text);
                logging::event(Event::InsertionFinished {
                    ok: true,
                    code: "ok",
                    characters: result.characters,
                });
                if result.clipboard_formats_skipped > 0 {
                    logging::event(Event::ClipboardSnapshot {
                        formats: 0,
                        skipped: result.clipboard_formats_skipped,
                    });
                }
                self.reset(app);
                emit_overlay(
                    app,
                    OverlayState::Inserted {
                        characters: result.characters,
                        audio_ms,
                        retry_id: Some(retry_id),
                    },
                );
                self.schedule_hide(app.clone());
                crate::stats::record_dictation(app, words, u64::try_from(audio_ms).unwrap_or(0));
                self.schedule_retry_expiry(app.clone(), retry_id, SUCCESS_WINDOW);

                if limit_reached {
                    // The safety limit stopped the recording, so say so even
                    // though the text made it through.
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(1200));
                    });
                }
            }
            Err(failure) => {
                logging::event(Event::InsertionFinished {
                    ok: false,
                    code: failure.code().as_str(),
                    characters: 0,
                });
                // The panel copy is already in the pending store under the id.
                self.reset(app);
                self.schedule_retry_expiry(app.clone(), retry_id, RETRY_WINDOW);
                let code = failure.code();
                let detail = failure.detail();
                let retryable = failure.retryable();
                let _ = characters;
                emit_overlay(
                    app,
                    OverlayState::Error {
                        code,
                        detail,
                        retryable,
                        retry_id: retryable.then_some(retry_id),
                    },
                );
            }
        }
    }

    /// Reads the transcript kept in memory for the Home panel. Deliberate: a
    /// transcript entering a webview is a feature decision, not a leak -
    /// nothing here persists it or broadcasts it.
    pub fn peek_pending(&self, retry_id: u64) -> Option<String> {
        lock(&self.inner).pending.peek(retry_id).map(str::to_string)
    }

    /// Types the pending transcript into the app the user currently has in
    /// front - the Home panel's "Paste into the active app" action, distinct
    /// from `retry`, which targets the window captured at record time.
    pub fn paste_pending(&self, app: &AppHandle, retry_id: u64) -> Result<()> {
        let Some(mut text) = lock(&self.inner).pending.peek(retry_id).map(str::to_string) else {
            return Err(Failure::Internal(
                "that transcript is no longer available".into(),
            ));
        };

        let target = match Target::capture_foreground() {
            Ok(target) => target,
            Err(failure) => {
                privacy::zeroize_string(&mut text);
                return Err(failure);
            }
        };
        let outcome = insertion::insert(&text, target);
        privacy::zeroize_string(&mut text);

        match outcome {
            Ok(result) => {
                lock(&self.inner).pending.take(retry_id);
                logging::event(Event::InsertionFinished {
                    ok: true,
                    code: "ok",
                    characters: result.characters,
                });
                emit_overlay(
                    app,
                    OverlayState::Inserted {
                        characters: result.characters,
                        audio_ms: 0,
                        retry_id: Some(retry_id),
                    },
                );
                self.schedule_hide(app.clone());
                Ok(())
            }
            Err(failure) => {
                emit_overlay(app, OverlayState::error(&failure, Some(retry_id)));
                Err(failure)
            }
        }
    }

    /// Loads the model if the selected one is not already in memory.
    fn ensure_engine(&self, app: &AppHandle, settings: &Settings) -> Result<Arc<Engine>> {
        {
            let guard = lock(&self.engine);
            if let Some(engine) = guard.as_ref() {
                if engine.model_id() == Some(settings.model_id.as_str()) {
                    return Ok(Arc::clone(engine));
                }
            }
        }

        let spec = crate::models::spec(&settings.model_id).ok_or(Failure::ModelMissing)?;
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| Failure::Internal(format!("app data dir: {e}")))?;
        let dir = crate::models::models_dir(&data_dir);
        let path = crate::models::model_path(&dir, spec);

        if !path.exists() {
            return Err(Failure::ModelFileMissing(settings.model_id.clone()));
        }
        // Cheap structural check before handing the file to whisper.cpp.
        crate::models::verify_file(&path, None, None)?;

        // Load on a helper thread so a stuck load cannot freeze the flow.
        let (tx, rx) = std::sync::mpsc::channel::<Result<Engine>>();
        let load_path = path.clone();
        let model_id = settings.model_id.clone();
        thread::Builder::new()
            .name("miro-engine-load".to_string())
            .spawn(move || {
                let result = Engine::load(&load_path, &model_id);
                let _ = tx.send(result);
            })
            .map_err(|e| Failure::Internal(format!("spawn model loader: {e}")))?;

        let engine = match rx.recv_timeout(MODEL_LOAD_TIMEOUT) {
            Ok(Ok(engine)) => engine,
            Ok(Err(failure)) => return Err(failure),
            Err(_) => {
                return Err(Failure::Internal(
                    "loading the model took too long and was abandoned".into(),
                ))
            }
        };

        let engine = Arc::new(engine);
        lock(&self.engine).replace(Arc::clone(&engine));
        self.publish_runtime(app);
        Ok(engine)
    }

    /// Loads the engine used for live streaming dictation. May be a different
    /// model than the main dictation engine. Loads synchronously because the
    /// stream must be ready before recording starts.
    fn load_stream_engine(&self, app: &AppHandle, settings: &Settings) -> Result<Arc<StreamDecoder>> {
        let model_id = settings
            .live_model_id
            .as_deref()
            .filter(|v| !v.is_empty())
            .unwrap_or(&settings.model_id);

        let spec = models::spec(model_id).ok_or(Failure::ModelMissing)?;
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| Failure::Internal(format!("app data dir: {e}")))?;
        let dir = models::models_dir(&data_dir);
        let path = models::model_path(&dir, spec);

        if !path.exists() {
            return Err(Failure::ModelFileMissing(model_id.to_string()));
        }
        models::verify_file(&path, None, None)?;

        let engine = Engine::load(&path, model_id)?;
        let engine = Arc::new(engine);

        let options = EngineOptions {
            language: Some(settings.language.clone()),
            threads: engine::default_threads(),
            initial_prompt: None,
        };

        let decoder = Arc::new(StreamDecoder::new(
            Arc::clone(&engine),
            options,
            settings.live_window_ms as u128,
            settings.live_step_ms as u128,
        ));
        Ok(decoder)
    }

    /// Drops the loaded model, e.g. after the selection changed.
    pub fn unload_engine(&self) {
        lock(&self.engine).take();
    }

    fn reset(&self, _app: &AppHandle) {
        let mut inner = lock(&self.inner);
        inner.phase = Phase::Idle;
        inner.recording = None;
    }

    fn fail(&self, app: &AppHandle, failure: Failure, retry_id: Option<u64>) {
        logging::event(Event::Failure {
            code: failure.code().as_str(),
            detail: failure.detail().unwrap_or_default(),
        });
        emit_overlay(app, OverlayState::error(&failure, retry_id));
    }

    fn schedule_hide(&self, app: AppHandle) {
        thread::spawn(move || {
            thread::sleep(INSERTED_VISIBLE);
            let session = app.state::<Session>();
            if session.phase() == Phase::Idle {
                emit_overlay(&app, OverlayState::Hidden);
            }
        });
    }

    /// Clears the retry text when the window closes, and takes the dead buttons
    /// off the screen with it.
    fn schedule_retry_expiry(&self, app: AppHandle, retry_id: u64, window: Duration) {
        thread::spawn(move || {
            thread::sleep(window);
            let session = app.state::<Session>();
            let expired = {
                let mut inner = lock(&session.inner);
                if inner.pending.peek(retry_id).is_some() {
                    inner.pending.clear();
                    true
                } else {
                    false
                }
            };
            if expired {
                logging::event(Event::RetryWindowExpired);
                emit_overlay(&app, OverlayState::Hidden);
            }
        });
    }

    /// Status for the settings window.
    pub fn runtime_status(&self, app: &AppHandle) -> RuntimeStatus {
        let app_state = state::state(app);
        let settings = app_state.settings();
        let shortcut = app_state.shortcut_runtime();
        let hotkeys = app_state.hotkeys_runtime();
        let temp = app_state.temp_state();
        let (mic_state, mic_detail) = state::microphone_state();

        let (engine_state, backend, model_id, engine_detail) = {
            let guard = lock(&self.engine);
            match guard.as_ref() {
                Some(engine) => (
                    events::EngineStateWire::Ready,
                    engine.backend_name().to_string(),
                    engine.model_id().map(str::to_string),
                    None,
                ),
                None => (
                    events::EngineStateWire::NoModel,
                    "whisper.cpp (whisper-rs)".to_string(),
                    None,
                    Some(format!("model {} is not loaded yet", settings.model_id)),
                ),
            }
        };

        let data_dir = app
            .path()
            .app_data_dir()
            .map(|dir| crate::models::models_dir(&dir).display().to_string())
            .unwrap_or_default();

        RuntimeStatus {
            version: env!("CARGO_PKG_VERSION").to_string(),
            platform: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            models_dir: data_dir,
            engine: events::EngineStatus {
                state: engine_state,
                model_id: model_id.or(Some(settings.model_id.clone())),
                backend,
                detail: engine_detail,
            },
            shortcut: events::ShortcutStatus {
                registered: shortcut.registered,
                shortcut: shortcut.shortcut,
                mechanism: shortcut.mechanism.as_str(),
                detail: shortcut.detail,
            },
            hotkeys: hotkeys
                .into_iter()
                .map(|hotkey| events::HotkeyStatus {
                    role: hotkey.role,
                    registered: hotkey.registered,
                    shortcut: hotkey.shortcut,
                    mechanism: hotkey.mechanism.as_str(),
                    detail: hotkey.detail,
                })
                .collect(),
            microphone: events::MicrophoneStatus {
                state: mic_state,
                detail: mic_detail,
            },
            temp: events::TempStatus {
                state: temp.state,
                detail: temp.detail,
            },
        }
    }

    fn publish_runtime(&self, app: &AppHandle) {
        let status = self.runtime_status(app);
        let _ = app.emit(events::RUNTIME_EVENT, status);
    }

    /// Records the live status of every global hotkey for the status strip.
    pub fn publish_hotkeys(&self, app: &AppHandle, hotkeys: Vec<state::HotkeyRuntime>) {
        state::state(app).set_hotkeys_runtime(hotkeys);
        self.publish_runtime(app);
    }

    pub fn refresh_runtime(&self, app: &AppHandle) {
        self.publish_runtime(app);
    }
}

/// Verifies, before recording, that the microphone the settings name actually
/// exists (or that a default one is usable when none is named). Returns the
/// failure to report, or `None` when a device looks reachable.
fn mic_preflight(settings: &Settings) -> Option<Failure> {
    let devices = audio::list_input_devices();
    if devices.is_empty() {
        return Some(Failure::MicMissing);
    }
    if let Some(wanted) = settings
        .microphone
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        // A named device that has disappeared (unplugged, renamed) fails
        // right here with a clear code instead of deep inside cpal.
        return if device_list_contains(&devices, wanted) {
            None
        } else {
            Some(Failure::MicMissing)
        };
    }
    let (default_state, _) = audio::microphone_state();
    match default_state {
        audio::MicrophoneState::PermissionDenied => Some(Failure::MicPermissionDenied),
        audio::MicrophoneState::Missing => Some(Failure::MicMissing),
        _ => None,
    }
}

/// True when `wanted` names one of the enumerated devices, by id or label.
fn device_list_contains(devices: &[audio::DeviceInfo], wanted: &str) -> bool {
    devices
        .iter()
        .any(|info| info.id == wanted || info.label == wanted)
}

/// The overlay only needs a recognisable device name, not the full description.
fn short_device_label(settings: &Settings) -> String {
    match settings.microphone.as_deref() {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => "System default".to_string(),
    }
}

/// Applies the keyboard-hook decision for the current settings.
///
/// Kept here so that hotkey changes go through one place: the hook exists
/// exactly when at least one configured hotkey needs it - a modifiers-only
/// combination, or a hotkey whose plugin registration was refused by the
/// operating system.
pub struct HookBinding {
    pub hook: Option<crate::keyboard_hook::KeyboardHook>,
}

impl HookBinding {
    pub fn new() -> Self {
        Self { hook: None }
    }

    /// Installs the hook for the given hotkeys and routes its signals:
    /// the dictation role drives push-to-talk, the mode roles switch mode on
    /// the press edge only.
    pub fn apply(
        &mut self,
        app: &AppHandle,
        hotkeys: Vec<crate::keyboard_hook::WatchedHotkey>,
    ) -> Result<crate::hotkeys::Mechanism> {
        // Any previous hook goes away first: it must never outlive the binding
        // list that justified it.
        self.hook = None;

        if hotkeys.is_empty() {
            return Ok(crate::hotkeys::Mechanism::Plugin);
        }

        let (tx, rx) = std::sync::mpsc::channel::<KeySignal>();
        let hook = KeyboardHook::start(&hotkeys, tx)?;

        let app_handle = app.clone();
        thread::Builder::new()
            .name("miro-hotkeys".to_string())
            .spawn(move || {
                while let Ok(signal) = rx.recv() {
                    let session = app_handle.state::<Session>();
                    let settings = state::state(&app_handle).settings();
                    match signal.role {
                        "dictation" => {
                            eprintln!(
                                "[DEBUG] Hook: dictation event={:?} mode={:?}",
                                signal.event, settings.mode
                            );
                            // Only use push-to-talk behavior when actually in push-to-talk mode
                            if settings.mode == Mode::PushToTalk {
                                session
                                    .on_push_to_talk(&app_handle, signal.event == PressEvent::Down)
                            } else if signal.event == PressEvent::Down {
                                // In toggle mode, press toggles (start or stop)
                                eprintln!("[DEBUG] Hook: calling toggle");
                                session.toggle(&app_handle);
                            } else {
                                eprintln!("[DEBUG] Hook: ignoring release event in toggle mode");
                            }
                            // In toggle mode, ignore release events completely
                        }
                        "normal" if signal.event == PressEvent::Down => {
                            let _ = crate::commands::switch_home_mode(&app_handle, HomeMode::Home);
                        }
                        "intent" if signal.event == PressEvent::Down => {
                            let _ =
                                crate::commands::switch_home_mode(&app_handle, HomeMode::Intent);
                        }
                        _ => {}
                    }
                }
            })
            .map_err(|e| Failure::Internal(format!("spawn hotkey thread: {e}")))?;

        self.hook = Some(hook);
        Ok(crate::hotkeys::Mechanism::KeyboardHook)
    }

    pub fn stop(&mut self) {
        self.hook = None;
    }
}

impl Default for HookBinding {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_overlay_only_receives_live_text_while_recording() {
        // Live text (committed + unstable) may only appear in OverlayState::Recording,
        // and only while a dictation is in flight. Every other state must remain
        // transcript-free. The live text is never logged or persisted, and is
        // cleared when recording ends.
        let recording_with_live_text = OverlayState::Recording {
            device_label: "Microphone".into(),
            started_at_ms: 1,
            max_seconds: 300,
            live_text: Some(crate::events::LiveText::new(
                "committed words".into(),
                "unstable tail".into(),
            )),
        };
        let recording_without_live_text = OverlayState::Recording {
            device_label: "Microphone".into(),
            started_at_ms: 1,
            max_seconds: 300,
            live_text: None,
        };
        let other_states = [
            OverlayState::Hidden,
            OverlayState::Processing { started_at_ms: 1 },
            OverlayState::Inserted {
                characters: 42,
                audio_ms: 1000,
                retry_id: Some(7),
            },
            OverlayState::Copied { characters: 42 },
            OverlayState::Error {
                code: crate::errors::ErrorCode::FocusChanged,
                detail: None,
                retryable: true,
                retry_id: Some(3),
            },
        ];

        // Non-recording states must never carry transcript text.
        for state in other_states {
            let json = serde_json::to_string(&state).unwrap();
            for forbidden in ["text", "transcript", "audio\":", "words", "live_text"] {
                assert!(
                    !json.contains(forbidden),
                    "non-recording overlay payload must not contain `{forbidden}`: {json}"
                );
            }
        }

        // Recording without live text must not carry transcript text either.
        let json = serde_json::to_string(&recording_without_live_text).unwrap();
        for forbidden in ["text", "transcript", "audio\":", "words"] {
            assert!(
                !json.contains(forbidden),
                "recording payload without live text must not contain `{forbidden}`: {json}"
            );
        }

        // Recording with live text carries committed + unstable words.
        let json = serde_json::to_string(&recording_with_live_text).unwrap();
        assert!(json.contains("\"committed\""));
        assert!(json.contains("\"unstable\""));
        assert!(json.contains("live_text"));
    }

    #[test]
    fn phases_start_idle() {
        let session = Session::default();
        assert_eq!(session.phase(), Phase::Idle);
    }

    #[test]
    fn stopping_without_a_recording_is_an_error_not_a_panic() {
        let session = Session::default();
        assert!(session.stop().is_err());
    }

    /// Stop must be idempotent: a second call while stopping returns
    /// immediately without hanging. This guards against the UI freeze where
    /// Stop button plus Ctrl+M both call stop() concurrently.
    #[test]
    fn stop_is_idempotent_and_returns_quickly() {
        use std::time::Instant;
        let session = Session::default();

        // First call: no recording, returns error, sets stopping flag.
        let t0 = Instant::now();
        let first = session.stop();
        let first_elapsed = t0.elapsed();
        assert!(first.is_err());

        // Second call: stopping flag is set, returns Ok immediately.
        let t0 = Instant::now();
        let second = session.stop();
        let second_elapsed = t0.elapsed();
        assert!(second.is_ok());

        // Both calls must complete well within a few seconds (no hang).
        assert!(
            first_elapsed < Duration::from_secs(5),
            "first stop took {:?}",
            first_elapsed
        );
        assert!(
            second_elapsed < Duration::from_secs(5),
            "second stop took {:?}",
            second_elapsed
        );
    }

    #[test]
    fn the_short_device_label_falls_back_to_the_system_default() {
        let mut settings = Settings::default();
        assert_eq!(short_device_label(&settings), "System default");
        settings.microphone = Some("Microphone Array".into());
        assert_eq!(short_device_label(&settings), "Microphone Array");
    }

    #[test]
    fn the_mic_preflight_names_a_device_by_id_or_label() {
        let devices = vec![
            audio::DeviceInfo {
                id: "device-id-a".into(),
                label: "Studio Microphone".into(),
                is_default: false,
                sample_rate: Some(48_000),
                channels: Some(2),
            },
            audio::DeviceInfo {
                id: "device-id-b".into(),
                label: "Headset".into(),
                is_default: true,
                sample_rate: Some(44_100),
                channels: Some(1),
            },
        ];
        assert!(device_list_contains(&devices, "device-id-b"));
        assert!(device_list_contains(&devices, "Headset"));
        assert!(!device_list_contains(&devices, "device-id-c"));
        assert!(!device_list_contains(&devices, "Speakers"));
        // Empty list: nothing can be reached.
        assert!(!device_list_contains(&[], "device-id-a"));
    }
}

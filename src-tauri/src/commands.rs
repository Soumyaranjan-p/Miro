//! The interface's entire vocabulary.
//!
//! Every privileged operation available to a webview is one of these commands,
//! and each of them does the smallest thing that satisfies its name. The
//! webview itself has no filesystem, shell, dialog or network permission, so
//! nothing here can be bypassed by a compromised page.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::config::{Settings, SettingsPatch};
use crate::errors::{ErrorCode, Failure};
use crate::events::{self, ModelProgress, RuntimeStatus};
use crate::hotkeys::Hotkey;
use crate::models;
use crate::session::{HookBinding, Session};
use crate::state::{self, AppState};

/// Errors cross the boundary as a code the interface can translate, plus a
/// detail that is guaranteed by construction to be content-free.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: ErrorCode,
    pub detail: Option<String>,
}

impl From<Failure> for CommandError {
    fn from(failure: Failure) -> Self {
        Self {
            code: failure.code(),
            detail: failure.detail(),
        }
    }
}

type CmdResult<T> = Result<T, CommandError>;

/// One cancellation flag per in-flight download.
#[derive(Default)]
pub struct Downloads {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Downloads {
    fn begin(&self, model_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut guard) = self.active.lock() {
            if let Some(previous) = guard.insert(model_id.to_string(), Arc::clone(&flag)) {
                previous.store(true, Ordering::SeqCst);
            }
        }
        flag
    }

    fn cancel(&self, model_id: &str) -> bool {
        match self.active.lock() {
            Ok(guard) => match guard.get(model_id) {
                Some(flag) => {
                    flag.store(true, Ordering::SeqCst);
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }

    fn finish(&self, model_id: &str) {
        if let Ok(mut guard) = self.active.lock() {
            guard.remove(model_id);
        }
    }

    pub fn cancel_all(&self) {
        if let Ok(guard) = self.active.lock() {
            for flag in guard.values() {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutCheck {
    pub ok: bool,
    pub normalized: Option<String>,
    pub reason: Option<String>,
    pub conflict_with: Option<String>,
}

// ---------------------------------------------------------------- settings --

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session: State<'_, Session>,
    hooks: State<'_, Mutex<HookBinding>>,
    patch: SettingsPatch,
) -> CmdResult<Settings> {
    let before = app_state.settings();
    let after = app_state.update(patch)?;

    if after.shortcut != before.shortcut || after.mode != before.mode {
        apply_shortcut(&app, &after)?;
    }
    if after.model_id != before.model_id {
        // The next dictation loads the new model; the old one is released now.
        session.unload_engine();
    }
    if after.start_on_login != before.start_on_login {
        app_state.sync_start_on_login(&app)?;
    }

    session.refresh_runtime(&app);
    let _ = app.emit(events::SETTINGS_EVENT, after.clone());
    Ok(after)
}

/// (Re)registers the dictation shortcut and the push-to-talk binding for the
/// given settings. Used at start-up and whenever the mode or keys change.
pub fn apply_shortcut(app: &AppHandle, settings: &Settings) -> CmdResult<()> {
    let registry = crate::hotkeys::registry(app);
    let session = app.state::<Session>();
    let hooks = app.state::<Mutex<HookBinding>>();

    // Anything previously active goes first: a half-applied binding would mean
    // two shortcuts, or a hook running for a mode that no longer exists.
    if let Ok(mut binding) = hooks.lock() {
        binding.stop();
    }
    let _ = registry.unregister(app);

    let hotkey = Hotkey::parse(&settings.shortcut).map_err(CommandError::from)?;

    let mechanism = if settings.mode == crate::config::Mode::PushToTalk && !hotkey.plugin_expressible() {
        let mut binding = hooks
            .lock()
            .map_err(|_| CommandError::from(Failure::Internal("hook state was poisoned".into())))?;
        binding.apply(app, settings).map_err(CommandError::from)?
    } else {
        registry
            .register(app, hotkey.clone(), settings.mode)
            .map_err(CommandError::from)?
    };

    session.publish_shortcut(
        app,
        hotkey.to_canonical(),
        mechanism,
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn get_runtime_status(app: AppHandle, session: State<'_, Session>) -> RuntimeStatus {
    session.runtime_status(&app)
}

#[tauri::command]
pub fn check_shortcut(
    app: AppHandle,
    app_state: State<'_, AppState>,
    shortcut: String,
) -> ShortcutCheck {
    let settings = app_state.settings();
    let parsed = match Hotkey::parse(&shortcut) {
        Ok(parsed) => parsed,
        Err(failure) => {
            return ShortcutCheck {
                ok: false,
                normalized: None,
                reason: Some(match failure {
                    Failure::ShortcutInvalid(token) => format!("{token} cannot be used"),
                    other => other.to_string(),
                }),
                conflict_with: None,
            }
        }
    };

    let normalized = parsed.to_canonical();

    if settings.mode == crate::config::Mode::Toggle && !parsed.plugin_expressible() {
        return ShortcutCheck {
            ok: false,
            normalized: Some(normalized),
            reason: Some("Toggle mode needs a key: hold Ctrl+Alt+Shift alone cannot start and stop dictation".into()),
            conflict_with: None,
        };
    }

    // Prove the operating system accepts it, then hand the registration back to
    // whatever is currently configured.
    let registry = crate::hotkeys::registry(&app);
    let current = registry.active();
    let _ = registry.unregister(&app);

    let probe = if let Ok(plugin_shortcut) = parsed.to_plugin_shortcut() {
        app.global_shortcut().register(plugin_shortcut).map_err(|error| error.to_string())
    } else {
        Ok(())
    };

    let _ = app.global_shortcut().unregister_all();
    if let Some(current) = current {
        let _ = registry.register(&app, current, settings.mode);
    }

    match probe {
        Ok(()) => ShortcutCheck {
            ok: true,
            normalized: Some(normalized),
            reason: None,
            conflict_with: None,
        },
        Err(reason) => ShortcutCheck {
            ok: false,
            normalized: Some(normalized),
            reason: Some(reason.clone()),
            conflict_with: Some("another application".to_string()),
        },
    }
}

#[tauri::command]
pub fn suspend_shortcut(app: AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let settings = state.settings();
    crate::hotkeys::registry(&app)
        .suspend(&app)
        .map_err(CommandError::from)?;
    let _ = settings;
    Ok(())
}

#[tauri::command]
pub fn resume_shortcut(app: AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let settings = state.settings();
    crate::hotkeys::registry(&app)
        .resume(&app, settings.mode)
        .map_err(CommandError::from)?;
    Ok(())
}

// ------------------------------------------------------------------ models --

#[tauri::command]
pub fn list_models(app: AppHandle) -> CmdResult<Vec<models::ModelInfo>> {
    Ok(models::catalog(&models_directory(&app)?))
}

/// Asks the source how large a model is, so the confirmation dialog can show a
/// real number instead of a baked-in guess.
#[tauri::command]
pub async fn probe_model(
    http: State<'_, crate::HttpClient>,
    model_id: String,
) -> CmdResult<Option<u64>> {
    let spec = models::spec(&model_id).ok_or_else(|| CommandError::from(Failure::ModelMissing))?;
    let agent = http.agent();
    tauri::async_runtime::spawn_blocking(move || {
        models::probe_size(&agent, spec).map_err(CommandError::from)
    })
    .await
    .map_err(|e| CommandError::from(Failure::Internal(format!("probe task: {e}"))))?
}

#[tauri::command]
pub async fn start_model_download(
    app: AppHandle,
    http: State<'_, crate::HttpClient>,
    downloads: State<'_, Downloads>,
    model_id: String,
) -> CmdResult<()> {
    let spec = models::spec(&model_id).ok_or_else(|| CommandError::from(Failure::ModelMissing))?;
    let dir = models_directory(&app)?;
    let agent = http.agent();
    let cancel = downloads.begin(&model_id);

    let app_for_events = app.clone();
    let id_for_events = model_id.clone();
    emit_progress(&app, &model_id, "downloading", 0, None, None);

    let result = tauri::async_runtime::spawn_blocking(move || {
        models::download(&agent, &dir, spec, cancel, move |received, total| {
            emit_progress(&app_for_events, &id_for_events, "downloading", received, total, None);
        })
    })
    .await
    .map_err(|e| CommandError::from(Failure::Internal(format!("download task: {e}"))))?;

    downloads.finish(&model_id);

    match result {
        Ok(outcome) => {
            emit_progress(
                &app,
                &model_id,
                "installed",
                outcome.verification.bytes(),
                Some(outcome.verification.bytes()),
                Some(outcome.verification.summary()),
            );
            let _ = outcome.resumed_from;
            Ok(())
        }
        Err(failure) => {
            let status = if matches!(failure, Failure::DownloadCancelled) {
                "cancelled"
            } else {
                "failed"
            };
            emit_progress(&app, &model_id, status, 0, None, failure.detail());
            Err(CommandError::from(failure))
        }
    }
}

#[tauri::command]
pub fn cancel_model_download(downloads: State<'_, Downloads>, model_id: String) -> CmdResult<()> {
    downloads.cancel(&model_id);
    Ok(())
}

#[tauri::command]
pub fn delete_model(
    app: AppHandle,
    session: State<'_, Session>,
    app_state: State<'_, AppState>,
    model_id: String,
) -> CmdResult<()> {
    let spec = models::spec(&model_id).ok_or_else(|| CommandError::from(Failure::ModelMissing))?;
    let dir = models_directory(&app)?;
    models::delete(&dir, spec).map_err(CommandError::from)?;

    if app_state.settings().model_id == model_id {
        session.unload_engine();
    }
    session.refresh_runtime(&app);
    Ok(())
}

fn models_directory(app: &AppHandle) -> CmdResult<std::path::PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::from(Failure::Internal(format!("app data dir: {e}"))))?;
    let dir = models::models_dir(&data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| CommandError::from(Failure::Internal(format!("models dir: {e}"))))?;
    Ok(dir)
}

fn emit_progress(
    app: &AppHandle,
    model_id: &str,
    status: &'static str,
    received: u64,
    total: Option<u64>,
    detail: Option<String>,
) {
    let _ = app.emit(
        events::MODEL_PROGRESS_EVENT,
        ModelProgress {
            model_id: model_id.to_string(),
            status,
            received_bytes: received,
            total_bytes: total,
            detail,
        },
    );
}

// ------------------------------------------------------------------- audio --

#[tauri::command]
pub fn list_microphones() -> Vec<crate::audio::DeviceInfo> {
    crate::audio::list_input_devices()
}

#[tauri::command]
pub fn start_mic_probe(app: AppHandle, session: State<'_, Session>) -> CmdResult<()> {
    session.start_probe(&app).map_err(CommandError::from)
}

#[tauri::command]
pub fn stop_mic_probe(session: State<'_, Session>) {
    session.stop_probe();
}

// ---------------------------------------------------------------- overlay --

#[tauri::command]
pub fn dismiss_overlay(app: AppHandle, session: State<'_, Session>) {
    session.dismiss(&app);
}

#[tauri::command]
pub fn stop_recording(session: State<'_, Session>) -> CmdResult<()> {
    session.stop().map_err(CommandError::from)
}

#[tauri::command]
pub fn retry_insertion(
    app: AppHandle,
    session: State<'_, Session>,
    retry_id: u64,
) -> CmdResult<()> {
    session.retry(&app, retry_id).map_err(CommandError::from)
}

#[tauri::command]
pub fn copy_pending_transcript(
    app: AppHandle,
    session: State<'_, Session>,
    retry_id: u64,
) -> CmdResult<()> {
    session
        .copy_pending(&app, retry_id)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn toggle_dictation(app: AppHandle, session: State<'_, Session>) {
    session.toggle(&app);
}

// ------------------------------------------------------------------ shell --

#[tauri::command]
pub fn open_models_folder(app: AppHandle) -> CmdResult<()> {
    let dir = models_directory(&app)?;
    crate::windows::open_folder(&dir).map_err(CommandError::from)
}

#[tauri::command]
pub fn open_app_data_folder(app: AppHandle) -> CmdResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::from(Failure::Internal(format!("app data dir: {e}"))))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| CommandError::from(Failure::Internal(format!("app data dir: {e}"))))?;
    crate::windows::open_folder(&dir).map_err(CommandError::from)
}

#[tauri::command]
pub fn open_external(url: String) -> CmdResult<()> {
    crate::windows::open_external(&url).map_err(CommandError::from)
}

/// Snapshot of everything the interface may need at start-up, in one round trip.
#[tauri::command]
pub fn get_startup_info(app: AppHandle, session: State<'_, Session>) -> CmdResult<StartupInfo> {
    Ok(StartupInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        engine: session.runtime_status(&app).engine,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupInfo {
    pub version: String,
    pub engine: events::EngineStatus,
}

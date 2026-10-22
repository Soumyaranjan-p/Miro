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

use crate::config::{HomeMode, Mode, Settings, SettingsPatch};
use crate::errors::{ErrorCode, Failure};
use crate::events::{self, ModelProgress, RuntimeStatus};
use crate::hotkeys::{Hotkey, Mechanism};
use crate::models;
use crate::session::{HookBinding, Session};
use crate::state::AppState;

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
    _hooks: State<'_, Mutex<HookBinding>>,
    patch: SettingsPatch,
) -> CmdResult<Settings> {
    let before = app_state.settings();
    let after = app_state.update(patch)?;

    if after.shortcut != before.shortcut
        || after.normal_shortcut != before.normal_shortcut
        || after.incident_shortcut != before.incident_shortcut
        || after.mode != before.mode
    {
        apply_global_hotkeys(&app, &after)?;
    }
    if after.home_mode != before.home_mode {
        // Leaving a mode abandons whatever was in flight: Incident mode is a
        // visual state, so a recording migrating between modes would be
        // surprising.
        session.cancel(&app);
        crate::stats::on_mode_changed(&app);
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

/// The single source of truth for the application mode visible everywhere.
/// Used by the plugin-hotkey dispatcher and by nothing else lazily: the UI
/// goes through `set_settings`, which mirrors the same side effects.
pub fn switch_home_mode(app: &AppHandle, mode: HomeMode) -> CmdResult<()> {
    let app_state = app.state::<AppState>();
    let before = app_state.settings();
    if before.home_mode == mode {
        return Ok(());
    }
    let after = app_state.update(SettingsPatch {
        home_mode: Some(mode),
        ..SettingsPatch::default()
    })?;

    let session = app.state::<Session>();
    session.cancel(app);
    crate::stats::on_mode_changed(app);
    session.refresh_runtime(app);
    let _ = app.emit(events::SETTINGS_EVENT, after.clone());
    Ok(())
}

/// Plans and applies all three global hotkeys.
///
/// Used at start-up and whenever any of the hotkeys or the dictation
/// interaction mode changes. Per-hotkey outcomes are published even when the
/// overall call fails, so the Shortcuts page can show exactly which
/// combination lost the fight for the operating system.
pub fn apply_global_hotkeys(app: &AppHandle, settings: &Settings) -> CmdResult<()> {
    let registry = crate::hotkeys::registry(app);
    let hooks = app.state::<Mutex<HookBinding>>();

    // Anything previously active goes first: a half-applied binding would mean
    // two shortcuts, or a hook running for a hotkey that no longer exists.
    if let Ok(mut binding) = hooks.lock() {
        binding.stop();
    }
    let _ = registry.unregister(app);

    // One final status per hotkey, in display order.
    let mut results: Vec<(&str, bool, String, Option<String>, Mechanism)> = Vec::new();

    // Parse all three up front; a malformed hotkey is reported for its own
    // role, while the remaining two are still applied.
    let roles = [
        ("dictation", &settings.shortcut, settings.mode),
        ("normal", &settings.normal_shortcut, Mode::PushToTalk),
        ("incident", &settings.incident_shortcut, Mode::PushToTalk),
    ];

    let mut parsed: Vec<(&str, Hotkey)> = Vec::new();
    for (role, text, dictation_mode) in roles {
        match Hotkey::parse(text) {
            Ok(hotkey) => {
                // A modifiers-only dictation key cannot be a toggle: there is
                // no second press to call for.
                if role == "dictation"
                    && dictation_mode == Mode::Toggle
                    && !hotkey.plugin_expressible()
                {
                    results.push((
                        role,
                        false,
                        hotkey.to_canonical(),
                        Some(
                            "this combination cannot start and stop dictation on its own; choose a key"
                                .to_string(),
                        ),
                        Mechanism::None,
                    ));
                    continue;
                }
                parsed.push((role, hotkey));
            }
            Err(failure) => {
                results.push((
                    role,
                    false,
                    text.to_string(),
                    failure.detail(),
                    Mechanism::None,
                ));
            }
        }
    }

    let mut seen: Vec<String> = Vec::new();
    let mut hook_set: Vec<crate::keyboard_hook::WatchedHotkey> = Vec::new();

    for (role, hotkey) in parsed {
        let canonical = hotkey.to_canonical();
        if seen.contains(&canonical) {
            results.push((
                role,
                false,
                canonical.clone(),
                Some("this combination is already in use - pick a different one".to_string()),
                Mechanism::None,
            ));
            continue;
        }
        seen.push(canonical.clone());

        if hotkey.plugin_expressible() {
            match crate::hotkeys::register_plugin(app, &hotkey) {
                Ok(()) => {
                    results.push((role, true, canonical, None, Mechanism::Plugin));
                }
                Err(failure) => {
                    // The operating system refused the registration - typically
                    // because another application owns the combination. A
                    // single held key can still be watched by the keyboard
                    // hook, which observes without consuming.
                    if matches!(hotkey, Hotkey::SingleKey { .. }) {
                        results.push((
                            role,
                            true,
                            canonical,
                            failure.detail(),
                            Mechanism::KeyboardHook,
                        ));
                        hook_set.push(crate::keyboard_hook::watch(&hotkey, role)?);
                    } else {
                        results.push((
                            role,
                            false,
                            canonical,
                            failure
                                .detail()
                                .or_else(|| Some("already taken by another application".into())),
                            Mechanism::None,
                        ));
                    }
                }
            }
        } else {
            hook_set.push(crate::keyboard_hook::watch(&hotkey, role)?);
            results.push((role, true, canonical, None, Mechanism::KeyboardHook));
        }
    }

    // Install the hook, if anything needs it, before publishing: the hook
    // failing to start means those hotkeys are not really registered, and the
    // status has to say so honestly.
    let mut hook_failure: Option<String> = None;
    if !hook_set.is_empty() {
        let mut binding = hooks
            .lock()
            .map_err(|_| CommandError::from(Failure::Internal("hook state was poisoned".into())))?;
        if let Err(failure) = binding.apply(app, hook_set) {
            hook_failure = failure.detail();
        }
    }

    let mut runtimes: Vec<crate::state::HotkeyRuntime> = Vec::new();
    for (role, mut registered, canonical, detail, mut mechanism) in results {
        if hook_failure.is_some() && mechanism == Mechanism::KeyboardHook {
            registered = false;
            mechanism = Mechanism::None;
        }
        runtimes.push(crate::state::HotkeyRuntime {
            role: match role {
                "dictation" => "dictation",
                "normal" => "normal",
                _ => "incident",
            },
            registered,
            shortcut: canonical,
            mechanism,
            detail: if registered {
                detail
            } else {
                hook_failure.clone()
            },
        });
    }
    app.state::<Session>().publish_hotkeys(app, runtimes);

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

    // Two of our own hotkeys cannot be the same gesture.
    for (other, label) in [
        (&settings.shortcut, "the dictation hotkey"),
        (&settings.normal_shortcut, "the Normal mode hotkey"),
        (&settings.incident_shortcut, "the Incident mode hotkey"),
    ] {
        if let Ok(other_hotkey) = Hotkey::parse(other) {
            if other_hotkey.same_target(&parsed) {
                return ShortcutCheck {
                    ok: false,
                    normalized: Some(normalized),
                    reason: Some(format!("already used as {label}")),
                    conflict_with: Some(label.to_string()),
                };
            }
        }
    }

    // A modifiers-only dictation key cannot be a toggle: there is no second
    // press to call for. SingleKey is fine as a toggle (the key itself is
    // the second press).
    if settings.mode == Mode::Toggle && matches!(parsed, Hotkey::ModifiersOnly { .. }) {
        return ShortcutCheck {
            ok: false,
            normalized: Some(normalized),
            reason: Some("Toggle mode needs a key: hold Ctrl+Alt+Shift alone cannot start and stop dictation".into()),
            conflict_with: None,
        };
    }

    // Prove the operating system accepts it, then hand the registrations
    // back to whatever was live.
    let registry = crate::hotkeys::registry(&app);
    let current = registry.active();
    let _ = registry.unregister(&app);

    let probe = if let Ok(plugin_shortcut) = parsed.to_plugin_shortcut() {
        app.global_shortcut()
            .register(plugin_shortcut)
            .map_err(|error| error.to_string())
    } else {
        // Not plugin-expressible; the hook path will decide later.
        Ok(())
    };

    let _ = app.global_shortcut().unregister_all();
    for hotkey in current {
        let _ = crate::hotkeys::register_plugin(&app, &hotkey);
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
    // Everything goes: the plugin registrations and the hook. While the
    // settings window is capturing keys, no hotkey may fire - not even the
    // hook-delivered ones.
    crate::hotkeys::registry(&app)
        .suspend(&app)
        .map_err(CommandError::from)?;
    let hooks = app.state::<Mutex<HookBinding>>();
    if let Ok(mut binding) = hooks.lock() {
        binding.stop();
    }
    Ok(())
}

#[tauri::command]
pub fn resume_shortcut(app: AppHandle, app_state: State<'_, AppState>) -> CmdResult<()> {
    apply_global_hotkeys(&app, &app_state.settings())
}

// ------------------------------------------------------------------ splash --

/// The splash webview has painted its panel; reveal the window unless the
/// fallback timer already did. Idempotent by design.
#[tauri::command]
pub async fn notify_splash_ready(
    app: AppHandle,
    splash: tauri::State<'_, crate::state::SplashFlow>,
) -> CmdResult<()> {
    crate::windows::show_splash(&app, &splash);
    Ok(())
}

/// The splash motion finished; hide the window. Idempotent by design.
#[tauri::command]
pub async fn splash_finished(
    app: AppHandle,
    splash: tauri::State<'_, crate::state::SplashFlow>,
) -> CmdResult<()> {
    crate::windows::finish_splash(&app, &splash);
    Ok(())
}

/// The Windows account name, for the Home greeting card. Display only.
#[tauri::command]
pub async fn get_user_display_name() -> CmdResult<String> {
    let mut name = std::env::var("USERNAME").unwrap_or_default();
    if let Some(first) = name.get(0..1) {
        name = first.to_uppercase() + name[1..].as_ref();
    }
    Ok(name)
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
            emit_progress(
                &app_for_events,
                &id_for_events,
                "downloading",
                received,
                total,
                None,
            );
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

/// The transcript kept in memory for the Home panel, addressed by the id the
/// event carried. Deliberate feature decision: the text enters a webview so
/// the user can read, copy and paste it, but nothing here persists it.
#[tauri::command]
pub fn get_pending_transcript(session: State<'_, Session>, retry_id: u64) -> CmdResult<String> {
    session.peek_pending(retry_id).ok_or_else(|| CommandError {
        code: ErrorCode::Cancelled,
        detail: Some("that transcript is no longer available".into()),
    })
}

/// Types the pending transcript into the app the user has in front.
#[tauri::command]
pub fn paste_pending(app: AppHandle, session: State<'_, Session>, retry_id: u64) -> CmdResult<()> {
    session
        .paste_pending(&app, retry_id)
        .map_err(CommandError::from)
}

/// Usage statistics: numeric aggregates only, stored next to the config.
#[tauri::command]
pub fn get_stats(app: AppHandle) -> CmdResult<crate::stats::StatsSummary> {
    crate::stats::summary(&app).map_err(CommandError::from)
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

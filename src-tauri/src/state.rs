//! Application state that outlives a single dictation.
//!
//! Deliberately small: settings, the config store they came from, and the few
//! pieces of runtime bookkeeping the status strip reports. Audio and text are
//! *not* here - those belong to [`crate::session`], live in memory, and are
//! cleared the moment they are no longer needed.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::audio::MicrophoneState;
use crate::config::{ConfigStore, Settings, SettingsPatch};
use crate::errors::{Failure, Result};
use crate::hotkeys::Mechanism;

pub struct AppState {
    pub config: ConfigStore,
    settings: Mutex<Settings>,
    shortcut: Mutex<ShortcutRuntime>,
    pub temp_state: Mutex<TempState>,
}

#[derive(Debug, Clone)]
pub struct ShortcutRuntime {
    pub registered: bool,
    pub shortcut: String,
    pub mechanism: Mechanism,
    pub detail: Option<String>,
}

impl Default for ShortcutRuntime {
    fn default() -> Self {
        Self {
            registered: false,
            shortcut: String::new(),
            mechanism: Mechanism::None,
            detail: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TempState {
    pub state: &'static str,
    pub detail: Option<String>,
}

impl Default for TempState {
    fn default() -> Self {
        Self {
            state: "clean",
            detail: None,
        }
    }
}

impl AppState {
    pub fn new(config: ConfigStore, settings: Settings) -> Self {
        Self {
            config,
            settings: Mutex::new(settings),
            shortcut: Mutex::new(ShortcutRuntime::default()),
            temp_state: Mutex::new(TempState::default()),
        }
    }

    pub fn settings(&self) -> Settings {
        match self.settings.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    /// Applies a patch, persists it, and returns the stored result.
    ///
    /// The file is written before the in-memory value changes, so a failed save
    /// does not leave the interface showing a setting that was never stored.
    pub fn update(&self, patch: SettingsPatch) -> Result<Settings> {
        let mut candidate = self.settings();
        candidate.apply(patch);
        self.config.save(&candidate)?;
        match self.settings.lock() {
            Ok(mut guard) => *guard = candidate.clone(),
            Err(poisoned) => *poisoned.into_inner() = candidate.clone(),
        }
        Ok(candidate)
    }

    pub fn set_shortcut_runtime(&self, runtime: ShortcutRuntime) {
        if let Ok(mut guard) = self.shortcut.lock() {
            *guard = runtime;
        }
    }

    pub fn shortcut_runtime(&self) -> ShortcutRuntime {
        match self.shortcut.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    pub fn set_temp_state(&self, state: &'static str, detail: Option<String>) {
        if let Ok(mut guard) = self.temp_state.lock() {
            *guard = TempState { state, detail };
        }
    }

    pub fn temp_state(&self) -> TempState {
        match self.temp_state.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    /// Persists the start-on-login preference through the autostart plugin's
    /// own registry entry, which is the only place that setting lives.
    pub fn sync_start_on_login(&self, app: &AppHandle) -> Result<()> {
        use tauri_plugin_autostart::ManagerExt;
        let desired = self.settings().start_on_login;
        let manager = app.autolaunch();
        let enabled = manager.is_enabled().unwrap_or(false);
        if desired == enabled {
            return Ok(());
        }
        let outcome = if desired {
            manager.enable()
        } else {
            manager.disable()
        };
        outcome.map_err(|e| Failure::ConfigWrite(format!("start on login: {e}")))
    }
}

pub fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

/// Microphone availability for the status strip, without opening a stream.
pub fn microphone_state() -> (MicrophoneState, Option<String>) {
    crate::audio::microphone_state()
}

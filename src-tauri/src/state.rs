//! Application state that outlives a single dictation.
//!
//! Deliberately small: settings, the config store they came from, and the few
//! pieces of runtime bookkeeping the status strip reports. Audio and text are
//! *not* here - those belong to [`crate::session`], live in memory, and are
//! cleared the moment they are no longer needed.

use std::sync::{atomic::AtomicU64, Mutex};

use tauri::{AppHandle, Manager};

use crate::audio::MicrophoneState;
use crate::config::{ConfigStore, HomeMode, Settings, SettingsPatch};
use crate::errors::{Failure, Result};
use crate::hotkeys::Mechanism;

pub struct AppState {
    pub config: ConfigStore,
    settings: Mutex<Settings>,
    shortcut: Mutex<ShortcutRuntime>,
    /// Status of every global hotkey, one entry each, for the Shortcuts page.
    hotkeys: Mutex<Vec<HotkeyRuntime>>,
    /// Which mode has been active since when, for usage statistics. Holds
    /// (mode, unix ms since) while a mode is in force.
    mode_anchor: Mutex<Option<(HomeMode, u64)>>,
    /// Debounce window for toggle-mode press repeats: some Windows hotkey
    /// registrations repeat while a key is held, and a toggle must not
    /// start-stop-flicker under them.
    pub last_toggle_ms: AtomicU64,
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
pub struct HotkeyRuntime {
    pub role: &'static str,
    pub registered: bool,
    pub shortcut: String,
    pub mechanism: Mechanism,
    pub detail: Option<String>,
}

impl Default for HotkeyRuntime {
    fn default() -> Self {
        Self {
            role: "dictation",
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
            hotkeys: Mutex::new(Vec::new()),
            mode_anchor: Mutex::new(None),
            last_toggle_ms: AtomicU64::new(0),
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

    pub fn set_hotkeys_runtime(&self, hotkeys: Vec<HotkeyRuntime>) {
        if let Ok(mut guard) = self.hotkeys.lock() {
            *guard = hotkeys;
        }
    }

    pub fn hotkeys_runtime(&self) -> Vec<HotkeyRuntime> {
        match self.hotkeys.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    /// Takes the current mode anchor out (flush time of the outgoing mode).
    pub fn take_mode_anchor(&self) -> Option<(HomeMode, u64)> {
        match self.mode_anchor.lock() {
            Ok(mut guard) => guard.take(),
            Err(poisoned) => poisoned.into_inner().take(),
        }
    }

    /// Sets the mode anchor: this mode started now.
    pub fn set_mode_anchor(&self, mode: HomeMode, since_ms: u64) {
        match self.mode_anchor.lock() {
            Ok(mut guard) => *guard = Some((mode, since_ms)),
            Err(poisoned) => *poisoned.into_inner() = Some((mode, since_ms)),
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

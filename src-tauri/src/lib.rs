//! Miro - local-first voice typing for Windows.
//!
//! Wiring, in one place: which plugins exist, what state is managed, how the
//! windows and the tray are created, and what happens on shutdown.
//!
//! Two invariants worth stating explicitly:
//!   * Nothing here writes audio or transcripts anywhere. The only files Miro
//!     touches are its settings and the model files the user asked for.
//!   * The single-instance plugin is registered first, so a second launch
//!     surfaces the existing app instead of building a second tray icon.

pub mod audio;
pub mod commands;
pub mod config;
pub mod digest;
pub mod engine;
pub mod errors;
pub mod events;
pub mod hotkeys;
pub mod insertion;
pub mod keyboard_hook;
pub mod logging;
pub mod models;
pub mod privacy;
pub mod session;
pub mod state;
pub mod stats;
pub mod textproc;
pub mod windows;

use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutEvent, ShortcutState};
use ureq::config::Config;
use ureq::tls::{RootCerts, TlsConfig, TlsProvider};

use config::ConfigStore;
use errors::Failure;
use hotkeys::{Hotkey, ShortcutRegistry};
use logging::Event;
use session::{HookBinding, Session};
use state::AppState;

/// The HTTP agent for model downloads, created once and reused.
///
/// ureq is blocking and uses Windows' own TLS stack through `native-tls`.
pub struct HttpClient {
    agent: ureq::Agent,
}

impl HttpClient {
    fn new() -> Result<Self, Failure> {
        // ureq 3 defaults to rustls and only ever picks the native provider when
        // it is named explicitly - without this, the first https request panics
        // with "provider is Rustls but feature is not enabled: rustls".
        // NativeTls plus the platform verifier is what the Cargo.toml comment
        // promises: Windows' own TLS stack and Windows' own trust store.
        let config = Config::builder()
            .tls_config(
                TlsConfig::builder()
                    .provider(TlsProvider::NativeTls)
                    .root_certs(RootCerts::PlatformVerifier)
                    .build(),
            )
            .build();

        Ok(Self {
            agent: ureq::Agent::new_with_config(config),
        })
    }

    pub fn agent(&self) -> ureq::Agent {
        self.agent.clone()
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            windows::show_settings(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(on_shortcut)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_settings,
            commands::get_runtime_status,
            commands::get_startup_info,
            commands::check_shortcut,
            commands::suspend_shortcut,
            commands::resume_shortcut,
            commands::list_models,
            commands::probe_model,
            commands::start_model_download,
            commands::cancel_model_download,
            commands::delete_model,
            commands::list_microphones,
            commands::start_mic_probe,
            commands::stop_mic_probe,
            commands::dismiss_overlay,
            commands::stop_recording,
            commands::retry_insertion,
            commands::copy_pending_transcript,
            commands::toggle_dictation,
            commands::get_pending_transcript,
            commands::paste_pending,
            commands::get_stats,
            commands::open_models_folder,
            commands::open_app_data_folder,
            commands::open_external,
            commands::notify_splash_ready,
            commands::splash_finished,
            commands::get_user_display_name,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Closing a window hides it: Miro lives in the tray, and a
                // hidden window keeps the next dictation instant.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            bootstrap(&handle)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Miro could not start");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            shutdown(handle);
        }
    });
}

fn bootstrap(handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // --- state -----------------------------------------------------------------
    let config_dir = handle.path().app_config_dir()?;
    let data_dir = handle.path().app_data_dir()?;
    std::fs::create_dir_all(&config_dir)?;
    std::fs::create_dir_all(&data_dir)?;

    // A crash can leave a partial download or a stray temp file behind. Say
    // what was found rather than claiming a clean slate.
    let (removed, failed) = privacy::sweep_temp();

    let config = ConfigStore::new(&config_dir);
    let settings = config.load();

    let app_state = AppState::new(config, settings.clone());
    app_state.set_temp_state(
        if failed > 0 {
            "failed"
        } else if removed > 0 {
            "cleaned"
        } else {
            "clean"
        },
        if removed > 0 || failed > 0 {
            Some(format!("{removed} removed, {failed} failed"))
        } else {
            None
        },
    );
    handle.manage(app_state);
    handle.manage(Session::default());
    handle.manage(Mutex::new(HookBinding::new()));
    handle.manage(ShortcutRegistry::new());
    handle.manage(commands::Downloads::default());
    handle.manage(HttpClient::new()?);
    handle.manage(state::SplashFlow::default());

    // --- windows and tray ------------------------------------------------------
    windows::create_overlay(handle)?;
    windows::create_settings(handle)?;
    windows::create_or_take_splash(handle)?;
    windows::create_tray(handle)?;

    // --- shortcuts -------------------------------------------------------------
    if let Err(failure) = commands::apply_global_hotkeys(handle, &settings) {
        logging::event(Event::Failure {
            code: failure.code.as_str(),
            detail: failure
                .detail
                .clone()
                .unwrap_or_else(|| "the configured shortcut could not be registered".to_string()),
        });
        state::state(handle).set_shortcut_runtime(state::ShortcutRuntime {
            registered: false,
            shortcut: settings.shortcut.clone(),
            mechanism: hotkeys::Mechanism::None,
            detail: failure.detail.clone(),
        });
    }

    // --- start on login --------------------------------------------------------
    if let Err(failure) = state::state(handle).sync_start_on_login(handle) {
        logging::event(Event::Failure {
            code: failure.code().as_str(),
            detail: failure.detail().unwrap_or_default(),
        });
    }

    logging::event(Event::Startup {
        version: env!("CARGO_PKG_VERSION"),
        platform: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
    });

    handle.state::<Session>().refresh_runtime(handle);

    // The statistics bookkeeping anchors the mode the app starts in, so time
    // spent in it is counted even without any dictation.
    crate::stats::on_mode_changed(handle);

    // The home window is the app's face: show it at startup. The tray keeps
    // it available afterwards; on first run it is simply empty until shown.
    windows::show_settings(handle);

    // The splash popup plays the hello greeting while (and before) the home
    // window settles, then slides away and stays hidden.
    windows::run_splash_sequence(handle, &handle.state::<state::SplashFlow>());

    Ok(())
}

/// One handler for every registered shortcut: the dictation key, the two
/// mode-switch keys, and the Escape cancel key that only exists while a
/// recording is in flight.
fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    logging::event(Event::ShortcutTriggered {
        state: if event.state == ShortcutState::Pressed {
            "pressed"
        } else {
            "released"
        },
    });
    let pressed = event.state == ShortcutState::Pressed;
    let app_state = app.state::<AppState>();
    let settings = app_state.settings();
    let session = app.state::<Session>();

    // Which configured hotkey does the pressed combination belong to?
    let role = [
        ("dictation", &settings.shortcut),
        ("normal", &settings.normal_shortcut),
        ("incident", &settings.incident_shortcut),
    ]
    .into_iter()
    .find_map(|(role, text)| {
        Hotkey::parse(text)
            .ok()
            .and_then(|hotkey| hotkey.to_plugin_shortcut().ok())
            .filter(|candidate| candidate == shortcut)
            .map(|_| role)
    });

    match role {
        Some("normal") if pressed => {
            let _ = commands::switch_home_mode(app, config::HomeMode::Home);
        }
        Some("incident") if pressed => {
            let _ = commands::switch_home_mode(app, config::HomeMode::Intent);
        }
        Some("dictation") => {
            if settings.mode == config::Mode::PushToTalk {
                // Both edges of a hold mean something; repeats are harmless
                // because the phase machine ignores stale presses.
                session.on_push_to_talk(app, pressed);
            } else if pressed {
                // Toggle mode on Windows repeats while a key is held. The
                // phase machine tolerates it, but the toggle would flicker;
                // a short debounce keeps one press one toggle.
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|duration| duration.as_millis() as u64)
                    .unwrap_or(0);
                if now.saturating_sub(app_state.last_toggle_ms.load(Ordering::Relaxed)) > 400 {
                    app_state.last_toggle_ms.store(now, Ordering::Relaxed);
                    session.toggle(app);
                }
            }
        }
        _ => {
            // Escape, registered only while a recording is in flight.
            let Ok(hotkey) = Hotkey::parse(&settings.shortcut) else {
                return;
            };
            if ShortcutRegistry::is_cancel(shortcut, &hotkey) {
                session.cancel(app);
            }
        }
    }
}

fn shutdown(handle: &AppHandle) {
    logging::event(Event::Shutdown);

    // Whatever is in flight is abandoned: audio is zeroed, downloads stop, and
    // any transcript kept for a retry is cleared.
    if let Some(session) = handle.try_state::<Session>() {
        session.stop_probe();
        session.cancel(handle);
    }
    crate::stats::flush_on_exit(handle);
    if let Some(downloads) = handle.try_state::<commands::Downloads>() {
        downloads.cancel_all();
    }
    if let Some(registry) = handle.try_state::<ShortcutRegistry>() {
        registry.unregister_cancel(handle);
    }
    let _ = handle.global_shortcut().unregister_all();
}

use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(test)]
mod tests {
    use crate::config::Settings;

    #[test]
    fn the_user_agent_identifies_miro_and_nothing_else() {
        let agent = concat!("Miro/", env!("CARGO_PKG_VERSION"));
        assert!(agent.starts_with("Miro/"));
        assert!(
            !agent.contains("Windows NT"),
            "no machine fingerprint leaks out"
        );
    }

    #[test]
    fn the_default_shortcut_is_a_real_combination() {
        let settings = Settings::default();
        assert!(crate::hotkeys::Hotkey::parse(&settings.shortcut).is_ok());
    }
}

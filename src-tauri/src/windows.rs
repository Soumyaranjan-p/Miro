//! The two windows and the tray icon.
//!
//! The overlay is the interesting one. Everything here exists to make sure it
//! can be seen without ever being *focused*: no activation, no taskbar entry,
//! no Alt-Tab, and click diagnostics that cannot steal the caret from the
//! application the user is dictating into.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::config::OverlayPosition;
use crate::errors::{Failure, Result};
use crate::insertion::win;

pub const OVERLAY_LABEL: &str = "overlay";
pub const SETTINGS_LABEL: &str = "main";
pub const SPLASH_LABEL: &str = "splash";
const OVERLAY_WIDTH: f64 = 380.0;
const OVERLAY_HEIGHT: f64 = 132.0;
/// Gap between the overlay and the edge of the work area.
const OVERLAY_MARGIN: i32 = 28;

/// The splash panel: a small square that slides in on the right edge of the
/// primary monitor while the mascot greets the user, then slides away again.
const SPLASH_SIZE: f64 = 220.0;
/// Gap between the splash panel and the right edge of the work area.
const SPLASH_MARGIN: i32 = 10;
/// If the webview has not reported the panel as painted after this long,
/// reveal the window anyway; a blank flash beats no splash at all.
const SPLASH_READY_FALLBACK_MS: u64 = 300;
/// Shows the slide-in (260ms), the greeting hold (2000ms) and the slide-out
/// (300ms), rounded up with slack so the webview always finishes first.
const SPLASH_TOTAL_MS: u64 = 2_700;

/// Creates the overlay window, hidden, and makes it non-activating.
pub fn create_overlay(app: &AppHandle) -> Result<WebviewWindow> {
    let window =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
            .title("Miro")
            .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .focused(false)
            .visible(false)
            .build()
            .map_err(|e| Failure::Internal(format!("create overlay window: {e}")))?;

    let hwnd = raw_hwnd(&window)?;
    win::make_non_activating(hwnd)?;

    Ok(window)
}

/// Creates the settings window, hidden. It is an ordinary application window:
/// it takes focus, it appears in the taskbar, it behaves like Windows expects.
pub fn create_settings(app: &AppHandle) -> Result<WebviewWindow> {
    let window =
        WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
            .title("Miro")
            .inner_size(820.0, 760.0)
            .min_inner_size(620.0, 520.0)
            .visible(false)
            .center()
            .build()
            .map_err(|e| Failure::Internal(format!("create settings window: {e}")))?;
    Ok(window)
}

/// Creates the splash window, hidden, on the first launch of the process; a
/// window already managed under the splash label is reused untouched.
///
/// Like the overlay it never activates, never shows in the taskbar and has no
/// shadow - but it is pure decoration, so clicks pass through entirely.
pub fn create_or_take_splash(app: &AppHandle) -> Result<WebviewWindow> {
    if let Some(existing) = app.get_webview_window(SPLASH_LABEL) {
        return Ok(existing);
    }

    let window =
        WebviewWindowBuilder::new(app, SPLASH_LABEL, WebviewUrl::App("splash.html".into()))
            .title("Miro")
            .inner_size(SPLASH_SIZE, SPLASH_SIZE)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .focused(false)
            .visible(false)
            .build()
            .map_err(|e| Failure::Internal(format!("create splash window: {e}")))?;

    let hwnd = raw_hwnd(&window)?;
    win::make_non_activating(hwnd)?;
    let _ = window.set_ignore_cursor_events(true);

    Ok(window)
}

/// Reveals the splash once: right-edge of the primary monitor, vertically
/// centred. The webview reports when the panel is painted; this is a no-op if
/// the fallback timer got there first, so the motion can never restart.
pub fn show_splash(app: &AppHandle, splash: &crate::state::SplashFlow) {
    if !splash.begin_reveal() {
        return;
    }
    let Some(window) = app.get_webview_window(SPLASH_LABEL) else {
        return;
    };
    if let Err(failure) = place_splash(&window) {
        crate::logging::event(crate::logging::Event::Failure {
            code: failure.code().as_str(),
            detail: failure.detail().unwrap_or_default(),
        });
    }
    // Showing a non-activating window does not move focus.
    let _ = window.show();
}

/// Ends the splash sequence once. The window is hidden rather than destroyed
/// so the webview is still there, fully loaded, at the next launch.
pub fn finish_splash(app: &AppHandle, splash: &crate::state::SplashFlow) {
    if !splash.begin_finish() {
        return;
    }
    if let Some(window) = app.get_webview_window(SPLASH_LABEL) {
        let _ = window.hide();
    }
}

/// The full launch splash: reveals the window from the fallback timer if the
/// webview has not reported ready, then hides it once the sequence is over.
pub fn run_splash_sequence(app: &AppHandle, splash: &crate::state::SplashFlow) {
    let app = app.clone();
    let splash = splash.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(SPLASH_READY_FALLBACK_MS));
        show_splash(&app, &splash);
        std::thread::sleep(std::time::Duration::from_millis(
            SPLASH_TOTAL_MS - SPLASH_READY_FALLBACK_MS,
        ));
        finish_splash(&app, &splash);
    });
}

fn place_splash(window: &WebviewWindow) -> Result<()> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| Failure::Internal(format!("splash monitor: {e}")))?
        .ok_or_else(|| Failure::Internal("no primary monitor available".into()))?;

    let size = window
        .outer_size()
        .map_err(|e| Failure::Internal(format!("splash size: {e}")))?;
    let scale = monitor.scale_factor();
    let margin = ((SPLASH_MARGIN as f64) * scale).round() as i32;

    let origin = monitor.position();
    let bounds = monitor.size();
    let x = origin.x + bounds.width as i32 - size.width as i32 - margin;
    let y = (origin.y + (bounds.height as i32 - size.height as i32) / 2).clamp(
        origin.y,
        origin.y + bounds.height as i32 - size.height as i32,
    );

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| Failure::Internal(format!("place splash: {e}")))?;
    Ok(())
}

fn raw_hwnd(window: &WebviewWindow) -> Result<isize> {
    let handle = window
        .hwnd()
        .map_err(|e| Failure::Internal(format!("window handle: {e}")))?;
    // The raw pointer value is all that is needed; Tauri's `windows` version
    // does not have to match the one used by the insertion layer.
    Ok(handle.0 as isize)
}

/// Shows the overlay on the monitor the pointer is on, at the configured spot.
pub fn show_overlay(app: &AppHandle, position: OverlayPosition) {
    let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };

    if let Err(failure) = place_overlay(&window, position) {
        crate::logging::event(crate::logging::Event::Failure {
            code: failure.code().as_str(),
            detail: failure.detail().unwrap_or_default(),
        });
    }

    // Showing a non-activating window does not move focus, which is exactly
    // why the overlay can appear while the user keeps typing.
    let _ = window.show();
}

pub fn hide_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }
}

fn place_overlay(window: &WebviewWindow, position: OverlayPosition) -> Result<()> {
    let area = win::work_area_for_cursor()
        .or_else(|| win::work_area_for_window(raw_hwnd(window).unwrap_or(0)))
        .ok_or_else(|| Failure::Internal("no monitor information available".into()))?;

    let size = window
        .outer_size()
        .map_err(|e| Failure::Internal(format!("overlay size: {e}")))?;
    let width = size.width as i32;
    let height = size.height as i32;

    let (x, y) = match position {
        OverlayPosition::BottomCenter => (
            area.left + (area.width() - width) / 2,
            area.bottom - height - OVERLAY_MARGIN,
        ),
        OverlayPosition::BottomRight => (
            area.right - width - OVERLAY_MARGIN,
            area.bottom - height - OVERLAY_MARGIN,
        ),
        OverlayPosition::Center => (
            area.left + (area.width() - width) / 2,
            area.top + (area.height() - height) / 2,
        ),
    };

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| Failure::Internal(format!("place overlay: {e}")))?;
    Ok(())
}

pub fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn toggle_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_settings(app);
        }
    }
}

/// The tray menu: the three things a user wants from a background utility.
pub fn create_tray(app: &AppHandle) -> Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Start dictation", true, None::<&str>)
        .map_err(|e| Failure::Internal(format!("tray item: {e}")))?;
    let settings = MenuItem::with_id(app, "settings", "Show Miro", true, None::<&str>)
        .map_err(|e| Failure::Internal(format!("tray item: {e}")))?;
    let quit = MenuItem::with_id(app, "quit", "Quit Miro", true, None::<&str>)
        .map_err(|e| Failure::Internal(format!("tray item: {e}")))?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &quit])
        .map_err(|e| Failure::Internal(format!("tray menu: {e}")))?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
        .map_err(|e| Failure::Internal(format!("tray icon: {e}")))?;

    TrayIconBuilder::with_id("miro-tray")
        .icon(icon)
        .tooltip("Miro - local-first dictation")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => {
                let session = app.state::<crate::session::Session>();
                session.toggle(app);
            }
            "settings" => show_settings(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|e| Failure::Internal(format!("tray icon: {e}")))?;

    Ok(())
}

/// Opens a folder in Explorer. Used for the models folder, which is the one
/// place a user may need to reach by hand for an offline install.
pub fn open_folder(path: &std::path::Path) -> Result<()> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide: Vec<u16> = path
        .as_os_str()
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let operation: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW returns a value above 32 on success.
    if result.0 as isize <= 32 {
        return Err(Failure::Internal("the folder could not be opened".into()));
    }
    Ok(())
}

/// Opens a documentation URL. Only HTTPS on a known host is accepted, so a
/// malformed value cannot be turned into a local command or a file path.
pub fn open_external(url: &str) -> Result<()> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    const ALLOWED_HOSTS: &[&str] = &["huggingface.co", "github.com"];

    let parsed = url
        .strip_prefix("https://")
        .ok_or_else(|| Failure::Internal("only https links can be opened".into()))?;
    let host = parsed.split('/').next().unwrap_or("");
    if !ALLOWED_HOSTS.contains(&host) {
        return Err(Failure::Internal(format!("refusing to open {host}")));
    }

    let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    let operation: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        return Err(Failure::Internal("the link could not be opened".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_links_on_known_hosts_are_opened() {
        assert!(open_external("http://huggingface.co/x").is_err());
        assert!(open_external("file:///C:/Windows/System32/cmd.exe").is_err());
        assert!(open_external("https://example.com/x").is_err());
        assert!(open_external("https://huggingface.co/ggerganov/whisper.cpp").is_ok());
    }

    #[test]
    fn the_overlay_label_is_distinct_from_the_settings_label() {
        assert_ne!(OVERLAY_LABEL, SETTINGS_LABEL);
    }
}

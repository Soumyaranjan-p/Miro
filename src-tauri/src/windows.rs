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
const OVERLAY_WIDTH: f64 = 380.0;
const OVERLAY_HEIGHT: f64 = 132.0;
/// Gap between the overlay and the edge of the work area.
const OVERLAY_MARGIN: i32 = 28;

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
/// Closing it hides to the tray instead of exiting (handled in `lib.rs`).
pub fn create_settings(app: &AppHandle) -> Result<WebviewWindow> {
    let window =
        WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
            .title("Miro")
            .inner_size(1000.0, 700.0)
            .min_inner_size(760.0, 560.0)
            .resizable(true)
            .visible(false)
            .center()
            .build()
            .map_err(|e| Failure::Internal(format!("create settings window: {e}")))?;
    Ok(window)
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

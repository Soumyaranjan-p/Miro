//! Windows primitives for focus tracking, non-activating windows and text
//! injection.
//!
//! Everything unsafe in Miro's insertion path lives here, in small functions
//! with explicit contracts, so the orchestration above it stays readable.

use std::ffi::c_void;
use std::mem::size_of;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_MENU, VK_RETURN, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, SetWindowLongPtrW,
    GWL_EXSTYLE, MA_NOACTIVATE, WM_MOUSEACTIVATE, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW,
};

use crate::errors::{Failure, Result};

/// The window the user was working in when dictation started.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Target {
    pub hwnd: isize,
    pub pid: u32,
}

impl Target {
    /// Records the current foreground window, if there is one.
    pub fn capture_foreground() -> Result<Target> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.0.is_null() {
            return Err(Failure::FocusChanged);
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        Ok(Target {
            hwnd: hwnd.0 as isize,
            pid,
        })
    }

    /// True while the target is still the foreground window.
    ///
    /// Checked immediately before typing: if the user alt-tabbed away, Miro
    /// refuses to type into whatever is in front now.
    pub fn is_still_foreground(&self) -> bool {
        let current = unsafe { GetForegroundWindow() };
        current.0 as isize == self.hwnd
    }

    pub fn belongs_to_this_process(&self) -> bool {
        let own = unsafe { GetCurrentProcessId() };
        self.pid == own
    }

    /// Heuristic for the UIPI wall: a non-elevated process cannot open an
    /// elevated one for query access. Used to explain *why* typing failed
    /// rather than guessing at a generic error.
    pub fn is_probably_elevated(&self) -> bool {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, self.pid) };
        match handle {
            Ok(handle) => {
                let mut buffer = [0u16; 512];
                let mut size = buffer.len() as u32;
                let ok = unsafe {
                    QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_FORMAT(0),
                        windows::core::PWSTR(buffer.as_mut_ptr()),
                        &mut size,
                    )
                };
                let _ = unsafe { windows::Win32::Foundation::CloseHandle(handle) };
                // Openable but unreadable is unusual; treat only a hard refusal
                // as evidence of a higher integrity level.
                ok.is_err() && size == 0
            }
            Err(_) => true,
        }
    }
}

/// A short, content-free description of what Miro is typing into, for logs.
pub fn target_kind(target: &Target) -> &'static str {
    if target.belongs_to_this_process() {
        "self"
    } else if target.is_probably_elevated() {
        "elevated"
    } else {
        "app"
    }
}

/// Splits text into SendInput batches without ever splitting a surrogate pair.
///
/// A surrogate pair split across two `SendInput` calls can be delivered as two
/// broken halves by some applications, so the boundary is moved back instead.
pub fn plan_batches(units: &[u16], max_units: usize) -> Vec<(usize, usize)> {
    let max_units = max_units.max(1);
    let mut ranges = Vec::new();
    let mut start = 0usize;

    while start < units.len() {
        let mut end = (start + max_units).min(units.len());
        if end < units.len() && is_high_surrogate(units[end - 1]) && is_low_surrogate(units[end]) {
            end -= 1;
        }
        if end == start {
            // A single pair longer than the batch: take it whole.
            end = (start + 2).min(units.len());
        }
        ranges.push((start, end));
        start = end;
    }

    ranges
}

fn is_high_surrogate(unit: u16) -> bool {
    (0xD800..=0xDBFF).contains(&unit)
}

fn is_low_surrogate(unit: u16) -> bool {
    (0xDC00..=0xDFFF).contains(&unit)
}

fn unicode_input(unit: u16, key_up: bool) -> INPUT {
    let mut flags = KEYEVENTF_UNICODE;
    if key_up {
        flags |= KEYEVENTF_KEYUP;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: unit,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn virtual_key_input(key: VIRTUAL_KEY, scan: u16, key_up: bool) -> INPUT {
    let flags: KEYBD_EVENT_FLAGS = if key_up {
        KEYEVENTF_KEYUP
    } else {
        KEYBD_EVENT_FLAGS(0)
    };
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

const SCAN_RETURN: u16 = 0x1C;

/// Types text with `SendInput` using Unicode events.
///
/// Newlines become real Enter presses (chat apps and editors treat a bare CR
/// inconsistently), everything else travels as UTF-16 code units. The returned
/// count is code points, not units, so a surrogate pair is one character.
pub fn send_unicode_text(text: &str) -> Result<usize> {
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut typed = 0usize;

    for (start, end) in plan_batches(&units, 32) {
        let mut events: Vec<INPUT> = Vec::with_capacity((end - start) * 2 + 2);
        for (offset, unit) in units[start..end].iter().enumerate() {
            let previous = if offset > 0 {
                units.get(start + offset - 1)
            } else {
                units.get(start.wrapping_sub(1))
            };
            match *unit {
                0x000A | 0x000D => {
                    // Collapse CRLF into a single Enter, even when the pair
                    // straddles a batch boundary.
                    if *unit == 0x000A && previous == Some(&0x000D) {
                        continue;
                    }
                    events.push(virtual_key_input(VK_RETURN, SCAN_RETURN, false));
                    events.push(virtual_key_input(VK_RETURN, SCAN_RETURN, true));
                    typed += 1;
                }
                unit => {
                    events.push(unicode_input(unit, false));
                    events.push(unicode_input(unit, true));
                    // A surrogate pair is one code point; the low half was
                    // already counted when the high half arrived.
                    if !(0xDC00..0xE000).contains(&unit) {
                        typed += 1;
                    }
                }
            }
        }

        if events.is_empty() {
            continue;
        }

        let mut offset = 0usize;
        let mut attempts = 0;
        while offset < events.len() {
            let remaining = &events[offset..];
            let sent = unsafe { SendInput(remaining, size_of::<INPUT>() as i32) } as usize;
            if sent == 0 {
                attempts += 1;
                if attempts > 3 {
                    return Err(Failure::Insertion(
                        "the target application rejected injected input".into(),
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(5));
                continue;
            }
            offset += sent;
        }

        // Give the target a chance to process the batch before the next one.
        std::thread::sleep(std::time::Duration::from_millis(2));
    }

    Ok(typed)
}

/// Sends Ctrl+V.
pub fn send_paste() -> Result<()> {
    let events = [
        virtual_key_input(VK_CONTROL, 0x1D, false),
        virtual_key_input(VIRTUAL_KEY(b'V' as u16), 0x2F, false),
        virtual_key_input(VIRTUAL_KEY(b'V' as u16), 0x2F, true),
        virtual_key_input(VK_CONTROL, 0x1D, true),
    ];
    let sent = unsafe { SendInput(&events, size_of::<INPUT>() as i32) };
    if sent as usize != events.len() {
        return Err(Failure::Insertion("Ctrl+V could not be injected".into()));
    }
    Ok(())
}

/// True when the given modifier is currently held down.
pub fn modifier_is_down(key: VIRTUAL_KEY) -> bool {
    // GetAsyncKeyState's high bit means "down now"; the low bit is unreliable
    // because it is shared between threads.
    let state =
        unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(key.0 as i32) };
    (state as u16 & 0x8000) != 0
}

pub fn any_modifier_down() -> bool {
    modifier_is_down(VK_CONTROL)
        || modifier_is_down(VK_MENU)
        || modifier_is_down(VK_SHIFT)
        || modifier_is_down(VK_LWIN)
        || modifier_is_down(VK_RWIN)
}

/// Physical work area of the monitor the window is on, in physical pixels.
#[derive(Debug, Clone, Copy)]
pub struct WorkArea {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl WorkArea {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }

    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
}

pub fn work_area_for_window(hwnd: isize) -> Option<WorkArea> {
    let hwnd = HWND(hwnd as *mut c_void);
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if monitor.0.is_null() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
        Some(WorkArea {
            left: info.rcWork.left,
            top: info.rcWork.top,
            right: info.rcWork.right,
            bottom: info.rcWork.bottom,
        })
    } else {
        None
    }
}

/// The monitor the pointer is on - what "the active monitor" means for the
/// overlay when the overlay itself is not up yet.
pub fn work_area_for_cursor() -> Option<WorkArea> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::MONITOR_DEFAULTTONEAREST as DEFAULT_NEAREST;
    let mut point = POINT::default();
    if unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) }.is_err() {
        return None;
    }
    let monitor =
        unsafe { windows::Win32::Graphics::Gdi::MonitorFromPoint(point, DEFAULT_NEAREST) };
    if monitor.0.is_null() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
        Some(WorkArea {
            left: info.rcWork.left,
            top: info.rcWork.top,
            right: info.rcWork.right,
            bottom: info.rcWork.bottom,
        })
    } else {
        None
    }
}

const SUBCLASS_ID: usize = 0x4D49_524F; // "MIRO"

/// The overlay must never take focus. `WS_EX_NOACTIVATE` keeps clicks from
/// activating it, and the subclass hook answers `WM_MOUSEACTIVATE` with
/// `MA_NOACTIVATE` as a second line of defence.
pub fn make_non_activating(hwnd: isize) -> Result<()> {
    let handle = HWND(hwnd as *mut c_void);
    unsafe {
        let current = GetWindowLongPtrW(handle, GWL_EXSTYLE);
        let wanted = (current | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize)
            & !(WS_EX_APPWINDOW.0 as isize);
        if wanted != current {
            SetWindowLongPtrW(handle, GWL_EXSTYLE, wanted);
        }

        let installed = SetWindowSubclass(handle, Some(overlay_subclass_proc), SUBCLASS_ID, 0);
        if !installed.as_bool() {
            return Err(Failure::Internal(
                "the overlay window could not be made non-activating".into(),
            ));
        }
    }
    Ok(())
}

unsafe extern "system" fn overlay_subclass_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _reference: usize,
) -> LRESULT {
    if message == WM_MOUSEACTIVATE {
        // Clicking the overlay's buttons must not move focus away from the app
        // the user is dictating into.
        return LRESULT(MA_NOACTIVATE as isize);
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

/// A file path for a process id, used only to describe targets in logs.
pub fn process_path(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buffer = [0u16; 512];
    let mut size = buffer.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
    };
    let _ = unsafe { windows::Win32::Foundation::CloseHandle(handle) };
    ok.ok()?;
    Some(String::from_utf16_lossy(&buffer[..size as usize]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batches_cover_every_unit_in_order() {
        let units: Vec<u16> = (0..100).collect();
        let ranges = plan_batches(&units, 32);
        assert_eq!(ranges.first().unwrap(), &(0, 32));
        assert_eq!(ranges.last().unwrap().1, 100);
        let total: usize = ranges.iter().map(|(a, b)| b - a).sum();
        assert_eq!(total, units.len());
    }

    #[test]
    fn a_surrogate_pair_is_never_split_across_batches() {
        // 31 BMP characters, then an emoji (a surrogate pair) straddling where
        // a 32-unit batch boundary would fall.
        let mut units: Vec<u16> = vec![b'a' as u16; 31];
        units.extend("😀".encode_utf16());
        units.extend_from_slice(&[b'b' as u16; 4]);

        let ranges = plan_batches(&units, 32);
        for (start, end) in &ranges {
            let first = units[*start];
            let last = units[end - 1];
            if is_high_surrogate(last) {
                panic!("batch {start}..{end} ends on an unpaired high surrogate");
            }
            if is_low_surrogate(first) {
                panic!("batch {start}..{end} starts on an unpaired low surrogate");
            }
        }
        let total: usize = ranges.iter().map(|(a, b)| b - a).sum();
        assert_eq!(total, units.len(), "every unit still gets sent");
    }

    #[test]
    fn a_single_pair_wider_than_a_batch_is_still_sent_whole() {
        let units = "😀".encode_utf16().collect::<Vec<u16>>();
        let ranges = plan_batches(&units, 1);
        assert_eq!(ranges, vec![(0, 2)]);
    }

    #[test]
    fn empty_text_produces_no_batches() {
        assert!(plan_batches(&[], 32).is_empty());
    }

    #[test]
    fn surrogate_helpers_are_exact() {
        assert!(is_high_surrogate(0xD800));
        assert!(is_high_surrogate(0xDBFF));
        assert!(!is_high_surrogate(0xDC00));
        assert!(is_low_surrogate(0xDC00));
        assert!(is_low_surrogate(0xDFFF));
        assert!(!is_low_surrogate(0xD800));
        assert!(!is_high_surrogate(b'a' as u16));
    }
}

//! A low-level keyboard hook, used only for modifier-only push-to-talk.
//!
//! Why this exists: Windows' `RegisterHotKey` (which the shortcut plugin uses)
//! requires a real key plus modifiers. A "hold Ctrl+Alt to talk" gesture cannot
//! be expressed that way, so for that one case Miro installs a
//! `WH_KEYBOARD_LL` hook.
//!
//! Privacy posture, stated plainly:
//!   * the hook is installed only while push-to-talk with a modifier-only
//!     combination is the active mode, and it is removed on mode change, on
//!     settings changes and on quit;
//!   * the callback compares each key against the configured combination and
//!     keeps a set of currently-held virtual key codes - nothing else;
//!   * it never records sequences, never writes anything, never times typing,
//!     and never inspects characters;
//!   * it does not swallow keys: modifier-only combinations must let the real
//!     modifier state through, or the application underneath would see stuck
//!     modifiers. (The plugin path, by contrast, consumes its combination.)
//!   * combinations that include a real key never install this hook at all.
//!
//! The trade-off - hooks are a privilege worth being careful with - is recorded
//! in `docs/PRIVACY.md` and surfaced in the interface when the mode is chosen.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc::Sender, Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RMENU,
    VK_RSHIFT, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::errors::{Failure, Result};
use crate::hotkeys::Hotkey;

/// What the hook decided happened.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PressEvent {
    Down,
    Up,
}

struct HookShared {
    /// One group per required modifier; a group is satisfied by any of its keys.
    modifier_groups: Vec<Vec<u32>>,
    /// Virtual key codes currently held down.
    held: Vec<u32>,
    /// True while the combination is considered pressed.
    active: bool,
    sink: Sender<PressEvent>,
}

static SHARED: OnceLock<Mutex<HookShared>> = OnceLock::new();

/// The combination translated into Windows virtual key codes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedHotkey {
    pub modifier_groups: Vec<Vec<u32>>,
}

/// Translates the canonical shortcut tokens into virtual key groups.
pub fn resolve(hotkey: &Hotkey) -> Result<ResolvedHotkey> {
    let mut groups = Vec::new();
    for modifier in hotkey.modifiers().split('+') {
        let group = match modifier {
            "Ctrl" => vec![VK_LCONTROL.0 as u32, VK_RCONTROL.0 as u32, VK_CONTROL.0 as u32],
            "Alt" => vec![VK_LMENU.0 as u32, VK_RMENU.0 as u32, VK_MENU.0 as u32],
            "Shift" => vec![VK_LSHIFT.0 as u32, VK_RSHIFT.0 as u32, VK_SHIFT.0 as u32],
            "Win" => vec![VK_LWIN.0 as u32, VK_RWIN.0 as u32],
            other => return Err(Failure::ShortcutInvalid(other.to_string())),
        };
        groups.push(group);
    }

    if let Some(key) = hotkey.key() {
        let vk = virtual_key_for(key).ok_or_else(|| Failure::ShortcutInvalid(key.to_string()))?;
        groups.push(vec![vk]);
    }

    if groups.is_empty() {
        return Err(Failure::ShortcutInvalid(hotkey.to_canonical()));
    }
    Ok(ResolvedHotkey { modifier_groups: groups })
}

/// Virtual key code for a canonical key name. Only the names the settings
/// window can produce are supported; anything else is rejected.
pub fn virtual_key_for(key: &str) -> Option<u32> {
    Some(match key {
        "Space" => 0x20,
        "Enter" => 0x0D,
        "Tab" => 0x09,
        "Escape" => 0x1B,
        "Backspace" => 0x08,
        "Delete" => 0x2E,
        "Insert" => 0x2D,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "ArrowUp" => 0x26,
        "ArrowDown" => 0x28,
        "ArrowLeft" => 0x25,
        "ArrowRight" => 0x27,
        "Minus" => 0xBD,
        "Equal" => 0xBB,
        "Comma" => 0xBC,
        "Period" => 0xBE,
        "Slash" => 0xBF,
        "Backslash" => 0xDC,
        "Semicolon" => 0xBA,
        "Quote" => 0xDE,
        "BracketLeft" => 0xDB,
        "BracketRight" => 0xDD,
        "Backquote" => 0xC0,
        "CapsLock" => 0x14,
        "PrintScreen" => 0x2C,
        "Pause" => 0x13,
        other => {
            if let Some(letter) = other.strip_prefix("Key") {
                if letter.len() == 1 {
                    let ch = letter.chars().next()?.to_ascii_uppercase();
                    return Some(ch as u32);
                }
            }
            if let Some(digit) = other.strip_prefix("Digit") {
                if digit.len() == 1 {
                    let ch = digit.chars().next()?;
                    return Some(ch as u32);
                }
            }
            if let Some(number) = other.strip_prefix('F') {
                if let Ok(index) = number.parse::<u32>() {
                    if (1..=24).contains(&index) {
                        return Some(0x70 + index - 1);
                    }
                }
            }
            if let Some(digit) = other.strip_prefix("Numpad") {
                if digit.len() == 1 {
                    let ch = digit.chars().next()?;
                    if ch.is_ascii_digit() {
                        return Some(0x60 + ch.to_digit(10)?);
                    }
                }
            }
            return None;
        }
    })
}

/// A running hook. Dropping it removes the hook and stops its message pump.
pub struct KeyboardHook {
    stop: Arc<AtomicBool>,
    thread_id: Arc<AtomicU32>,
    thread: Option<JoinHandle<()>>,
}

impl KeyboardHook {
    /// Installs the hook and starts reporting presses of `hotkey`.
    pub fn start(hotkey: &Hotkey, sink: Sender<PressEvent>) -> Result<Self> {
        let resolved = resolve(hotkey)?;
        let stop = Arc::new(AtomicBool::new(false));
        let thread_id = Arc::new(AtomicU32::new(0));
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<()>>();

        let shared = HookShared {
            modifier_groups: resolved.modifier_groups,
            held: Vec::new(),
            active: false,
            sink,
        };
        // A second hook replaces the first: only one push-to-talk exists.
        let _ = SHARED.set(Mutex::new(shared)).map_err(|_| {
            if let Ok(mut guard) = SHARED.get().unwrap().lock() {
                guard.active = false;
                guard.held.clear();
            }
        });

        let thread_stop = Arc::clone(&stop);
        let thread_id_slot = Arc::clone(&thread_id);

        let thread = thread::Builder::new()
            .name("miro-keyhook".to_string())
            .spawn(move || {
                let ok = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) };
                match ok {
                    Ok(hook) => {
                        thread_id_slot.store(unsafe { windows::Win32::System::Threading::GetCurrentThreadId() }, Ordering::SeqCst);
                        let _ = ready_tx.send(Ok(()));

                        let mut message = Default::default();
                        loop {
                            let result = unsafe { GetMessageW(&mut message, None, 0, 0) };
                            if result.0 <= 0 {
                                break;
                            }
                        }

                        let _ = unsafe { UnhookWindowsHookEx(hook) };
                    }
                    Err(error) => {
                        let _ = ready_tx.send(Err(Failure::Internal(format!("keyboard hook: {error}"))));
                    }
                }
                let _ = thread_stop.swap(false, Ordering::SeqCst);
            })
            .map_err(|e| Failure::Internal(format!("spawn keyboard hook: {e}")))?;

        match ready_rx.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(Self {
                stop,
                thread_id,
                thread: Some(thread),
            }),
            Ok(Err(failure)) => {
                let _ = thread.join();
                Err(failure)
            }
            Err(_) => Err(Failure::Internal("the keyboard hook did not start".into())),
        }
    }
}

impl Drop for KeyboardHook {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let thread_id = self.thread_id.load(Ordering::SeqCst);
        if thread_id != 0 {
            // Ask the pump to exit; the hook itself is removed in the thread.
            let _ = unsafe { PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // Negative codes are reserved by the system and must be passed straight on.
    if code < 0 {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let message = wparam.0 as u32;
    let is_key_down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
    let is_key_up = message == WM_KEYUP || message == WM_SYSKEYUP;

    if is_key_down || is_key_up {
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let vk = info.vkCode;

        if let Some(shared) = SHARED.get() {
            if let Ok(mut guard) = shared.lock() {
                if is_key_down {
                    if !guard.held.contains(&vk) {
                        guard.held.push(vk);
                    }
                } else {
                    guard.held.retain(|held| *held != vk);
                }

                let satisfied = guard
                    .modifier_groups
                    .iter()
                    .all(|group| group.iter().any(|vk| guard.held.contains(vk)));

                if satisfied && !guard.active {
                    guard.active = true;
                    let _ = guard.sink.send(PressEvent::Down);
                } else if !satisfied && guard.active {
                    guard.active = false;
                    let _ = guard.sink.send(PressEvent::Up);
                }
            }
        }
    }

    // Always pass the event on: Miro observes, it does not consume.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;

    #[test]
    fn a_modifier_only_combination_resolves_to_groups() {
        let hotkey = Hotkey::parse("Ctrl+Alt").unwrap();
        let resolved = resolve(&hotkey).unwrap();
        assert_eq!(resolved.modifier_groups.len(), 2);
        assert!(resolved.modifier_groups[0].contains(&0xA2)); // left Ctrl
        assert!(resolved.modifier_groups[1].contains(&0xA4)); // left Alt
    }

    #[test]
    fn a_combination_with_a_key_includes_it_as_its_own_group() {
        let hotkey = Hotkey::parse("Ctrl+Shift+Space").unwrap();
        let resolved = resolve(&hotkey).unwrap();
        assert_eq!(resolved.modifier_groups.len(), 3);
        assert_eq!(resolved.modifier_groups[2], vec![0x20]);
    }

    #[test]
    fn letters_digits_and_function_keys_map_to_their_virtual_codes() {
        assert_eq!(virtual_key_for("KeyA"), Some(0x41));
        assert_eq!(virtual_key_for("KeyZ"), Some(0x5A));
        assert_eq!(virtual_key_for("Digit0"), Some(0x30));
        assert_eq!(virtual_key_for("Digit9"), Some(0x39));
        assert_eq!(virtual_key_for("F1"), Some(0x70));
        assert_eq!(virtual_key_for("F24"), Some(0x70 + 23));
        assert_eq!(virtual_key_for("Numpad5"), Some(0x65));
        assert_eq!(virtual_key_for("Space"), Some(0x20));
        assert_eq!(virtual_key_for("ArrowUp"), Some(0x26));
    }

    #[test]
    fn unknown_keys_are_refused_rather_than_guessed() {
        assert_eq!(virtual_key_for("Banana"), None);
        assert_eq!(virtual_key_for("F99"), None);
        assert_eq!(virtual_key_for("KeyAB"), None);
    }

    #[test]
    fn modifier_keys_are_never_included_in_the_key_group() {
        // Ctrl alone must not resolve: the hook should never be installed for
        // a single modifier.
        assert!(Hotkey::parse("Ctrl").is_err());
    }

    #[test]
    fn a_channel_can_carry_press_events() {
        let (tx, rx) = channel();
        tx.send(PressEvent::Down).unwrap();
        assert_eq!(rx.recv().unwrap(), PressEvent::Down);
    }
}

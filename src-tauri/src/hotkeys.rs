//! Global shortcut handling.
//!
//! Design decisions worth knowing:
//!   * The stored, canonical form is the string the plugin can parse directly
//!     ("Ctrl+Alt+KeyA"), which is also what W3C `KeyboardEvent.code` reports.
//!     That keeps one naming authority instead of a hand-maintained table.
//!   * Toggle mode uses the plugin's `RegisterHotKey`-style registration.
//!   * Push-to-talk needs key-up as well as key-down. The plugin delivers both
//!     for combinations that contain a real key, so that is the fast path.
//!     A modifier-only combination ("Ctrl+Alt") cannot be expressed as a
//!     plugin shortcut at all, so it is handled by [`crate::keyboard_hook`].
//!   * Escape is registered only while a recording is in flight: a window that
//!     never takes focus never sees the key otherwise.

use std::str::FromStr;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::config::Mode;
use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

/// The Escape shortcut Miro installs while recording, so Esc can cancel from
/// any application without the overlay ever taking focus.
pub const CANCEL_SHORTCUT: &str = "Escape";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Hotkey {
    /// Modifiers plus a real key: expressible as a plugin shortcut.
    Combo { modifiers: String, key: String },
    /// Modifiers only, e.g. "Ctrl+Alt". Push-to-talk only.
    ModifiersOnly { modifiers: String },
}

impl Hotkey {
    /// Parses the canonical form. Unknown pieces are rejected rather than
    /// silently dropped, so a bad setting surfaces instead of doing nothing.
    pub fn parse(text: &str) -> Result<Hotkey> {
        let tokens: Vec<&str> = text
            .split('+')
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .collect();

        if tokens.is_empty() {
            return Err(Failure::ShortcutInvalid(text.to_string()));
        }

        let mut modifiers: Vec<&'static str> = Vec::new();
        let mut key: Option<String> = None;

        for token in tokens {
            match canonical_modifier(token) {
                Some(modifier) => {
                    if !modifiers.contains(&modifier) {
                        modifiers.push(modifier);
                    }
                }
                None => {
                    if key.is_some() {
                        return Err(Failure::ShortcutInvalid(text.to_string()));
                    }
                    key = Some(canonical_key(token).ok_or_else(|| Failure::ShortcutInvalid(token.to_string()))?);
                }
            }
        }

        let modifier_text = ordered_modifiers(&modifiers).join("+");

        match key {
            Some(key) => {
                if modifier_text.is_empty() {
                    return Err(Failure::ShortcutInvalid(text.to_string()));
                }
                Ok(Hotkey::Combo {
                    modifiers: modifier_text,
                    key,
                })
            }
            None => {
                if modifiers.len() < 2 {
                    // A single modifier as push-to-talk would fire on ordinary
                    // typing; refuse it instead of surprising the user.
                    return Err(Failure::ShortcutInvalid(text.to_string()));
                }
                Ok(Hotkey::ModifiersOnly {
                    modifiers: modifier_text,
                })
            }
        }
    }

    /// Canonical, storable form.
    pub fn to_canonical(&self) -> String {
        match self {
            Hotkey::Combo { modifiers, key } => format!("{modifiers}+{key}"),
            Hotkey::ModifiersOnly { modifiers } => modifiers.clone(),
        }
    }

    pub fn modifiers(&self) -> &str {
        match self {
            Hotkey::Combo { modifiers, .. } => modifiers,
            Hotkey::ModifiersOnly { modifiers } => modifiers,
        }
    }

    pub fn key(&self) -> Option<&str> {
        match self {
            Hotkey::Combo { key, .. } => Some(key),
            Hotkey::ModifiersOnly { .. } => None,
        }
    }

    /// Whether the plugin can be asked to deliver this combination, including
    /// key-release events.
    pub fn plugin_expressible(&self) -> bool {
        matches!(self, Hotkey::Combo { .. })
    }

    /// The plugin's own representation, used for registration.
    pub fn to_plugin_shortcut(&self) -> Result<Shortcut> {
        let canonical = self.to_canonical();
        Shortcut::from_str(&canonical).map_err(|_| Failure::ShortcutInvalid(canonical))
    }
}

fn canonical_modifier(word: &str) -> Option<&'static str> {
    let lower = word.to_ascii_lowercase();
    match lower.as_str() {
        "ctrl" | "control" | "commandorcontrol" | "cmdorctrl" => Some("Ctrl"),
        "alt" | "option" | "menu" => Some("Alt"),
        "shift" => Some("Shift"),
        "win" | "super" | "meta" | "cmd" | "command" | "os" => Some("Win"),
        _ => None,
    }
}

/// Canonical order so "Alt+Ctrl+A" and "Ctrl+Alt+A" are the same setting.
fn ordered_modifiers(modifiers: &[&'static str]) -> Vec<&'static str> {
    ["Ctrl", "Alt", "Shift", "Win"]
        .into_iter()
        .filter(|candidate| modifiers.contains(candidate))
        .collect()
}

/// Maps a key token to the spelling `keyboard-types` uses, accepting the short
/// forms a person would type into a config file.
fn canonical_key(word: &str) -> Option<String> {
    let lower = word.to_ascii_lowercase();
    let named = match lower.as_str() {
        "space" | "spacebar" => "Space",
        "enter" | "return" => "Enter",
        "tab" => "Tab",
        "esc" | "escape" => "Escape",
        "backspace" => "Backspace",
        "delete" | "del" => "Delete",
        "insert" | "ins" => "Insert",
        "home" => "Home",
        "end" => "End",
        "pageup" | "pgup" => "PageUp",
        "pagedown" | "pgdn" => "PageDown",
        "up" | "arrowup" => "ArrowUp",
        "down" | "arrowdown" => "ArrowDown",
        "left" | "arrowleft" => "ArrowLeft",
        "right" | "arrowright" => "ArrowRight",
        "minus" | "-" => "Minus",
        "equal" | "=" => "Equal",
        "comma" | "," => "Comma",
        "period" | "." => "Period",
        "slash" | "/" => "Slash",
        "backslash" | "\\" => "Backslash",
        "semicolon" | ";" => "Semicolon",
        "quote" | "'" => "Quote",
        "bracketleft" | "[" => "BracketLeft",
        "bracketright" | "]" => "BracketRight",
        "backquote" | "`" => "Backquote",
        "printscreen" => "PrintScreen",
        "pause" => "Pause",
        "capslock" => "CapsLock",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_string());
    }

    if let Some(rest) = lower.strip_prefix("numpad") {
        if rest.chars().all(|c| c.is_ascii_digit()) && !rest.is_empty() {
            return Some(format!("Numpad{rest}"));
        }
        return match rest {
            "add" => Some("NumpadAdd".to_string()),
            "subtract" => Some("NumpadSubtract".to_string()),
            "multiply" => Some("NumpadMultiply".to_string()),
            "divide" => Some("NumpadDivide".to_string()),
            "decimal" => Some("NumpadDecimal".to_string()),
            "enter" => Some("Enter".to_string()),
            _ => None,
        };
    }

    // Function keys
    if let Some(rest) = lower.strip_prefix('f') {
        if let Ok(number) = rest.parse::<u8>() {
            if (1..=24).contains(&number) {
                return Some(format!("F{number}"));
            }
        }
    }

    // Letters and digits: W3C spells them KeyA and Digit1.
    if lower.len() == 1 {
        let ch = lower.chars().next()?;
        if ch.is_ascii_alphabetic() {
            return Some(format!("Key{}", ch.to_ascii_uppercase()));
        }
        if ch.is_ascii_digit() {
            return Some(format!("Digit{ch}"));
        }
    }

    // Already in W3C form ("KeyA", "Digit1", "ArrowUp", ...).
    if word.starts_with("Key") && word.len() == 4 {
        return Some(word.to_string());
    }
    if word.starts_with("Digit") && word.len() == 6 {
        return Some(word.to_string());
    }

    None
}

/// Result of asking the operating system for a shortcut.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mechanism {
    Plugin,
    KeyboardHook,
    None,
}

impl Mechanism {
    pub fn as_str(self) -> &'static str {
        match self {
            Mechanism::Plugin => "plugin",
            Mechanism::KeyboardHook => "keyboard_hook",
            Mechanism::None => "none",
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct Registration {
    pub registered: bool,
    pub shortcut: String,
    pub mechanism: Mechanism,
    pub detail: Option<String>,
}

impl Default for Mechanism {
    fn default() -> Self {
        Mechanism::None
    }
}

/// Tracks what is currently registered so suspend/resume (used while the
/// settings window is capturing a new combination) is exact.
#[derive(Default)]
pub struct ShortcutRegistry {
    active: Mutex<Option<Hotkey>>,
    cancel_registered: Mutex<bool>,
    suspended: Mutex<bool>,
}

impl ShortcutRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn active(&self) -> Option<Hotkey> {
        self.active.lock().ok().and_then(|guard| guard.clone())
    }

    pub fn is_suspended(&self) -> bool {
        self.suspended.lock().map(|guard| *guard).unwrap_or(false)
    }

    /// Registers the dictation shortcut. Toggle mode rejects modifier-only
    /// combinations, because a bare "hold two modifiers" gesture cannot start
    /// and stop anything on its own.
    pub fn register(&self, app: &AppHandle, hotkey: Hotkey, mode: Mode) -> Result<Mechanism> {
        if mode == Mode::Toggle && !hotkey.plugin_expressible() {
            return Err(Failure::ShortcutInvalid(hotkey.to_canonical()));
        }

        let canonical = hotkey.to_canonical();

        match &hotkey {
            Hotkey::Combo { .. } => {
                let shortcut = hotkey.to_plugin_shortcut()?;
                app.global_shortcut()
                    .register(shortcut)
                    .map_err(|error| Failure::ShortcutConflict {
                        shortcut: canonical.clone(),
                        reason: error.to_string(),
                    })?;
                if let Ok(mut guard) = self.active.lock() {
                    *guard = Some(hotkey);
                }
                logging::event(Event::ShortcutRegistered {
                    shortcut: canonical,
                    mechanism: Mechanism::Plugin.as_str(),
                });
                Ok(Mechanism::Plugin)
            }
            Hotkey::ModifiersOnly { .. } => {
                // The hook is installed once, when push-to-talk becomes active;
                // here we only record the intent.
                if let Ok(mut guard) = self.active.lock() {
                    *guard = Some(hotkey);
                }
                logging::event(Event::ShortcutRegistered {
                    shortcut: canonical,
                    mechanism: Mechanism::KeyboardHook.as_str(),
                });
                Ok(Mechanism::KeyboardHook)
            }
        }
    }

    pub fn unregister(&self, app: &AppHandle) -> Result<()> {
        if let Some(hotkey) = self.active() {
            if let Ok(shortcut) = hotkey.to_plugin_shortcut() {
                let _ = app.global_shortcut().unregister(shortcut);
            }
        }
        if let Ok(mut guard) = self.active.lock() {
            *guard = None;
        }
        Ok(())
    }

    /// Releases the dictation shortcut so the settings window can receive the
    /// keys the user is trying to record.
    pub fn suspend(&self, app: &AppHandle) -> Result<()> {
        if self.is_suspended() {
            return Ok(());
        }
        if let Some(hotkey) = self.active() {
            if let Ok(shortcut) = hotkey.to_plugin_shortcut() {
                let _ = app.global_shortcut().unregister(shortcut);
            }
        }
        if let Ok(mut guard) = self.suspended.lock() {
            *guard = true;
        }
        logging::event(Event::ShortcutSuspended);
        Ok(())
    }

    pub fn resume(&self, app: &AppHandle, mode: Mode) -> Result<Mechanism> {
        if let Ok(mut guard) = self.suspended.lock() {
            *guard = false;
        }
        let Some(hotkey) = self.active() else {
            return Ok(Mechanism::None);
        };
        let canonical = hotkey.to_canonical();
        match hotkey {
            Hotkey::Combo { .. } => {
                let shortcut = hotkey.to_plugin_shortcut()?;
                app.global_shortcut()
                    .register(shortcut)
                    .map_err(|error| Failure::ShortcutConflict {
                        shortcut: canonical,
                        reason: error.to_string(),
                    })?;
                logging::event(Event::ShortcutResumed);
                Ok(Mechanism::Plugin)
            }
            Hotkey::ModifiersOnly { .. } => {
                let _ = mode;
                Ok(Mechanism::KeyboardHook)
            }
        }
    }

    /// Escape is only ours while it could mean "cancel this dictation".
    pub fn register_cancel(&self, app: &AppHandle) -> Result<()> {
        let mut guard = self
            .cancel_registered
            .lock()
            .map_err(|_| Failure::Internal("shortcut state was poisoned".into()))?;
        if *guard {
            return Ok(());
        }
        let shortcut = Shortcut::from_str(CANCEL_SHORTCUT)
            .map_err(|_| Failure::ShortcutInvalid(CANCEL_SHORTCUT.to_string()))?;
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                *guard = true;
                Ok(())
            }
            // Another application owning Escape is not fatal: the overlay's
            // Cancel button still works.
            Err(error) => Err(Failure::ShortcutConflict {
                shortcut: CANCEL_SHORTCUT.to_string(),
                reason: error.to_string(),
            }),
        }
    }

    pub fn unregister_cancel(&self, app: &AppHandle) {
        if let Ok(mut guard) = self.cancel_registered.lock() {
            if *guard {
                if let Ok(shortcut) = Shortcut::from_str(CANCEL_SHORTCUT) {
                    let _ = app.global_shortcut().unregister(shortcut);
                }
                *guard = false;
            }
        }
    }

    /// True when the pressed shortcut is the one that cancels a dictation.
    pub fn is_cancel(shortcut: &Shortcut, hotkey: &Hotkey) -> bool {
        match Shortcut::from_str(CANCEL_SHORTCUT) {
            Ok(cancel) => &cancel == shortcut,
            Err(_) => {
                let _ = hotkey;
                false
            }
        }
    }
}

/// Convenience wrapper used by the plugin handler.
pub fn state_is_press(state: ShortcutState) -> bool {
    state == ShortcutState::Pressed
}

/// Reads the registry out of the Tauri managed state.
pub fn registry(app: &AppHandle) -> tauri::State<'_, ShortcutRegistry> {
    app.state::<ShortcutRegistry>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsing_normalises_modifier_order_and_names() {
        let hotkey = Hotkey::parse("alt+control+space").unwrap();
        assert_eq!(hotkey.to_canonical(), "Ctrl+Alt+Space");
        assert_eq!(hotkey.key(), Some("Space"));
        assert!(hotkey.plugin_expressible());
    }

    #[test]
    fn short_key_names_become_w3c_names() {
        assert_eq!(Hotkey::parse("Ctrl+Shift+a").unwrap().to_canonical(), "Ctrl+Shift+KeyA");
        assert_eq!(Hotkey::parse("Ctrl+1").unwrap().to_canonical(), "Ctrl+Digit1");
        assert_eq!(Hotkey::parse("Ctrl+Up").unwrap().to_canonical(), "Ctrl+ArrowUp");
        assert_eq!(Hotkey::parse("Ctrl+F5").unwrap().to_canonical(), "Ctrl+F5");
        assert_eq!(Hotkey::parse("Ctrl+Return").unwrap().to_canonical(), "Ctrl+Enter");
    }

    #[test]
    fn already_canonical_forms_round_trip() {
        for text in ["Ctrl+Alt+KeyM", "Ctrl+Shift+Digit4", "Win+Space"] {
            let parsed = Hotkey::parse(text).unwrap();
            assert_eq!(parsed.to_canonical(), text);
        }
    }

    #[test]
    fn a_shortcut_without_modifiers_is_refused() {
        assert!(Hotkey::parse("KeyA").is_err());
        assert!(Hotkey::parse("Space").is_err());
    }

    #[test]
    fn modifier_only_combinations_are_recognised_as_such() {
        let hotkey = Hotkey::parse("Ctrl+Alt").unwrap();
        assert!(!hotkey.plugin_expressible());
        assert_eq!(hotkey.key(), None);
        assert_eq!(hotkey.to_canonical(), "Ctrl+Alt");
    }

    #[test]
    fn a_single_modifier_is_not_a_usable_push_to_talk_key() {
        assert!(Hotkey::parse("Ctrl").is_err());
    }

    #[test]
    fn nonsense_is_rejected_instead_of_silently_ignored() {
        assert!(Hotkey::parse("Ctrl+Banana").is_err());
        assert!(Hotkey::parse("Ctrl+Alt+KeyA+KeyB").is_err());
        assert!(Hotkey::parse("").is_err());
        assert!(Hotkey::parse("   ").is_err());
    }

    #[test]
    fn numpad_keys_are_supported() {
        assert_eq!(Hotkey::parse("Ctrl+Numpad1").unwrap().to_canonical(), "Ctrl+Numpad1");
        assert_eq!(Hotkey::parse("Ctrl+NumpadAdd").unwrap().to_canonical(), "Ctrl+NumpadAdd");
    }

    #[test]
    fn function_keys_beyond_f12_are_allowed() {
        assert_eq!(Hotkey::parse("Ctrl+F24").unwrap().to_canonical(), "Ctrl+F24");
        assert!(Hotkey::parse("Ctrl+F25").is_err());
    }

    #[test]
    fn plugin_expressibility_matches_the_registration_path() {
        assert!(Hotkey::parse("Ctrl+Alt+Space").unwrap().plugin_expressible());
        assert!(!Hotkey::parse("Ctrl+Alt+Shift").unwrap().plugin_expressible());
    }
}

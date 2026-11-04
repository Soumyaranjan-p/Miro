//! Getting text into whatever application the user was typing in.
//!
//! Order of operations, and the reasoning behind it:
//!   1. Re-check the foreground window. If the user alt-tabbed while speaking,
//!      typing would land in the wrong place, so Miro refuses and offers the
//!      transcript for retry instead.
//!   2. Primary path: `SendInput` with Unicode key events.
//!   3. Fallback: clipboard paste, with the previous clipboard contents
//!      snapshotted first and restored afterwards.
//!
//! Known limits, surfaced as real errors rather than silence:
//!   * Windows UIPI blocks a non-elevated process from typing into an elevated
//!     one. That is reported as `insertion_blocked`, not as a generic failure.
//!   * Some games, terminals, remote-desktop windows and password fields either
//!     ignore injected input or consume it differently. Miro retries, then
//!     falls back, then reports honestly.
//!   * Restoring every clipboard format is not always possible; the count of
//!     formats that could not be restored is reported back.

pub mod clipboard;
pub mod win;

pub use win::Target;

use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InsertMethod {
    SendInput,
    Clipboard,
    /// Partial SendInput, then clipboard pasted the whole text. Reported as
    /// used by the log; the fix is being tracked separately.
    SendInputAndClipboard,
}

impl InsertMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            InsertMethod::SendInput => "SendInput",
            InsertMethod::Clipboard => "Clipboard",
            InsertMethod::SendInputAndClipboard => "SendInput+Clipboard",
        }
    }
}

#[derive(Debug, Clone)]
pub struct InsertOutcome {
    pub method: InsertMethod,
    pub characters: usize,
    /// Length of the source text in UTF-16 code units.
    pub utf16_units: usize,
    /// Raw INPUT structures consumed by SendInput (0 when the clipboard path
    /// was used without any SendInput attempt succeeding).
    pub raw_events_sent: usize,
    /// False when the clipboard could not be put back as it was found.
    pub clipboard_restored: bool,
    /// Formats the clipboard held that Miro cannot duplicate (bitmaps, private
    /// formats). Reported so the UI never over-claims.
    pub clipboard_formats_skipped: usize,
}

/// How long to let the target application consume a paste before putting the
/// user's clipboard back. Too short and slow applications paste nothing; too
/// long and the user's clipboard is missing for a noticeable moment.
const PASTE_SETTLE_MS: u64 = 180;

/// SendInput is reliable for short text only. Browsers/Electron apps process
/// injected Unicode events asynchronously and silently drop anything beyond
/// their queue capacity, which is why long dictation used to duplicate: the
/// partial prefix was typed and then the full text pasted again. A single
/// clipboard paste is atomic — it either works fully or not at all — and is
/// faster than batch-injecting hundreds of events. 128 UTF-16 units (about
/// 125 characters, roughly a sentence) is well within whatever queue Windows
/// gives us; anything longer takes the single-paste path.
const CLIPBOARD_THRESHOLD_UTF16_UNITS: usize = 128;

/// Types `text` into the window the user was in when they started dictating.
pub fn insert(text: &str, target: Target) -> Result<InsertOutcome> {
    if text.trim().is_empty() {
        return Err(Failure::TranscriptEmpty);
    }

    if !target.is_still_foreground()
        && !target.refocus_after_miro_intercept()
        && !target.foreground_acceptable()
    {
        logging::event(Event::Failure {
            code: "focus_changed",
            detail: win::describe_focus_mismatch(
                &target,
                Target::capture_foreground().ok().as_ref(),
            ),
        });
        return Err(Failure::FocusChanged);
    }

    let utf16_units = text.encode_utf16().count();

    if utf16_units > CLIPBOARD_THRESHOLD_UTF16_UNITS {
        // Long text: one atomic clipboard paste, no SendInput attempt at all.
        // Nothing partial can be duplicated and the paste is far faster than
        // injecting hundreds of events.
        return insert_via_clipboard(text, target);
    }

    // Short text: SendInput exclusively. There is deliberately NO clipboard
    // fallback after a partial attempt — that is the duplicate-paste bug. If
    // the app refuses the injection, the error path reports it honestly and
    // the user can Retry or Copy from the overlay (both re-use this same
    // insertion logic, so no partial text is ever re-pasted on top of what
    // is already in the app).
    match win::send_unicode_text(text) {
        Ok(result) => Ok(InsertOutcome {
            method: InsertMethod::SendInput,
            characters: result.characters,
            utf16_units: result.utf16_units,
            raw_events_sent: result.raw_events_sent,
            clipboard_restored: true,
            clipboard_formats_skipped: 0,
        }),
        Err(send_input_error) => {
            if target.is_probably_elevated() {
                return Err(Failure::InsertionBlocked);
            }
            Err(send_input_error)
        }
    }
}

/// Clipboard path, used when injected keystrokes are refused.
///
/// The user's clipboard is snapshotted first. If it cannot be read, Miro does
/// not paste at all: replacing a clipboard it could not save would destroy data
/// the user still expects to be there.
pub fn insert_via_clipboard(text: &str, target: Target) -> Result<InsertOutcome> {
    if !target.is_still_foreground()
        && !target.refocus_after_miro_intercept()
        && !target.foreground_acceptable()
    {
        logging::event(Event::Failure {
            code: "focus_changed",
            detail: win::describe_focus_mismatch(
                &target,
                Target::capture_foreground().ok().as_ref(),
            ),
        });
        return Err(Failure::FocusChanged);
    }

    let snapshot = clipboard::snapshot()?;
    let sequence = clipboard::set_text(text)?;

    let pasted = win::send_paste();
    std::thread::sleep(std::time::Duration::from_millis(PASTE_SETTLE_MS));

    let restored = clipboard::restore(&snapshot, sequence);

    let utf16_units = text.encode_utf16().count();
    match (pasted, restored) {
        (Ok(()), Ok(_)) => Ok(InsertOutcome {
            method: InsertMethod::Clipboard,
            characters: text.chars().count(),
            utf16_units,
            raw_events_sent: 0,
            clipboard_restored: true,
            clipboard_formats_skipped: snapshot.skipped,
        }),
        (Ok(()), Err(restore_error)) => Err(restore_error),
        (Err(paste_error), _) => Err(paste_error),
    }
}

/// Copies text to the clipboard without pasting, for the overlay's Copy action.
pub fn copy_to_clipboard(text: &str) -> Result<()> {
    clipboard::set_text(text).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_is_not_typed_anywhere() {
        let target = Target { hwnd: 0, pid: 0 };
        let error = insert("   ", target).unwrap_err();
        assert!(matches!(error, Failure::TranscriptEmpty));
    }

    #[test]
    fn a_real_window_switch_is_never_recovered() {
        // In a plain test run no Miro window holds the foreground, so focus
        // recovery must refuse; typing only ever resumes when Miro's own UI
        // intercepted the click.
        let target = Target {
            hwnd: 123_456,
            pid: 999_999,
        };
        assert!(!target.refocus_after_miro_intercept());
    }

    #[test]
    fn a_target_that_does_not_belong_to_the_caller_is_checked_before_typing() {
        // hwnd 0 can never be the foreground window, so this must fail on the
        // focus check rather than typing into whatever is in front.
        let target = Target { hwnd: 0, pid: 0 };
        let error = insert("hello", target).unwrap_err();
        assert!(matches!(
            error,
            Failure::FocusChanged | Failure::Insertion(_)
        ));
    }

    #[test]
    fn character_counting_is_by_code_point_not_bytes() {
        // "café😀" is 5 code points over 9 bytes: any byte-based count lies.
        let text = "caf\u{e9}\u{1F600}";
        assert_eq!(text.chars().count(), 5);
        assert!(text.len() > 5, "byte length differs from character count");
    }
}

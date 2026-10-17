//! Clipboard fallback with restore.
//!
//! Typing with `SendInput` is the primary path. When an application refuses
//! injected keystrokes, Miro falls back to "put the text on the clipboard, send
//! Ctrl+V, put the user's clipboard back". The user's clipboard is theirs, so
//! the restore is a first-class requirement, not a nicety:
//!
//!   * every format that can be duplicated is copied byte for byte;
//!   * formats that cannot (GDI handles, delegated rendering, private
//!     owner-managed ranges) are counted and reported rather than silently
//!     dropped;
//!   * if another application rewrites the clipboard while we are pasting,
//!     Miro leaves that new content alone instead of restoring stale data.

use windows::core::PCWSTR;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData,
    GetClipboardFormatNameW, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};

use crate::errors::{Failure, Result};

// Standard clipboard formats (winuser.h). Spelled out rather than imported so
// the classification below reads as a list a reviewer can check.
const CF_TEXT: u32 = 1;
const CF_BITMAP: u32 = 2;
const CF_METAFILEPICT: u32 = 3;
const CF_SYLK: u32 = 4;
const CF_DIF: u32 = 5;
const CF_TIFF: u32 = 6;
const CF_OEMTEXT: u32 = 7;
const CF_DIB: u32 = 8;
const CF_PALETTE: u32 = 9;
const CF_PENDATA: u32 = 10;
const CF_RIFF: u32 = 11;
const CF_WAVE: u32 = 12;
const CF_UNICODETEXT: u32 = 13;
const CF_ENHMETAFILE: u32 = 14;
const CF_HDROP: u32 = 15;
const CF_LOCALE: u32 = 16;
const CF_DIBV5: u32 = 17;
const CF_OWNERDISPLAY: u32 = 0x0080;
const CF_PRIVATEFIRST: u32 = 0x0200;
const CF_PRIVATELAST: u32 = 0x02FF;
const CF_GDIOBJFIRST: u32 = 0x0300;
const CF_GDIOBJLAST: u32 = 0x03FF;
const CF_REGISTERED_FIRST: u32 = 0xC000;
/// Refuse to duplicate anything absurd: a clipboard entry this big is not a
/// document, and copying it would stall the paste path.
const MAX_FORMAT_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FormatPolicy {
    /// The handle is global memory and can be copied byte for byte.
    GlobalMemory,
    /// Cannot be duplicated safely; recorded so the user is told.
    Skip,
}

/// Which formats Miro is willing to duplicate.
///
/// The rule is "copy what is proved to be global memory, refuse the rest":
/// GDI handles (bitmaps, palettes, metafiles) are kernel objects that cannot be
/// memcpy'd, and the private ranges are owned by the application that put them
/// there.
pub fn classify(format: u32) -> FormatPolicy {
    match format {
        CF_TEXT | CF_OEMTEXT | CF_UNICODETEXT | CF_DIB | CF_DIBV5 | CF_HDROP | CF_LOCALE
        | CF_WAVE | CF_RIFF | CF_SYLK => FormatPolicy::GlobalMemory,

        CF_BITMAP | CF_PALETTE | CF_METAFILEPICT | CF_ENHMETAFILE | CF_OWNERDISPLAY
        | CF_PENDATA | CF_DIF | CF_TIFF => FormatPolicy::Skip,

        id if (CF_PRIVATEFIRST..=CF_PRIVATELAST).contains(&id) => FormatPolicy::Skip,
        id if (CF_GDIOBJFIRST..=CF_GDIOBJLAST).contains(&id) => FormatPolicy::Skip,

        // Registered formats are *usually* global memory, but not always.
        // `copy_handle` verifies that the handle is global memory before
        // trusting it, so these are attempted rather than assumed.
        id if id >= CF_REGISTERED_FIRST => FormatPolicy::GlobalMemory,

        _ => FormatPolicy::Skip,
    }
}

#[derive(Debug)]
pub struct SavedFormat {
    pub format: u32,
    pub name: Option<String>,
    /// `None` means "the clipboard announced this format but held no data"
    /// (delayed rendering); it is reported as skipped.
    pub bytes: Option<Vec<u8>>,
}

#[derive(Debug, Default)]
pub struct ClipboardSnapshot {
    pub entries: Vec<SavedFormat>,
    pub skipped: usize,
}

impl ClipboardSnapshot {
    pub fn stored_formats(&self) -> usize {
        self.entries
            .iter()
            .filter(|entry| entry.bytes.is_some())
            .count()
    }
}

const OPEN_ATTEMPTS: usize = 12;
const OPEN_RETRY_MS: u64 = 25;

/// The clipboard is a single global resource; another app holding it open is
/// normal, so every entry point retries briefly before giving up.
fn open_clipboard() -> Result<()> {
    for attempt in 0..OPEN_ATTEMPTS {
        if unsafe { OpenClipboard(None) }.is_ok() {
            return Ok(());
        }
        if attempt + 1 < OPEN_ATTEMPTS {
            std::thread::sleep(std::time::Duration::from_millis(OPEN_RETRY_MS));
        }
    }
    Err(Failure::Clipboard(
        "another application is holding the clipboard".into(),
    ))
}

fn format_name(format: u32) -> Option<String> {
    if format < CF_REGISTERED_FIRST {
        return None;
    }
    let mut buffer = [0u16; 128];
    let length = unsafe { GetClipboardFormatNameW(format, &mut buffer) };
    if length <= 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..length as usize]))
}

/// Copies a clipboard handle if - and only if - it is global memory.
///
/// `GetClipboardData` hands back a bare `HANDLE`, while the global-memory
/// functions take an `HGLOBAL`. Both are the same pointer behind a transparent
/// wrapper, so the conversion is a reinterpretation - and `GlobalLock` is what
/// proves the pointer really is global memory rather than a GDI object.
fn copy_handle(handle: HANDLE) -> Option<Vec<u8>> {
    if handle.0.is_null() {
        return None;
    }
    let memory = HGLOBAL(handle.0);
    let size = unsafe { GlobalSize(memory) };
    if size == 0 || size > MAX_FORMAT_BYTES {
        return None;
    }
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        // Not global memory - a GDI handle, for example.
        return None;
    }
    let mut bytes = vec![0u8; size];
    unsafe {
        std::ptr::copy_nonoverlapping(pointer as *const u8, bytes.as_mut_ptr(), size);
        let _ = GlobalUnlock(memory);
    }
    Some(bytes)
}

/// Reads every restorable format from the clipboard.
pub fn snapshot() -> Result<ClipboardSnapshot> {
    open_clipboard()?;
    let mut snapshot = ClipboardSnapshot::default();
    let mut format = 0u32;

    loop {
        format = unsafe { EnumClipboardFormats(format) };
        if format == 0 {
            break;
        }
        if classify(format) == FormatPolicy::Skip {
            snapshot.skipped += 1;
            continue;
        }

        let handle = match unsafe { GetClipboardData(format) } {
            Ok(handle) => handle,
            Err(_) => {
                snapshot.skipped += 1;
                continue;
            }
        };
        let bytes = copy_handle(handle);
        if bytes.is_none() {
            snapshot.skipped += 1;
        }
        snapshot.entries.push(SavedFormat {
            format,
            name: format_name(format),
            bytes,
        });
    }

    let _ = unsafe { CloseClipboard() };
    Ok(snapshot)
}

fn push_global_memory(format: u32, bytes: &[u8]) -> bool {
    let Ok(memory) = (unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1)) }) else {
        return false;
    };
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return false;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer as *mut u8, bytes.len());
        let _ = GlobalUnlock(memory);
    }
    // On success the clipboard owns the handle and must not be freed here.
    unsafe { SetClipboardData(format, Some(HANDLE(memory.0))) }.is_ok()
}

fn encode_utf16le_nul(text: &str) -> Vec<u8> {
    let mut units: Vec<u16> = text.encode_utf16().collect();
    units.push(0);
    let mut bytes = Vec::with_capacity(units.len() * 2);
    for unit in units {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

fn encode_ansi_nul(text: &str) -> Vec<u8> {
    let mut bytes: Vec<u8> = text
        .chars()
        .map(|c| if c.is_ascii() { c as u8 } else { b'?' })
        .collect();
    bytes.push(0);
    bytes
}

/// Replaces the clipboard contents with `text`, returning the sequence number
/// so the caller can tell whether anyone else touched the clipboard since.
pub fn set_text(text: &str) -> Result<u32> {
    open_clipboard()?;
    let result = (|| {
        unsafe { EmptyClipboard() }.map_err(|e| Failure::Clipboard(format!("empty: {e}")))?;

        if !push_global_memory(CF_UNICODETEXT, &encode_utf16le_nul(text)) {
            return Err(Failure::Clipboard("could not publish the text".into()));
        }
        // Older applications only look at the ANSI flavour.
        let _ = push_global_memory(CF_TEXT, &encode_ansi_nul(text));
        Ok(())
    })();

    let sequence = unsafe { GetClipboardSequenceNumber() };
    let _ = unsafe { CloseClipboard() };
    result?;

    // `IsClipboardFormatAvailable` reports "not there" as an error now.
    if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT) }.is_ok() {
        Ok(sequence)
    } else {
        Err(Failure::Clipboard("the clipboard rejected the text".into()))
    }
}

/// Puts the snapshot back, unless someone else has taken over the clipboard.
pub fn restore(snapshot: &ClipboardSnapshot, expected_sequence: u32) -> Result<bool> {
    let current = unsafe { GetClipboardSequenceNumber() };
    if current != expected_sequence {
        // Another application wrote to the clipboard while we were pasting.
        // Its content wins; restoring ours would destroy real user data.
        return Ok(false);
    }

    if snapshot.entries.is_empty() {
        open_clipboard()?;
        let _ = unsafe { EmptyClipboard() };
        let _ = unsafe { CloseClipboard() };
        return Ok(true);
    }

    open_clipboard()?;
    let result = (|| {
        unsafe { EmptyClipboard() }.map_err(|e| Failure::Clipboard(format!("empty: {e}")))?;
        let mut restored = 0usize;

        for entry in &snapshot.entries {
            let Some(bytes) = entry.bytes.as_ref() else {
                continue;
            };
            // Re-register by name: the numeric id of a registered format is only
            // guaranteed for the process that registered it first.
            let format = match entry.name.as_deref() {
                Some(name) => register_format(name).unwrap_or(entry.format),
                None => entry.format,
            };
            if push_global_memory(format, bytes) {
                restored += 1;
            }
        }

        if restored == 0 {
            return Err(Failure::Clipboard("nothing could be put back".into()));
        }
        Ok(())
    })();

    let _ = unsafe { CloseClipboard() };
    result?;
    Ok(true)
}

fn register_format(name: &str) -> Option<u32> {
    let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    let id = unsafe { RegisterClipboardFormatW(PCWSTR(wide.as_ptr())) };
    (id >= CF_REGISTERED_FIRST).then_some(id)
}

/// Reads the current clipboard text, used by the verification probe to prove a
/// fallback paste actually put the expected text on the clipboard.
pub fn current_text() -> Result<String> {
    open_clipboard()?;
    let result = (|| {
        let handle = unsafe { GetClipboardData(CF_UNICODETEXT) }
            .map_err(|e| Failure::Clipboard(format!("no text: {e}")))?;
        let bytes =
            copy_handle(handle).ok_or_else(|| Failure::Clipboard("unreadable text".into()))?;
        Ok(decode_utf16le(&bytes))
    })();
    let _ = unsafe { CloseClipboard() };
    result
}

fn decode_utf16le(bytes: &[u8]) -> String {
    let mut units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    while units.last() == Some(&0) {
        units.pop();
    }
    String::from_utf16_lossy(&units)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_formats_are_treated_as_global_memory() {
        for format in [CF_TEXT, CF_OEMTEXT, CF_UNICODETEXT, CF_HDROP, CF_DIBV5] {
            assert_eq!(
                classify(format),
                FormatPolicy::GlobalMemory,
                "format {format}"
            );
        }
    }

    #[test]
    fn gdi_and_private_formats_are_refused() {
        for format in [
            CF_BITMAP,
            CF_PALETTE,
            CF_METAFILEPICT,
            CF_ENHMETAFILE,
            CF_OWNERDISPLAY,
        ] {
            assert_eq!(classify(format), FormatPolicy::Skip, "format {format}");
        }
        assert_eq!(classify(CF_PRIVATEFIRST), FormatPolicy::Skip);
        assert_eq!(classify(CF_GDIOBJLAST), FormatPolicy::Skip);
    }

    #[test]
    fn registered_formats_are_attempted() {
        assert_eq!(classify(CF_REGISTERED_FIRST), FormatPolicy::GlobalMemory);
        assert_eq!(
            classify(CF_REGISTERED_FIRST + 42),
            FormatPolicy::GlobalMemory
        );
        assert_eq!(classify(0x0008), FormatPolicy::GlobalMemory);
    }

    #[test]
    fn unicode_text_is_null_terminated_little_endian() {
        let bytes = encode_utf16le_nul("hi");
        assert_eq!(bytes, vec![b'h', 0, b'i', 0, 0, 0]);
        assert_eq!(decode_utf16le(&bytes), "hi");
    }

    #[test]
    fn round_tripping_text_with_an_emoji_is_lossless() {
        let text = "ok \u{1F600} done";
        let bytes = encode_utf16le_nul(text);
        assert_eq!(decode_utf16le(&bytes), text);
    }

    #[test]
    fn ansi_fallback_degrades_instead_of_panicking() {
        let bytes = encode_ansi_nul("caf\u{e9}");
        assert_eq!(bytes, vec![b'c', b'a', b'f', b'?', 0]);
    }

    #[test]
    fn a_null_handle_is_never_copied() {
        assert!(copy_handle(HANDLE(std::ptr::null_mut())).is_none());
    }
}

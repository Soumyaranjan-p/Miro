//! Privacy engineering, in one place.
//!
//! Miro's promise is about what does *not* exist:
//!   * no audio file, ever - samples live in `Vec<f32>` and are zeroed;
//!   * no transcript file, ever - text lives in a `String` and is zeroed;
//!   * no database, no history, no cache across sessions;
//!   * no log file: [`crate::logging`] writes to stderr only.
//!
//! The one concession the spec allows is a temporary file when it is genuinely
//! unavoidable. This module is the only place such a file may be created, and
//! it sweeps the temp directory on every start so a crash cannot leave one
//! behind. `scripts/privacy-audit.ps1` checks the same directories from the
//! outside.

use std::fs;
use std::path::{Path, PathBuf};

use crate::logging::{self, Event};

/// Every temporary file Miro could ever create carries this prefix.
pub const TEMP_PREFIX: &str = "miro-";

/// Classifies a directory entry as "ours" for the startup sweep.
pub fn is_miro_temp(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with(TEMP_PREFIX))
        .unwrap_or(false)
}

/// The only sanctioned way for the application to obtain a temp path.
///
/// Nothing in the dictation path calls this today: whisper.cpp receives
/// in-memory float samples, and the clipboard fallback writes nothing. It
/// exists so that if a future feature needs a file, it lands here instead of
/// inventing its own location.
pub fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{TEMP_PREFIX}{name}"))
}

/// Removes Miro temp files left behind by a crash or a kill.
///
/// Returns `(removed, failed)` so the caller can report what it actually did
/// rather than claiming a clean sweep.
pub fn sweep_temp() -> (usize, usize) {
    sweep_dir(&std::env::temp_dir())
}

/// The testable core of [`sweep_temp`].
pub fn sweep_dir(dir: &Path) -> (usize, usize) {
    let mut removed = 0usize;
    let mut failed = 0usize;

    let Ok(entries) = fs::read_dir(dir) else {
        return (0, 0);
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !is_miro_temp(&path) {
            continue;
        }
        let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        let result = if is_dir {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        match result {
            Ok(()) => removed += 1,
            Err(_) => failed += 1,
        }
    }

    if removed > 0 || failed > 0 {
        logging::event(Event::TempRecovery { removed, failed });
    }
    (removed, failed)
}

/// Zeroes a text buffer in place. Used when the retry window closes.
pub fn zeroize_string(text: &mut String) {
    // SAFETY: every byte of a `String` is initialised, and replacing them with
    // zeroes keeps the buffer valid UTF-8 (a zero byte is valid).
    unsafe {
        for byte in text.as_bytes_mut() {
            *byte = 0;
        }
    }
    text.clear();
}

/// A transcript that exists only while it could still be inserted.
#[derive(Debug, Default)]
pub struct PendingText {
    text: Option<String>,
    /// Identifier handed to the overlay so Retry/Copy can refer to it.
    id: Option<u64>,
}

impl PendingText {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn store(&mut self, text: String, id: u64) {
        self.clear();
        self.text = Some(text);
        self.id = Some(id);
    }

    pub fn peek(&self, id: u64) -> Option<&str> {
        match (&self.text, self.id) {
            (Some(text), Some(current)) if current == id => Some(text.as_str()),
            _ => None,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_none()
    }

    pub fn take(&mut self, id: u64) -> Option<String> {
        match self.id {
            Some(current) if current == id => {
                self.id = None;
                self.text.take()
            }
            _ => None,
        }
    }

    pub fn clear(&mut self) {
        if let Some(mut text) = self.text.take() {
            zeroize_string(&mut text);
        }
        self.id = None;
    }
}

impl Drop for PendingText {
    fn drop(&mut self) {
        self.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("miro-privacy-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_prefixed_files_are_considered_ours() {
        assert!(is_miro_temp(Path::new("C:/tmp/miro-model.bin")));
        assert!(is_miro_temp(Path::new("C:/tmp/miro-audio.pcm")));
        assert!(!is_miro_temp(Path::new("C:/tmp/other.txt")));
        assert!(!is_miro_temp(Path::new("C:/tmp/notmiro.txt")));
    }

    #[test]
    fn the_sweep_removes_our_files_and_leaves_everything_else() {
        let dir = temp_dir("sweep");
        fs::write(dir.join("miro-leftover.wav"), b"audio").unwrap();
        fs::write(dir.join("miro-leftover.pcm"), b"audio").unwrap();
        fs::create_dir_all(dir.join("miro-leftover-dir")).unwrap();
        fs::write(dir.join("someone-elses.txt"), b"keep me").unwrap();

        let (removed, failed) = sweep_dir(&dir);
        assert_eq!((removed, failed), (3, 0));
        assert!(dir.join("someone-elses.txt").exists());
        assert!(!dir.join("miro-leftover.wav").exists());
        assert!(!dir.join("miro-leftover-dir").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_second_sweep_finds_nothing_left_to_do() {
        let dir = temp_dir("sweep2");
        fs::write(dir.join("miro-x.pcm"), b"audio").unwrap();
        assert_eq!(sweep_dir(&dir).0, 1);
        assert_eq!(sweep_dir(&dir), (0, 0));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn zeroizing_a_string_leaves_it_empty() {
        let mut text = String::from("a transcript that must not linger");
        zeroize_string(&mut text);
        assert!(text.is_empty());
    }

    #[test]
    fn pending_text_only_answers_to_its_current_id() {
        let mut pending = PendingText::new();
        assert!(pending.is_empty());

        pending.store("hello".into(), 7);
        assert_eq!(pending.peek(7), Some("hello"));
        assert_eq!(pending.peek(8), None, "a stale id must not read the text");
        assert_eq!(pending.take(8), None);
        assert_eq!(pending.peek(7), Some("hello"));

        assert_eq!(pending.take(7).as_deref(), Some("hello"));
        assert!(pending.is_empty());
        assert_eq!(pending.peek(7), None);
    }

    #[test]
    fn storing_again_clears_the_previous_transcript() {
        let mut pending = PendingText::new();
        pending.store("first".into(), 1);
        pending.store("second".into(), 2);
        assert_eq!(pending.peek(1), None);
        assert_eq!(pending.peek(2), Some("second"));
    }
}

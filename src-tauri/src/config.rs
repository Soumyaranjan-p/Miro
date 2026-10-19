//! Settings persistence.
//!
//! What is stored is deliberately boring: the shortcut, the mode, the chosen
//! microphone and model id, the language, the clean-up rules, the theme, the
//! overlay position and the start-on-login flag. No audio, no transcripts, no
//! history - there is no field in [`Settings`] that could hold either.
//!
//! Writes are atomic (temp file + rename) so a crash mid-save cannot leave a
//! half-written config behind.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

pub const CONFIG_VERSION: u32 = 1;
pub const CONFIG_FILE: &str = "config.json";
pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt";
pub const MIN_RECORDING_SECONDS: u32 = 30;
pub const MAX_RECORDING_SECONDS: u32 = 600;
pub const MAX_FILLER_WORDS: usize = 64;
pub const MAX_FILLER_WORD_LEN: usize = 32;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Toggle,
    PushToTalk,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

impl Theme {
    pub fn as_str(self) -> &'static str {
        match self {
            Theme::System => "system",
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum OverlayPosition {
    #[default]
    BottomCenter,
    BottomRight,
    Center,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Cleanup {
    pub enabled: bool,
    pub normalize_whitespace: bool,
    pub capitalize_sentences: bool,
    pub remove_filler_words: bool,
    pub filler_words: Vec<String>,
}

impl Default for Cleanup {
    fn default() -> Self {
        Self {
            enabled: true,
            normalize_whitespace: true,
            capitalize_sentences: true,
            // Off by default: removing words is the one rule that can lose meaning.
            remove_filler_words: false,
               filler_words: vec![
       "um".into(),
       "umm".into(),
       "uh".into(),
       "uhh".into(),
       "er".into(),
       "erm".into(),
       "hmm".into(),
       "you know".into(),
       "i mean".into(),
       "like".into(),
   ],
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub shortcut: String,
    pub mode: Mode,
    /// `None` follows the Windows default input device.
    pub microphone: Option<String>,
    pub model_id: String,
    pub language: String,
    pub max_recording_seconds: u32,
    pub cleanup: Cleanup,
    pub theme: Theme,
    pub overlay_position: OverlayPosition,
    pub show_transcript_preview: bool,
    pub start_on_login: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            shortcut: DEFAULT_SHORTCUT.to_string(),
            mode: Mode::Toggle,
            microphone: None,
            model_id: "base.en".to_string(),
            language: "en".to_string(),
            max_recording_seconds: 300,
            cleanup: Cleanup::default(),
            theme: Theme::System,
            overlay_position: OverlayPosition::BottomCenter,
            show_transcript_preview: false,
            start_on_login: false,
        }
    }
}

/// A partial update from the settings window. `double_option` tells a missing
/// microphone apart from an explicit `null` (which means "system default").
#[derive(Deserialize, Default, Debug)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub shortcut: Option<String>,
    pub mode: Option<Mode>,
    #[serde(deserialize_with = "double_option")]
    pub microphone: Option<Option<String>>,
    pub model_id: Option<String>,
    pub language: Option<String>,
    pub max_recording_seconds: Option<u32>,
    pub cleanup: Option<CleanupPatch>,
    pub theme: Option<Theme>,
    pub overlay_position: Option<OverlayPosition>,
    pub show_transcript_preview: Option<bool>,
    pub start_on_login: Option<bool>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct CleanupPatch {
    pub enabled: Option<bool>,
    pub normalize_whitespace: Option<bool>,
    pub capitalize_sentences: Option<bool>,
    pub remove_filler_words: Option<bool>,
    pub filler_words: Option<Vec<String>>,
}

fn double_option<'de, D, T>(deserializer: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    // Reached only when the key is present, so a present `null` becomes Some(None).
    Deserialize::deserialize(deserializer).map(Some)
}

impl Settings {
    /// Clamps and cleans values a user (or a hand-edited file) could get wrong.
    pub fn normalize(&mut self) {
        self.version = CONFIG_VERSION;
        self.shortcut = self.shortcut.trim().to_string();
        if self.shortcut.is_empty() {
            self.shortcut = DEFAULT_SHORTCUT.to_string();
        }
        self.max_recording_seconds = self
            .max_recording_seconds
            .clamp(MIN_RECORDING_SECONDS, MAX_RECORDING_SECONDS);
        self.language = self.language.trim().to_lowercase();
        if self.language.is_empty() {
            self.language = "en".to_string();
        }
        self.model_id = self.model_id.trim().to_string();

        let mut seen: Vec<String> = Vec::new();
        for word in &self.cleanup.filler_words {
            let trimmed = word.trim().to_lowercase();
            if trimmed.is_empty() || trimmed.chars().count() > MAX_FILLER_WORD_LEN {
                continue;
            }
            if !seen.contains(&trimmed) {
                seen.push(trimmed);
            }
            if seen.len() >= MAX_FILLER_WORDS {
                break;
            }
        }
        self.cleanup.filler_words = seen;
    }

    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(shortcut) = patch.shortcut {
            self.shortcut = shortcut;
        }
        if let Some(mode) = patch.mode {
            self.mode = mode;
        }
        if let Some(microphone) = patch.microphone {
            self.microphone = microphone
                .map(|value| value.trim().to_string())
                .filter(|v| !v.is_empty());
        }
        if let Some(model_id) = patch.model_id {
            self.model_id = model_id;
        }
        if let Some(language) = patch.language {
            self.language = language;
        }
        if let Some(seconds) = patch.max_recording_seconds {
            self.max_recording_seconds = seconds;
        }
        if let Some(theme) = patch.theme {
            self.theme = theme;
        }
        if let Some(position) = patch.overlay_position {
            self.overlay_position = position;
        }
        if let Some(preview) = patch.show_transcript_preview {
            self.show_transcript_preview = preview;
        }
        if let Some(start_on_login) = patch.start_on_login {
            self.start_on_login = start_on_login;
        }
        if let Some(cleanup) = patch.cleanup {
            if let Some(enabled) = cleanup.enabled {
                self.cleanup.enabled = enabled;
            }
            if let Some(normalize) = cleanup.normalize_whitespace {
                self.cleanup.normalize_whitespace = normalize;
            }
            if let Some(capitalize) = cleanup.capitalize_sentences {
                self.cleanup.capitalize_sentences = capitalize;
            }
            if let Some(remove) = cleanup.remove_filler_words {
                self.cleanup.remove_filler_words = remove;
            }
            if let Some(words) = cleanup.filler_words {
                self.cleanup.filler_words = words;
            }
        }
        self.normalize();
    }
}

pub struct ConfigStore {
    path: PathBuf,
    /// Where a corrupt file is moved so the user can look at it.
    quarantine: PathBuf,
}

impl ConfigStore {
    pub fn new(config_dir: &Path) -> Self {
        Self {
            path: config_dir.join(CONFIG_FILE),
            quarantine: config_dir.join("config.invalid.json"),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Loading never fails: a broken config falls back to defaults, and the
    /// broken file is kept aside rather than silently overwritten.
    pub fn load(&self) -> Settings {
        let existed = self.path.exists();
        logging::event(Event::ConfigLoaded {
            path: self.path.display().to_string(),
            existed,
        });

        if !existed {
            return Settings::default();
        }

        match fs::read_to_string(&self.path) {
            Ok(raw) => match serde_json::from_str::<Settings>(&raw) {
                Ok(mut settings) => {
                    settings.normalize();
                    settings
                }
                Err(_) => {
                    let _ = fs::rename(&self.path, &self.quarantine);
                    logging::event(Event::ConfigRecovered {
                        path: self.quarantine.display().to_string(),
                    });
                    Settings::default()
                }
            },
            Err(_) => Settings::default(),
        }
    }

    pub fn save(&self, settings: &Settings) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| Failure::ConfigWrite(format!("create dir: {e}")))?;
        }
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| Failure::ConfigWrite(format!("serialize: {e}")))?;

        let temp = self.path.with_extension("json.tmp");
        fs::write(&temp, json).map_err(|e| Failure::ConfigWrite(format!("write: {e}")))?;
        fs::rename(&temp, &self.path).map_err(|e| Failure::ConfigWrite(format!("rename: {e}")))?;

        logging::event(Event::ConfigSaved);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("miro-config-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn defaults_round_trip_through_disk() {
        let dir = temp_dir("roundtrip");
        let store = ConfigStore::new(&dir);
        let settings = Settings::default();
        store.save(&settings).unwrap();

        let loaded = store.load();
        assert_eq!(loaded, settings);
        assert!(
            !dir.join("config.json.tmp").exists(),
            "temp file must not survive a save"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_corrupt_file_is_quarantined_and_defaults_are_used() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(CONFIG_FILE), "{ this is not json").unwrap();

        let store = ConfigStore::new(&dir);
        let loaded = store.load();

        assert_eq!(loaded, Settings::default());
        assert!(!dir.join(CONFIG_FILE).exists());
        assert!(dir.join("config.invalid.json").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn patch_applies_only_what_it_carries() {
        let mut settings = Settings {
            model_id: "tiny.en".into(),
            ..Settings::default()
        };

        let patch: SettingsPatch =
            serde_json::from_str(r#"{"theme":"dark","cleanup":{"enabled":false}}"#).unwrap();
        settings.apply(patch);

        assert_eq!(settings.theme, Theme::Dark);
        assert!(!settings.cleanup.enabled);
        assert_eq!(settings.model_id, "tiny.en", "untouched fields stay put");
    }

    #[test]
    fn an_explicit_null_microphone_means_system_default() {
        let mut settings = Settings {
            microphone: Some("Some Device".into()),
            ..Settings::default()
        };

        let patch: SettingsPatch = serde_json::from_str(r#"{"microphone":null}"#).unwrap();
        settings.apply(patch);
        assert_eq!(settings.microphone, None);

        let patch: SettingsPatch = serde_json::from_str(r#"{"microphone":"Other"}"#).unwrap();
        settings.apply(patch);
        assert_eq!(settings.microphone.as_deref(), Some("Other"));

        let patch: SettingsPatch = serde_json::from_str(r#"{}"#).unwrap();
        settings.apply(patch);
        assert_eq!(
            settings.microphone.as_deref(),
            Some("Other"),
            "a missing key is not a reset"
        );
    }

    #[test]
    fn recording_length_is_clamped_to_a_sane_window() {
        let mut settings = Settings {
            max_recording_seconds: 5,
            ..Settings::default()
        };
        settings.normalize();
        assert_eq!(settings.max_recording_seconds, MIN_RECORDING_SECONDS);

        settings.max_recording_seconds = 100_000;
        settings.normalize();
        assert_eq!(settings.max_recording_seconds, MAX_RECORDING_SECONDS);
    }

    #[test]
    fn filler_words_are_deduplicated_bounded_and_lowercased() {
        let mut settings = Settings::default();
        settings.cleanup.filler_words = vec![
            "  Um ".into(),
            "um".into(),
            "".into(),
            "a".repeat(MAX_FILLER_WORD_LEN + 1),
            "You Know".into(),
        ];
        settings.normalize();
        assert_eq!(settings.cleanup.filler_words, vec!["um", "you know"]);
    }

    #[test]
    fn unknown_patch_keys_are_rejected_rather_than_ignored() {
        let parsed: std::result::Result<SettingsPatch, _> =
            serde_json::from_str(r#"{"notARealSetting":true}"#);
        assert!(parsed.is_err());
    }

    #[test]
    fn the_config_file_holds_no_history_like_fields() {
        let json = serde_json::to_string(&Settings::default()).unwrap();
        for forbidden in ["transcript", "history", "audio", "buffer", "lastText"] {
            assert!(
                !json.contains(forbidden),
                "settings must never grow a `{forbidden}` field"
            );
        }
    }
}

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

pub const CONFIG_VERSION: u32 = 3;
pub const CONFIG_FILE: &str = "config.json";
/// Default dictation hotkey: hold to record, release to stop and type. Ctrl+M
/// is a real key under Ctrl, which the keyboard hook can watch through both
/// edges - the release edge is what push-to-talk needs to stop by itself.
pub const DEFAULT_SHORTCUT: &str = "Ctrl+M";
pub const DEFAULT_NORMAL_SHORTCUT: &str = "Ctrl+Alt";
pub const DEFAULT_INTENT_SHORTCUT: &str = "Ctrl+Alt+Space";
pub const MIN_RECORDING_SECONDS: u32 = 30;
pub const MAX_RECORDING_SECONDS: u32 = 600;
pub const MAX_FILLER_WORDS: usize = 64;
pub const MAX_FILLER_WORD_LEN: usize = 32;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    PushToTalk,
    Toggle,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum HomeMode {
    /// Normal Mode: dictation as it works today.
    #[default]
    Home,
    /// Intent Mode: spoken intent is restructured into a prompt before it is
    /// inserted.
    Intent,
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

/// How live dictation inserts transcribed words.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum LiveMode {
    /// Insert committed words as they are finalised, in near real time.
    #[default]
    Insert,
    /// Show live text in the overlay only; insert everything on release.
    Preview,
    /// Current behaviour: transcribe and insert only after release.
    Off,
}

const DEFAULT_LIVE_STEP_MS: u32 = 400;
const DEFAULT_LIVE_WINDOW_MS: u32 = 6000;
const MIN_LIVE_STEP_MS: u32 = 200;
const MAX_LIVE_STEP_MS: u32 = 2000;
const MIN_LIVE_WINDOW_MS: u32 = 2000;
const MAX_LIVE_WINDOW_MS: u32 = 12000;

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
            // On by default. "like", "you know" and "i mean" are only removed
            // in a filler context - comma-delimited or at a clause boundary -
            // so real uses of those words ("I like it", "Do you know him")
            // keep their meaning; only soundalike stumbles are touched.
            remove_filler_words: true,
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

/// Which backend turns spoken intent into a prompt.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum RestructureBackend {
    /// A model served by Ollama on this machine.
    #[default]
    Local,
    /// An OpenAI-compatible chat-completions endpoint.
    Cloud,
}

pub const DEFAULT_INTENT_ENDPOINT: &str = "http://127.0.0.1:11434";
pub const DEFAULT_INTENT_MODEL: &str = "llama3.2";
pub const MIN_INTENT_TIMEOUT_MS: u32 = 500;
pub const MAX_INTENT_TIMEOUT_MS: u32 = 15_000;
pub const MIN_INTENT_OUTPUT_CHARS: usize = 200;
pub const MAX_INTENT_OUTPUT_CHARS: usize = 8_000;

/// Intent Mode: spoken intent is restructured into a prompt before insertion.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct IntentSettings {
    /// Off by default; off means dictation behaves exactly as it does today.
    pub enabled: bool,
    pub backend: RestructureBackend,
    /// Ollama base URL for the local backend, or the full chat-completions URL
    /// for the cloud backend.
    pub endpoint: String,
    pub model: String,
    /// Hard deadline for the restructure call. Falls back to the raw transcript.
    pub timeout_ms: u32,
    /// Upper bound on the prompt handed to the review overlay.
    pub max_output_chars: usize,
    /// The exact endpoint the user consented to send transcripts to. `None`
    /// means no cloud consent has been given, and cloud mode stays blocked.
    pub cloud_consent_endpoint: Option<String>,
}

impl Default for IntentSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            backend: RestructureBackend::Local,
            endpoint: DEFAULT_INTENT_ENDPOINT.to_string(),
            model: DEFAULT_INTENT_MODEL.to_string(),
            timeout_ms: 4_000,
            max_output_chars: 1_200,
            cloud_consent_endpoint: None,
        }
    }
}

impl IntentSettings {
    /// Clamps values a user or a hand-edited file could get wrong.
    pub fn normalize(&mut self) {
        self.endpoint = self.endpoint.trim().to_string();
        if self.endpoint.is_empty() {
            self.endpoint = DEFAULT_INTENT_ENDPOINT.to_string();
        }
        self.model = self.model.trim().to_string();
        if self.model.is_empty() {
            self.model = DEFAULT_INTENT_MODEL.to_string();
        }
        self.timeout_ms = self
            .timeout_ms
            .clamp(MIN_INTENT_TIMEOUT_MS, MAX_INTENT_TIMEOUT_MS);
        self.max_output_chars = self
            .max_output_chars
            .clamp(MIN_INTENT_OUTPUT_CHARS, MAX_INTENT_OUTPUT_CHARS);
        self.cloud_consent_endpoint = self
            .cloud_consent_endpoint
            .take()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
    }

    /// True when the stored consent is for the endpoint currently configured.
    pub fn cloud_consent_matches(&self) -> bool {
        self.cloud_consent_endpoint.as_deref() == Some(self.endpoint.as_str())
    }

    /// True when this configuration would send dictation off the machine.
    pub fn requires_cloud(&self) -> bool {
        self.enabled && self.backend == RestructureBackend::Cloud
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    /// The dictation hotkey: press (toggle) or hold (push-to-talk) to record.
    pub shortcut: String,
    /// Hotkey that switches back to Normal mode (`home`).
    pub normal_shortcut: String,
    /// Hotkey that switches to Intent Mode (`intent`).
    ///
    /// The alias is a one-time migration shim: a config written before the mode
    /// was renamed stores this under its old key, and still has to load.
    #[serde(alias = "incidentShortcut")]
    pub intent_shortcut: String,
    pub mode: Mode,
    /// Which screen the home window opens on: dictation home or Intent Mode.
    pub home_mode: HomeMode,
    /// Volume-cue toggle exposed by the home window's sound button.
    pub sound_on: bool,
    /// `None` follows the Windows default input device.
    pub microphone: Option<String>,
    pub model_id: String,
    pub language: String,
    pub max_recording_seconds: u32,
    pub cleanup: Cleanup,
    pub intent: IntentSettings,
    pub theme: Theme,
    pub overlay_position: OverlayPosition,
    pub show_transcript_preview: bool,
    pub start_on_login: bool,
    /// Live dictation mode: insert, preview, or off.
    pub live_mode: LiveMode,
    /// Decode step interval in milliseconds.
    pub live_step_ms: u32,
    /// Audio window size in milliseconds.
    pub live_window_ms: u32,
    /// Optional separate model id for live decoding.
    pub live_model_id: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            shortcut: DEFAULT_SHORTCUT.to_string(),
            normal_shortcut: DEFAULT_NORMAL_SHORTCUT.to_string(),
            intent_shortcut: DEFAULT_INTENT_SHORTCUT.to_string(),
            // The dictation hotkey (Ctrl+M by default) carries both edges of a
            // hold, so push-to-talk works with a combo as well as a key.
            mode: Mode::Toggle,
            home_mode: HomeMode::Home,
            sound_on: true,
            microphone: None,
            model_id: "small.en".to_string(),
            language: "en".to_string(),
            max_recording_seconds: 300,
            cleanup: Cleanup::default(),
            intent: IntentSettings::default(),
            theme: Theme::System,
            overlay_position: OverlayPosition::BottomCenter,
            show_transcript_preview: false,
            start_on_login: false,
            live_mode: LiveMode::Insert,
            live_step_ms: DEFAULT_LIVE_STEP_MS,
            live_window_ms: DEFAULT_LIVE_WINDOW_MS,
            live_model_id: None,
        }
    }
}

/// A partial update from the settings window. `double_option` tells a missing
/// microphone apart from an explicit `null` (which means "system default").
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub shortcut: Option<String>,
    pub normal_shortcut: Option<String>,
    /// Accepts the pre-rename key too, so an old interface build cannot
    /// silently drop the hotkey while keeping the rest of a patch.
    #[serde(alias = "incidentShortcut")]
    pub intent_shortcut: Option<String>,
    pub mode: Option<Mode>,
    pub home_mode: Option<HomeMode>,
    pub sound_on: Option<bool>,
    #[serde(deserialize_with = "double_option")]
    pub microphone: Option<Option<String>>,
    pub model_id: Option<String>,
    pub language: Option<String>,
    pub max_recording_seconds: Option<u32>,
    pub cleanup: Option<CleanupPatch>,
    pub intent: Option<IntentSettingsPatch>,
    pub theme: Option<Theme>,
    pub overlay_position: Option<OverlayPosition>,
    pub show_transcript_preview: Option<bool>,
    pub start_on_login: Option<bool>,
    pub live_mode: Option<LiveMode>,
    pub live_step_ms: Option<u32>,
    pub live_window_ms: Option<u32>,
    pub live_model_id: Option<Option<String>>,
}

#[derive(Deserialize, Default, Debug, Clone)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct CleanupPatch {
    pub enabled: Option<bool>,
    pub normalize_whitespace: Option<bool>,
    pub capitalize_sentences: Option<bool>,
    pub remove_filler_words: Option<bool>,
    pub filler_words: Option<Vec<String>>,
}

/// A partial update of the Intent Mode settings. Consent is normally written
/// by the dedicated command, but it is patchable so the setting can be reset
/// without a second schema.
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct IntentSettingsPatch {
    pub enabled: Option<bool>,
    pub backend: Option<RestructureBackend>,
    pub endpoint: Option<String>,
    pub model: Option<String>,
    pub timeout_ms: Option<u32>,
    pub max_output_chars: Option<usize>,
    pub cloud_consent_endpoint: Option<String>,
    /// Explicitly withdraw cloud consent. The API key is removed separately.
    pub clear_cloud_consent: Option<bool>,
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
    /// Carries a config written by an older build forward.
    ///
    /// Version 1 stored the dictation default as the right Ctrl key; Ctrl+M is
    /// the default now, so a file that still holds that literal moves with the
    /// default, while any deliberately chosen key stays untouched. Version 3
    /// renamed the mode from Incident to Intent: the old JSON key is accepted
    /// by the serde alias on [`Settings::intent_shortcut`], so the value is
    /// already in place by the time this runs and is rewritten on the next
    /// save.
    pub fn migrate(&mut self) {
        if self.version < 2 && self.shortcut.eq_ignore_ascii_case("controlright") {
            self.shortcut = DEFAULT_SHORTCUT.to_string();
        }
        self.version = CONFIG_VERSION;
    }

    /// Clamps and cleans values a user (or a hand-edited file) could get wrong.
    pub fn normalize(&mut self) {
        self.version = CONFIG_VERSION;
        self.shortcut = self.shortcut.trim().to_string();
        self.normal_shortcut = self.normal_shortcut.trim().to_string();
        self.intent_shortcut = self.intent_shortcut.trim().to_string();
        if self.shortcut.is_empty() {
            self.shortcut = DEFAULT_SHORTCUT.to_string();
        }
        if self.normal_shortcut.is_empty() {
            self.normal_shortcut = DEFAULT_NORMAL_SHORTCUT.to_string();
        }
        if self.intent_shortcut.is_empty() {
            self.intent_shortcut = DEFAULT_INTENT_SHORTCUT.to_string();
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
        self.intent.normalize();
    }

    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(shortcut) = patch.shortcut {
            self.shortcut = shortcut;
        }
        if let Some(shortcut) = patch.normal_shortcut {
            self.normal_shortcut = shortcut;
        }
        if let Some(shortcut) = patch.intent_shortcut {
            self.intent_shortcut = shortcut;
        }
        if let Some(mode) = patch.mode {
            self.mode = mode;
        }
        if let Some(home_mode) = patch.home_mode {
            self.home_mode = home_mode;
        }
        if let Some(sound_on) = patch.sound_on {
            self.sound_on = sound_on;
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
        if let Some(intent) = patch.intent {
            if let Some(enabled) = intent.enabled {
                self.intent.enabled = enabled;
            }
            if let Some(backend) = intent.backend {
                self.intent.backend = backend;
            }
            if let Some(endpoint) = intent.endpoint {
                self.intent.endpoint = endpoint;
            }
            if let Some(model) = intent.model {
                self.intent.model = model;
            }
            if let Some(timeout_ms) = intent.timeout_ms {
                self.intent.timeout_ms = timeout_ms;
            }
            if let Some(max_output_chars) = intent.max_output_chars {
                self.intent.max_output_chars = max_output_chars;
            }
            if let Some(consent) = intent.cloud_consent_endpoint {
                self.intent.cloud_consent_endpoint = Some(consent);
            }
            if intent.clear_cloud_consent == Some(true) {
                self.intent.cloud_consent_endpoint = None;
            }
        }
        if let Some(live_mode) = patch.live_mode {
            self.live_mode = live_mode;
        }
        if let Some(live_step_ms) = patch.live_step_ms {
            self.live_step_ms = live_step_ms.clamp(MIN_LIVE_STEP_MS, MAX_LIVE_STEP_MS);
        }
        if let Some(live_window_ms) = patch.live_window_ms {
            self.live_window_ms = live_window_ms.clamp(MIN_LIVE_WINDOW_MS, MAX_LIVE_WINDOW_MS);
        }
        if let Some(live_model_id) = patch.live_model_id {
            self.live_model_id = live_model_id
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty());
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
                    settings.migrate();
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
    fn the_old_right_ctrl_default_adopts_the_new_ctrl_m_default() {
        let dir = temp_dir("migrate-default");
        let store = ConfigStore::new(&dir);
        let raw = r#"{
            "version": 1,
            "shortcut": "ControlRight",
            "mode": "push_to_talk",
            "homeMode": "home",
            "soundOn": true,
            "microphone": null,
            "modelId": "small.en",
            "language": "en",
            "maxRecordingSeconds": 300,
            "cleanup": {"enabled": true, "fillerWords": []}
        }"#;
        fs::write(dir.join(CONFIG_FILE), raw).unwrap();

        let loaded = store.load();
        assert_eq!(loaded.shortcut, DEFAULT_SHORTCUT);
        assert_eq!(loaded.version, CONFIG_VERSION);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_deliberately_chosen_dictation_key_is_left_alone_by_the_migration() {
        let dir = temp_dir("migrate-custom");
        let store = ConfigStore::new(&dir);
        let raw = r#"{
            "version": 1,
            "shortcut": "F4",
            "mode": "push_to_talk",
            "homeMode": "home",
            "soundOn": true,
            "microphone": null,
            "modelId": "small.en",
            "language": "en",
            "maxRecordingSeconds": 300,
            "cleanup": {"enabled": true, "fillerWords": []}
        }"#;
        fs::write(dir.join(CONFIG_FILE), raw).unwrap();

        let loaded = store.load();
        assert_eq!(loaded.shortcut, "F4");
        assert_eq!(loaded.version, CONFIG_VERSION);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_v2_config_keeping_the_old_default_is_not_rewritten() {
        // Settings::default() reports version 2, so a deliberate right-Ctrl
        // choice survives the migration; only a v1 file (written before the
        // default changed, and so carrying the shipped default) moves over.
        let mut newer = Settings {
            shortcut: "ControlRight".to_string(),
            ..Settings::default()
        };
        newer.migrate();
        assert_eq!(newer.shortcut, "ControlRight");

        let mut older = Settings {
            version: 1,
            shortcut: "ControlRight".to_string(),
            ..Settings::default()
        };
        older.migrate();
        assert_eq!(older.shortcut, DEFAULT_SHORTCUT);
    }

    #[test]
    fn home_mode_and_sound_toggle_persist_through_patches() {
        let mut settings = Settings::default();
        let patch: SettingsPatch =
            serde_json::from_str(r#"{"homeMode":"intent","soundOn":false}"#).unwrap();
        settings.apply(patch);

        assert_eq!(settings.home_mode, HomeMode::Intent);
        assert!(!settings.sound_on);
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
    fn mode_hotkeys_persist_and_fall_back_to_defaults_when_blank() {
        let mut settings = Settings::default();
        settings.apply(
            serde_json::from_str(
                r#"{"normalShortcut":"Ctrl+Shift+N","intentShortcut":"Ctrl+Shift+I"}"#,
            )
            .unwrap(),
        );
        assert_eq!(settings.normal_shortcut, "Ctrl+Shift+N");
        assert_eq!(settings.intent_shortcut, "Ctrl+Shift+I");

        settings.normal_shortcut = "   ".into();
        settings.normalize();
        assert_eq!(settings.normal_shortcut, DEFAULT_NORMAL_SHORTCUT);
    }

    #[test]
    fn a_pre_rename_config_keeps_the_intent_hotkey() {
        // The one place the old key name survives, on purpose: a config written
        // before the rename must still load, and must be rewritten under the
        // new key the next time settings are saved.
        let dir = temp_dir("legacy-intent-key");
        fs::create_dir_all(&dir).unwrap();
        let raw = r#"{
            "version": 2,
            "shortcut": "Ctrl+M",
            "normalShortcut": "Ctrl+Alt",
            "incidentShortcut": "Ctrl+Shift+I",
            "homeMode": "intent",
            "modelId": "small.en"
        }"#;
        fs::write(dir.join(CONFIG_FILE), raw).unwrap();

        let store = ConfigStore::new(&dir);
        let loaded = store.load();
        assert_eq!(loaded.intent_shortcut, "Ctrl+Shift+I");
        assert_eq!(loaded.version, CONFIG_VERSION);

        let json = serde_json::to_string(&loaded).unwrap();
        assert!(json.contains("\"intentShortcut\""));
        assert!(!json.contains("Incident"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn intent_mode_is_off_by_default_and_local() {
        let intent = IntentSettings::default();
        assert!(!intent.enabled);
        assert_eq!(intent.backend, RestructureBackend::Local);
        assert_eq!(intent.endpoint, DEFAULT_INTENT_ENDPOINT);
        assert_eq!(intent.timeout_ms, 4_000);
        assert_eq!(intent.max_output_chars, 1_200);
        assert_eq!(intent.cloud_consent_endpoint, None);
    }

    #[test]
    fn intent_settings_are_clamped_and_trimmed() {
        let mut settings = Settings {
            intent: IntentSettings {
                endpoint: "  http://127.0.0.1:11434  ".into(),
                model: "  llama3.2  ".into(),
                timeout_ms: 1,
                max_output_chars: 10,
                ..IntentSettings::default()
            },
            ..Settings::default()
        };
        settings.normalize();
        assert_eq!(settings.intent.endpoint, "http://127.0.0.1:11434");
        assert_eq!(settings.intent.model, "llama3.2");
        assert_eq!(settings.intent.timeout_ms, MIN_INTENT_TIMEOUT_MS);
        assert_eq!(settings.intent.max_output_chars, MIN_INTENT_OUTPUT_CHARS);

        settings.intent.timeout_ms = 100_000;
        settings.intent.max_output_chars = 100_000;
        settings.intent.endpoint = "   ".into();
        settings.intent.model.clear();
        settings.normalize();
        assert_eq!(settings.intent.timeout_ms, MAX_INTENT_TIMEOUT_MS);
        assert_eq!(settings.intent.max_output_chars, MAX_INTENT_OUTPUT_CHARS);
        assert_eq!(settings.intent.endpoint, DEFAULT_INTENT_ENDPOINT);
        assert_eq!(settings.intent.model, DEFAULT_INTENT_MODEL);
    }

    #[test]
    fn intent_settings_apply_as_a_nested_patch() {
        let mut settings = Settings::default();
        let patch: SettingsPatch = serde_json::from_str(
            r#"{"intent":{"enabled":true,"backend":"cloud","endpoint":"https://example.test/v1/chat/completions","model":"gpt-4o-mini","timeoutMs":2500,"maxOutputChars":900}}"#,
        )
        .unwrap();
        settings.apply(patch);

        assert!(settings.intent.enabled);
        assert_eq!(settings.intent.backend, RestructureBackend::Cloud);
        assert_eq!(
            settings.intent.endpoint,
            "https://example.test/v1/chat/completions"
        );
        assert_eq!(settings.intent.model, "gpt-4o-mini");
        assert_eq!(settings.intent.timeout_ms, 2_500);
        assert_eq!(settings.intent.max_output_chars, 900);

        // A later patch that only touches one key leaves the rest alone.
        settings.apply(
            serde_json::from_str::<SettingsPatch>(r#"{"intent":{"enabled":false}}"#).unwrap(),
        );
        assert!(!settings.intent.enabled);
        assert_eq!(settings.intent.model, "gpt-4o-mini");
    }

    #[test]
    fn cloud_consent_is_bound_to_the_exact_endpoint() {
        let mut intent = IntentSettings {
            enabled: true,
            backend: RestructureBackend::Cloud,
            endpoint: "https://one.example/v1/chat/completions".into(),
            cloud_consent_endpoint: Some("https://one.example/v1/chat/completions".into()),
            ..IntentSettings::default()
        };
        assert!(intent.requires_cloud());
        assert!(intent.cloud_consent_matches());

        intent.endpoint = "https://two.example/v1/chat/completions".into();
        assert!(
            !intent.cloud_consent_matches(),
            "new endpoint needs consent"
        );
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

//! The speech-model catalogue, and the only network code in Miro.
//!
//! Rules that shape this module:
//!   * Nothing is downloaded without the user seeing the name, the size and the
//!     exact source first. The size shown is the one the server reports, not a
//!     number baked into the binary that could have gone stale.
//!   * Downloads resume. The partial file is the resume state, and it is not
//!     sensitive: it is a model file the user asked for.
//!   * A download is verified before it is used: exact byte count, the file's
//!     own structural header, and a digest comparison when one is known.
//!     [`Verification`] says which of those actually happened, so the interface
//!     can never claim more than was checked.
//!   * Cancelling keeps the partial file so the user can resume; deleting is a
//!     separate, explicit action.
//!   * The transfer is blocking on purpose. It runs on its own thread, and the
//!     only thing an async runtime would add here is a second copy of the same
//!     loop.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;

use crate::digest;
use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

/// whisper.cpp writes its own ggml container; GGUF is the newer sibling format.
/// Both are accepted so a file from either generation loads.
const GGUF_MAGIC: &[u8; 4] = b"GGUF";
const GGML_MAGIC_BYTES: &[u8; 4] = b"ggml";
const GGML_MAGIC_LE: u32 = 0x6767_6d6c;

/// `Miro/<version>` is all the source learns about the caller.
const USER_AGENT: &str = concat!("Miro/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelStatus {
    NotInstalled,
    Partial,
    Downloading,
    Verifying,
    Installed,
    Corrupt,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub file_name: String,
    /// `None` until the source has been asked; the interface shows
    /// "checked with the source" rather than a made-up number.
    pub size_bytes: Option<u64>,
    /// The published integrity value for this file, when one is known.
    pub integrity: Option<String>,
    pub source_url: String,
    pub source_label: String,
    pub license: String,
    pub languages: String,
    pub parameters: String,
    pub quality: String,
    pub recommended: bool,
    pub status: ModelStatus,
    pub installed_bytes: Option<u64>,
    pub target_path: String,
    pub download: Option<DownloadState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadState {
    pub received_bytes: u64,
    pub total_bytes: Option<u64>,
    pub resumable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub file_name: &'static str,
    pub languages: &'static str,
    pub parameters: &'static str,
    pub quality: &'static str,
    pub recommended: bool,
    pub multilingual: bool,
}

// The original ggml-org upload is gated (HTTP 401) since 2026; the same files
// remain publicly mirrored in the repo's previous location.
const REPO_LABEL: &str = "huggingface.co/ggerganov/whisper.cpp";
const REPO_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

pub const CATALOG: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny.en",
        name: "Tiny English",
        file_name: "ggml-tiny.en-q5_1.bin",
        languages: "English",
        parameters: "39 M",
        quality: "fast",
        recommended: false,
        multilingual: false,
    },
    ModelSpec {
        id: "base.en",
        name: "Base English",
        file_name: "ggml-base.en-q5_1.bin",
        languages: "English",
        parameters: "74 M",
        quality: "balanced",
        recommended: false,
        multilingual: false,
    },
    ModelSpec {
        id: "small.en",
        name: "Small English",
        file_name: "ggml-small.en-q5_1.bin",
        languages: "English",
        parameters: "244 M",
        quality: "accurate",
        recommended: true,
        multilingual: false,
    },
    ModelSpec {
        id: "medium.en",
        name: "Medium English",
        file_name: "ggml-medium.en-q5_0.bin",
        languages: "English",
        parameters: "769 M",
        quality: "accurate",
        recommended: false,
        multilingual: false,
    },
    ModelSpec {
        id: "tiny",
        name: "Tiny multilingual",
        file_name: "ggml-tiny-q5_1.bin",
        languages: "Multilingual",
        parameters: "39 M",
        quality: "fast",
        recommended: false,
        multilingual: true,
    },
    ModelSpec {
        id: "base",
        name: "Base multilingual",
        file_name: "ggml-base-q5_1.bin",
        languages: "Multilingual",
        parameters: "74 M",
        quality: "balanced",
        recommended: false,
        multilingual: true,
    },
    ModelSpec {
        id: "small",
        name: "Small multilingual",
        file_name: "ggml-small-q5_1.bin",
        languages: "Multilingual",
        parameters: "244 M",
        quality: "accurate",
        recommended: false,
        multilingual: true,
    },
    ModelSpec {
        id: "large-v3-turbo",
        name: "Large v3 Turbo multilingual",
        file_name: "ggml-large-v3-turbo-q5_0.bin",
        languages: "Multilingual",
        parameters: "809 M",
        quality: "accurate",
        recommended: false,
        multilingual: true,
    },
];

pub fn spec(id: &str) -> Option<&'static ModelSpec> {
    CATALOG.iter().find(|spec| spec.id == id)
}

pub fn source_url(spec: &ModelSpec) -> String {
    format!("{REPO_BASE}/{}", spec.file_name)
}

pub fn models_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models")
}

pub fn model_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(spec.file_name)
}

pub fn partial_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(format!("{}.part", spec.file_name))
}

/// Structural check: does this file even claim to be a model?
///
/// Cheap, offline, and it catches the common failure modes: an HTML error page
/// saved as a model, a truncated file, a zero-byte file.
pub fn has_model_header(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut head = [0u8; 4];
    if file.read_exact(&mut head).is_err() {
        return false;
    }
    if &head == GGUF_MAGIC || &head == GGML_MAGIC_BYTES {
        return true;
    }
    u32::from_le_bytes(head) == GGML_MAGIC_LE
}

pub fn installed_bytes(dir: &Path, spec: &ModelSpec) -> Option<u64> {
    fs::metadata(model_path(dir, spec))
        .ok()
        .map(|meta| meta.len())
}

pub fn inspect(dir: &Path, spec: &ModelSpec) -> ModelInfo {
    let path = model_path(dir, spec);
    let partial = partial_path(dir, spec);

    let (status, size) = if path.exists() {
        if has_model_header(&path) {
            (ModelStatus::Installed, installed_bytes(dir, spec))
        } else {
            (ModelStatus::Corrupt, installed_bytes(dir, spec))
        }
    } else if partial.exists() {
        (ModelStatus::Partial, None)
    } else {
        (ModelStatus::NotInstalled, None)
    };

    let download = fs::metadata(&partial)
        .ok()
        .filter(|_| status == ModelStatus::Partial)
        .map(|meta| DownloadState {
            received_bytes: meta.len(),
            total_bytes: None,
            resumable: meta.len() > 0,
        });

    ModelInfo {
        id: spec.id.to_string(),
        name: spec.name.to_string(),
        file_name: spec.file_name.to_string(),
        size_bytes: None,
        integrity: None,
        source_url: source_url(spec),
        source_label: REPO_LABEL.to_string(),
        license: "MIT".to_string(),
        languages: spec.languages.to_string(),
        parameters: spec.parameters.to_string(),
        quality: spec.quality.to_string(),
        recommended: spec.recommended,
        status,
        installed_bytes: size,
        target_path: path.display().to_string(),
        download,
    }
}

pub fn catalog(dir: &Path) -> Vec<ModelInfo> {
    CATALOG.iter().map(|spec| inspect(dir, spec)).collect()
}

/// What was actually checked before a model was accepted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verification {
    /// Byte count and file header were checked, and a published digest matched.
    Published { bytes: u64, value: String },
    /// Byte count and file header were checked. No published digest was
    /// available for this file, and Miro says so instead of implying otherwise.
    SizeAndHeader { bytes: u64 },
}

impl Verification {
    pub fn bytes(&self) -> u64 {
        match self {
            Verification::Published { bytes, .. } => *bytes,
            Verification::SizeAndHeader { bytes } => *bytes,
        }
    }

    /// One line for the interface and the logs. Never overstates what happened.
    pub fn summary(&self) -> String {
        match self {
            Verification::Published { bytes, value } => {
                let shown = &value[..value.len().min(16)];
                format!("{bytes} bytes, published digest verified ({shown}...)")
            }
            Verification::SizeAndHeader { bytes } => {
                format!("{bytes} bytes, length and header verified, no published digest available")
            }
        }
    }
}

/// Verifies a model file.
///
/// `expected` is `None` for catalogue entries where no published integrity value
/// was obtained; the caller must then surface the weaker guarantee.
pub fn verify_file(
    path: &Path,
    expected_len: Option<u64>,
    expected: Option<&str>,
) -> Result<Verification> {
    let metadata =
        fs::metadata(path).map_err(|e| Failure::ModelFileMissing(format!("{path:?}: {e}")))?;
    let bytes = metadata.len();

    if bytes == 0 {
        return Err(Failure::ModelCorrupt {
            model: "the file is empty".into(),
        });
    }
    if let Some(expected_len) = expected_len {
        if bytes != expected_len {
            return Err(Failure::ModelCorrupt {
                model: format!("expected {expected_len} bytes, found {bytes}"),
            });
        }
    }
    if !has_model_header(path) {
        return Err(Failure::ModelCorrupt {
            model: "the file does not start with a model header".into(),
        });
    }

    match expected {
        Some(expected) => {
            let actual = digest::sha256_file(path)?;
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(Failure::ModelCorrupt {
                    model: "the published digest does not match".into(),
                });
            }
            Ok(Verification::Published {
                bytes,
                value: actual,
            })
        }
        None => Ok(Verification::SizeAndHeader { bytes }),
    }
}

/// Asks the source how big the file is, so the confirmation dialog can show a
/// real number and the user can judge the download before it starts.
pub fn probe_size(client: &ureq::Agent, spec: &ModelSpec) -> Result<Option<u64>> {
    let response = client
        .head(&source_url(spec))
        .header("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| Failure::Download(format!("source unreachable: {e}")))?;
    Ok(header_u64(response.headers(), "content-length"))
}

fn header_u64(headers: &ureq::http::HeaderMap, name: &str) -> Option<u64> {
    headers
        .get(name)
        .and_then(|value: &ureq::http::HeaderValue| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
}

pub struct DownloadOutcome {
    pub verification: Verification,
    pub resumed_from: u64,
}

/// Downloads (or resumes) a model file. Blocking; call it from your own thread.
///
/// `on_progress` is called as bytes arrive.
pub fn download<F>(
    client: &ureq::Agent,
    dir: &Path,
    spec: &'static ModelSpec,
    cancel: Arc<AtomicBool>,
    mut on_progress: F,
) -> Result<DownloadOutcome>
where
    F: FnMut(u64, Option<u64>),
{
    fs::create_dir_all(dir).map_err(|e| Failure::Download(format!("create models dir: {e}")))?;

    let partial = partial_path(dir, spec);
    let target = model_path(dir, spec);
    let existing = fs::metadata(&partial).map(|meta| meta.len()).unwrap_or(0);

    let mut request = client
        .get(source_url(spec))
        .header("User-Agent", USER_AGENT);
    if existing > 0 {
        request = request.header("Range", &format!("bytes={existing}-"));
    }

    let response = request
        .call()
        .map_err(|e| Failure::Download(format!("download failed: {e}")))?;

    // A 200 to a ranged request means the server ignored the range: start over
    // rather than writing a second copy on top of the first.
    let resumed_from = if existing > 0 && response.status().as_u16() == 206 {
        existing
    } else {
        0
    };
    let total =
        header_u64(response.headers(), "content-length").map(|length| length + resumed_from);

    logging::event(Event::ModelDownloadStarted {
        model: spec.id.to_string(),
        bytes: total.unwrap_or(0),
    });

    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed_from > 0)
        .truncate(resumed_from == 0)
        .open(&partial)
        .map_err(|e| Failure::Download(format!("open partial: {e}")))?;

    let mut reader = response.into_body().into_reader();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut received = resumed_from;
    let mut last_reported = 0u64;

    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = file.flush();
            drop(file);
            // The partial file stays: pressing Resume continues from here.
            logging::event(Event::ModelDownloadFinished {
                model: format!("{} (cancelled at {received} bytes)", spec.id),
            });
            return Err(Failure::DownloadCancelled);
        }

        let read = reader
            .read(&mut buffer)
            .map_err(|e| Failure::Download(format!("transfer interrupted: {e}")))?;
        if read == 0 {
            break;
        }

        file.write_all(&buffer[..read])
            .map_err(|e| Failure::Download(format!("write: {e}")))?;
        received += read as u64;

        // Keep the interface at a readable rate rather than one event per read.
        if received - last_reported >= 512 * 1024 || Some(received) == total {
            last_reported = received;
            on_progress(received, total);
            if let Some(total) = total {
                logging::event(Event::ModelDownloadProgress {
                    model: spec.id.to_string(),
                    percent: ((received as f64 / total as f64) * 100.0) as u32,
                });
            }
        }
    }

    file.flush()
        .map_err(|e| Failure::Download(format!("flush: {e}")))?;
    drop(file);

    // The partial file becomes the model file only after it passes verification.
    let verification = match verify_file(&partial, total, None) {
        Ok(verification) => verification,
        Err(failure) => {
            let _ = fs::remove_file(&partial);
            logging::event(Event::ModelVerified {
                model: spec.id.to_string(),
                ok: false,
            });
            return Err(failure);
        }
    };

    fs::rename(&partial, &target).map_err(|e| Failure::Download(format!("finish: {e}")))?;

    logging::event(Event::ModelVerified {
        model: spec.id.to_string(),
        ok: true,
    });
    logging::event(Event::ModelDownloadFinished {
        model: spec.id.to_string(),
    });

    Ok(DownloadOutcome {
        verification,
        resumed_from,
    })
}

/// Removes a model and any partial download of it.
pub fn delete(dir: &Path, spec: &ModelSpec) -> Result<()> {
    for path in [model_path(dir, spec), partial_path(dir, spec)] {
        if path.exists() {
            fs::remove_file(&path).map_err(|e| Failure::Internal(format!("delete model: {e}")))?;
        }
    }
    Ok(())
}

/// Whether a previous download can be resumed, for the settings list.
pub fn resume_offset(dir: &Path, spec: &ModelSpec) -> u64 {
    fs::metadata(partial_path(dir, spec))
        .map(|meta| meta.len())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("miro-models-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_model(path: &Path, body: &[u8]) {
        let mut bytes = b"ggml".to_vec();
        bytes.extend_from_slice(body);
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn catalogue_has_a_default_that_exists() {
        let recommended: Vec<_> = CATALOG.iter().filter(|spec| spec.recommended).collect();
        assert_eq!(
            recommended.len(),
            1,
            "exactly one model is the recommended default"
        );
        assert_eq!(recommended[0].id, "small.en");
        assert!(spec("small.en").is_some());
        assert!(spec("nope").is_none());
    }

    #[test]
    fn catalogue_ids_and_files_are_unique() {
        let mut ids: Vec<&str> = CATALOG.iter().map(|spec| spec.id).collect();
        let mut files: Vec<&str> = CATALOG.iter().map(|spec| spec.file_name).collect();
        ids.sort_unstable();
        files.sort_unstable();
        let id_count = ids.len();
        let file_count = files.len();
        ids.dedup();
        files.dedup();
        assert_eq!(ids.len(), id_count, "duplicate model id in the catalogue");
        assert_eq!(
            files.len(),
            file_count,
            "duplicate file name in the catalogue"
        );
    }

    #[test]
    fn every_source_url_is_https_and_matches_the_file_name() {
        for spec in CATALOG {
            let url = source_url(spec);
            assert!(url.starts_with("https://"), "{url} must be https");
            assert!(
                url.ends_with(spec.file_name),
                "{url} must end with the file name"
            );
        }
    }

    #[test]
    fn a_valid_file_is_recognised_and_installed() {
        let dir = temp_dir("valid");
        let spec = spec("base.en").unwrap();
        write_model(&model_path(&dir, spec), &[7u8; 1024]);

        let info = inspect(&dir, spec);
        assert_eq!(info.status, ModelStatus::Installed);
        assert_eq!(info.installed_bytes, Some(1028));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_error_page_saved_as_a_model_is_reported_as_corrupt() {
        let dir = temp_dir("corrupt");
        let spec = spec("base.en").unwrap();
        fs::write(model_path(&dir, spec), b"<html>404 not found</html>").unwrap();

        assert_eq!(inspect(&dir, spec).status, ModelStatus::Corrupt);
        assert!(verify_file(&model_path(&dir, spec), None, None).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_zero_byte_file_is_never_accepted() {
        let dir = temp_dir("empty");
        let spec = spec("tiny.en").unwrap();
        fs::write(model_path(&dir, spec), b"").unwrap();
        assert_eq!(inspect(&dir, spec).status, ModelStatus::Corrupt);
        assert!(verify_file(&model_path(&dir, spec), None, None).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_partial_download_is_reported_as_resumable() {
        let dir = temp_dir("partial");
        let spec = spec("small.en").unwrap();
        fs::write(partial_path(&dir, spec), vec![0u8; 2048]).unwrap();

        let info = inspect(&dir, spec);
        assert_eq!(info.status, ModelStatus::Partial);
        assert_eq!(resume_offset(&dir, spec), 2048);
        let download = info.download.expect("partial state is reported");
        assert_eq!(download.received_bytes, 2048);
        assert!(download.resumable);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn both_container_headers_are_accepted() {
        let dir = temp_dir("headers");
        for (name, head) in [
            ("gguf.bin", &b"GGUF\x03\x00\x00\x00"[..]),
            ("ggml.bin", &b"ggml\x01\x00\x00\x00"[..]),
        ] {
            let path = dir.join(name);
            fs::write(&path, head).unwrap();
            assert!(has_model_header(&path), "{name} should be accepted");
        }

        let text = dir.join("text.bin");
        fs::write(&text, b"plain text").unwrap();
        assert!(!has_model_header(&text));

        let short = dir.join("short.bin");
        fs::write(&short, b"gg").unwrap();
        assert!(!has_model_header(&short));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn verification_rejects_a_length_mismatch() {
        let dir = temp_dir("length");
        let file = dir.join("model.bin");
        write_model(&file, &[0u8; 100]);

        assert!(verify_file(&file, Some(999), None).is_err());
        assert_eq!(
            verify_file(&file, Some(104), None).unwrap(),
            Verification::SizeAndHeader { bytes: 104 }
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn verification_uses_the_published_value_when_one_is_known() {
        let dir = temp_dir("digest");
        let file = dir.join("model.bin");
        write_model(&file, b"payload");

        let published = digest::sha256_file(&file).unwrap();
        assert!(matches!(
            verify_file(&file, None, Some(&published)).unwrap(),
            Verification::Published { .. }
        ));

        let wrong = "0".repeat(64);
        assert!(
            verify_file(&file, None, Some(&wrong)).is_err(),
            "a wrong published value must be rejected"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_verification_summary_never_overstates_what_was_checked() {
        let weak = Verification::SizeAndHeader { bytes: 10 };
        assert!(weak.summary().contains("no published digest available"));
        assert_eq!(weak.bytes(), 10);

        let strong = Verification::Published {
            bytes: 10,
            value: "ab".repeat(32),
        };
        assert!(strong.summary().contains("published digest verified"));
        assert!(
            !strong.summary().contains(&"ab".repeat(32)),
            "the full value is not echoed into logs"
        );
    }

    #[test]
    fn deleting_removes_both_the_model_and_its_partial_file() {
        let dir = temp_dir("delete");
        let spec = spec("base").unwrap();
        write_model(&model_path(&dir, spec), &[1u8; 64]);
        fs::write(partial_path(&dir, spec), b"partial").unwrap();

        delete(&dir, spec).unwrap();
        assert!(!model_path(&dir, spec).exists());
        assert!(!partial_path(&dir, spec).exists());
        assert_eq!(inspect(&dir, spec).status, ModelStatus::NotInstalled);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_catalogue_marks_which_models_are_multilingual() {
        assert!(!spec("base.en").unwrap().multilingual);
        assert!(spec("base").unwrap().multilingual);
        assert!(spec("large-v3-turbo").unwrap().multilingual);
    }

    #[test]
    fn a_content_length_header_is_parsed_only_when_it_is_a_number() {
        let mut headers = ureq::http::HeaderMap::new();
        headers.insert("content-length", "1234".parse().unwrap());
        assert_eq!(header_u64(&headers, "content-length"), Some(1234));
        assert_eq!(header_u64(&headers, "missing"), None);

        let mut junk = ureq::http::HeaderMap::new();
        junk.insert("content-length", "not a number".parse().unwrap());
        assert_eq!(header_u64(&junk, "content-length"), None);
    }
}

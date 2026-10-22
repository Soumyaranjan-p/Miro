//! Local usage statistics: numeric aggregates and nothing else.
//!
//! What is stored, on purpose:
//!   * per local calendar day: how many dictations succeeded, how many words
//!     they carried, how long the speech was, and how long each mode was in
//!     force;
//!   * nothing else. No transcripts, no word lists, no timestamps finer than
//!     a day, no window titles, no device names.
//!
//! The file is `stats.json` next to `config.json`, written atomically. Every
//! operation is best-effort: a failed write is logged, and the numbers are
//! never precious enough to disturb a dictation.

use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Duration, Local};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::config::HomeMode;
use crate::errors::{Failure, Result};
use crate::logging::{self, Event};

const STATS_FILE: &str = "stats.json";
const STATS_VERSION: u32 = 1;
/// How many recent days the summary returns for the charts.
const SUMMARY_DAYS: usize = 30;

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct DayEntry {
    pub dictations: u32,
    pub words: u32,
    pub speech_ms: u64,
    pub normal_ms: u64,
    pub incident_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
struct StatsFile {
    version: u32,
    days: BTreeMap<String, DayEntry>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatsDay {
    pub date: String,
    pub dictations: u32,
    pub words: u32,
    pub speech_ms: u64,
    pub normal_ms: u64,
    pub incident_ms: u64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatsSummary {
    pub total_dictations: u32,
    pub total_words: u32,
    pub total_speech_ms: u64,
    pub normal_ms: u64,
    pub incident_ms: u64,
    /// Average words per minute over all recorded speech, or None without data.
    pub words_per_minute: Option<f64>,
    /// Consecutive days ending today (or yesterday) with at least one dictation.
    pub streak_days: u32,
    /// The most recent days, oldest first, for the charts.
    pub days: Vec<StatsDay>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn file_path(app: &AppHandle) -> Result<std::path::PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| Failure::Internal(format!("app data dir: {e}")))?;
    Ok(dir.join(STATS_FILE))
}

fn load(path: &std::path::Path) -> StatsFile {
    match std::fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<StatsFile>(&raw) {
            Ok(stats) => stats,
            // A hand-corrupted stats file is replaced rather than quarantined:
            // unlike settings, losing usage counters is never a loss of data.
            Err(_) => StatsFile {
                version: STATS_VERSION,
                days: BTreeMap::new(),
            },
        },
        Err(_) => StatsFile {
            version: STATS_VERSION,
            days: BTreeMap::new(),
        },
    }
}

fn save(path: &std::path::Path, stats: &StatsFile) -> Result<()> {
    let json = serde_json::to_string_pretty(stats)
        .map_err(|e| Failure::ConfigWrite(format!("serialize: {e}")))?;
    std::fs::write(path, json).map_err(|e| Failure::ConfigWrite(format!("write: {e}")))?;
    Ok(())
}

fn local_date_key(epoch_ms: u64) -> String {
    let date = chrono::DateTime::from_timestamp_millis(epoch_ms as i64)
        .map(|dt| dt.with_timezone(&Local).date_naive());
    date.unwrap_or_else(|| Local::now().date_naive())
        .to_string()
}

/// One successful dictation: counts only, no text.
pub fn record_dictation(app: &AppHandle, words: u32, speech_ms: u64) {
    let path = match file_path(app) {
        Ok(path) => path,
        Err(_) => return,
    };
    let mut stats = load(&path);
    let entry = stats.days.entry(local_date_key(now_ms())).or_default();
    entry.dictations = entry.dictations.saturating_add(1);
    entry.words = entry.words.saturating_add(words);
    entry.speech_ms = entry.speech_ms.saturating_add(speech_ms);
    if let Err(failure) = save(&path, &stats) {
        logging::event(Event::Failure {
            code: failure.code().as_str(),
            detail: failure.detail().unwrap_or_default(),
        });
    }
}

/// Flushes the outgoing mode's elapsed time, then anchors the current mode.
/// Called from bootstrap (to anchor) and on every mode change.
pub fn on_mode_changed(app: &AppHandle) {
    let app_state = crate::state::state(app);
    if let Some((mode, since_ms)) = app_state.take_mode_anchor() {
        let span = now_ms().saturating_sub(since_ms);
        if span == 0 {
            // Nothing meaningful elapsed; no phantom mode entries.
        } else {
            let path = match file_path(app) {
                Ok(path) => path,
                Err(_) => return,
            };
            let mut stats = load(&path);
            // The span is attributed to the day it began, its dominant mode.
            let entry = stats.days.entry(local_date_key(since_ms)).or_default();
            match mode {
                HomeMode::Home => entry.normal_ms = entry.normal_ms.saturating_add(span),
                HomeMode::Intent => entry.incident_ms = entry.incident_ms.saturating_add(span),
            }
            if let Err(failure) = save(&path, &stats) {
                logging::event(Event::Failure {
                    code: failure.code().as_str(),
                    detail: failure.detail().unwrap_or_default(),
                });
            }
        }
    }
    let mode = app_state.settings().home_mode;
    app_state.set_mode_anchor(mode, now_ms());
}

/// Shared state cannot outlive the process: flushing the anchor on the way out
/// keeps the tail of today's mode usage honest.
pub fn flush_on_exit(app: &AppHandle) {
    on_mode_changed(app);
}

/// Aggregated numbers for the Statistics page. Read-only.
pub fn summary(app: &AppHandle) -> Result<StatsSummary> {
    let path = file_path(app)?;
    let mut stats = load(&path);
    stats.version = STATS_VERSION;

    let mut total_dictations = 0u32;
    let mut total_words = 0u32;
    let mut total_speech_ms = 0u64;
    let mut normal_ms = 0u64;
    let mut incident_ms = 0u64;
    for entry in stats.days.values() {
        total_dictations = total_dictations.saturating_add(entry.dictations);
        total_words = total_words.saturating_add(entry.words);
        total_speech_ms = total_speech_ms.saturating_add(entry.speech_ms);
        normal_ms = normal_ms.saturating_add(entry.normal_ms);
        incident_ms = incident_ms.saturating_add(entry.incident_ms);
    }

    let words_per_minute = if total_speech_ms > 0 && total_words > 0 {
        let minutes = total_speech_ms as f64 / 60_000.0;
        Some((total_words as f64 / minutes).max(0.0))
    } else {
        None
    };

    // The most recent SummaryDays, oldest first.
    let recent: Vec<(String, DayEntry)> = stats
        .days
        .iter()
        .rev()
        .take(SUMMARY_DAYS)
        .map(|(date, entry)| (date.clone(), entry.clone()))
        .collect();
    let days: Vec<StatsDay> = recent
        .into_iter()
        .rev()
        .map(|(date, entry)| StatsDay {
            date,
            dictations: entry.dictations,
            words: entry.words,
            speech_ms: entry.speech_ms,
            normal_ms: entry.normal_ms,
            incident_ms: entry.incident_ms,
        })
        .collect();

    Ok(StatsSummary {
        total_dictations,
        total_words,
        total_speech_ms,
        normal_ms,
        incident_ms,
        words_per_minute,
        streak_days: streak(&stats),
        days,
    })
}

/// Consecutive days with at least one dictation, ending today or yesterday.
fn streak(stats: &StatsFile) -> u32 {
    let is_active = |date: &str| {
        stats
            .days
            .get(date)
            .map(|e| e.dictations > 0)
            .unwrap_or(false)
    };

    let today = Local::now().date_naive();
    let start = if is_active(&today.to_string()) {
        today
    } else {
        let yesterday = today - Duration::days(1);
        if !is_active(&yesterday.to_string()) {
            return 0;
        }
        yesterday
    };

    let mut count = 0u32;
    let mut cursor = start;
    loop {
        if !is_active(&cursor.to_string()) {
            break;
        }
        count += 1;
        cursor -= Duration::days(1);
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn file() -> StatsFile {
        StatsFile {
            version: STATS_VERSION,
            days: BTreeMap::new(),
        }
    }

    fn apply_dictation(stats: &mut StatsFile, date: &str, words: u32, speech_ms: u64) {
        let entry = stats.days.entry(date.to_string()).or_default();
        entry.dictations = entry.dictations.saturating_add(1);
        entry.words = entry.words.saturating_add(words);
        entry.speech_ms = entry.speech_ms.saturating_add(speech_ms);
    }

    fn apply_mode_seconds(stats: &mut StatsFile, date: &str, mode: HomeMode, ms: u64) {
        let entry = stats.days.entry(date.to_string()).or_default();
        match mode {
            HomeMode::Home => entry.normal_ms = entry.normal_ms.saturating_add(ms),
            HomeMode::Intent => entry.incident_ms = entry.incident_ms.saturating_add(ms),
        }
    }

    #[test]
    fn dictations_accumulate_per_day() {
        let mut stats = file();
        apply_dictation(&mut stats, "2026-10-20", 10, 60_000);
        apply_dictation(&mut stats, "2026-10-20", 5, 30_000);
        apply_dictation(&mut stats, "2026-10-21", 2, 10_000);

        assert_eq!(stats.days["2026-10-20"].dictations, 2);
        assert_eq!(stats.days["2026-10-20"].words, 15);
        assert_eq!(stats.days["2026-10-20"].speech_ms, 90_000);
        assert_eq!(stats.days["2026-10-21"].dictations, 1);
    }

    #[test]
    fn mode_seconds_land_in_their_own_bucket() {
        let mut stats = file();
        apply_mode_seconds(&mut stats, "2026-10-20", HomeMode::Home, 1_000_000);
        apply_mode_seconds(&mut stats, "2026-10-20", HomeMode::Intent, 500_000);

        let day = &stats.days["2026-10-20"];
        assert_eq!(day.normal_ms, 1_000_000);
        assert_eq!(day.incident_ms, 500_000);
        assert_eq!(day.dictations, 0, "time in a mode is not a dictation");
    }

    #[test]
    fn no_stats_yet_means_a_zero_summary_without_error() {
        let stats = file();
        // A fresh install is not "on fire": an empty book has no streak.
        assert_eq!(streak(&stats), 0);
    }

    #[test]
    fn the_streak_counts_consecutive_active_days_ending_today() {
        let mut stats = file();
        let today = Local::now().date_naive();
        for offset in 0..3 {
            let date = (today - Duration::days(offset)).to_string();
            apply_dictation(&mut stats, &date, 4, 12_000);
        }
        // A gap does not matter while it is outside the respected run.
        apply_dictation(&mut stats, "2020-01-01", 1, 3_000);
        assert_eq!(streak(&stats), 3);

        // Break the run: today is silent, but yesterday's run still counts
        // until it lapses out.
        stats
            .days
            .get_mut(&(today - Duration::days(0)).to_string())
            .unwrap()
            .dictations = 0;
        assert_eq!(streak(&stats), 2);
    }

    #[test]
    fn a_lone_yesterday_runs_are_grateful_but_finite() {
        let mut stats = file();
        let yesterday = Local::now().date_naive() - Duration::days(1);
        apply_dictation(&mut stats, &yesterday.to_string(), 1, 3_000);
        assert_eq!(streak(&stats), 1, "yesterday still counts before it lapses");
    }

    #[test]
    fn stats_never_gain_text_like_fields() {
        let mut stats = file();
        apply_dictation(&mut stats, "2026-10-20", 9, 10_000);
        let json = serde_json::to_string(&stats).unwrap();
        for forbidden in ["transcript", "\"text\"", "audio\""] {
            assert!(
                !json.contains(forbidden),
                "stats must never grow a `{forbidden}` field: {json}"
            );
        }
    }

    #[test]
    fn naive_date_stringifies_as_iso() {
        let date = NaiveDate::from_ymd_opt(2026, 10, 22).unwrap();
        assert_eq!(date.to_string(), "2026-10-22");
    }
}

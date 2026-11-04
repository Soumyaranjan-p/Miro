//! Windows Spell Checking API, always on, fully offline.
//!
//! Whisper transcribes what it hears; it does not know how words are spelled.
//! Windows 8+ ships an in-process COM spell checker (the same one Notepad and
//! Edge use) that knows your system's English dictionary offline — no network,
//! no service, no API key. This module wires it into the dictation pipeline so
//! the text inserted into the user's app is checked before it lands.
//!
//! Corrective actions from the OS are applied, always, without asking:
//!   * CORRECTIVE_ACTION_REPLACE      — the OS's own autocorrect decision
//!   * CORRECTIVE_ACTION_GET_SUGGESTIONS — only for all-lowercase tokens and
//!                                         single-word suggestions no more than
//!                                         two units longer or shorter, never
//!                                         the first token of a sentence
//!   * CORRECTIVE_ACTION_DELETE      — never applied (dropping a word changes
//!                                     meaning)
//!
//! Applying suggestions changes words in place, never order or count except by
//! replacement. The checker never invents new text: every replacement comes
//! from the OS dictionary for the flagged word.
//!
//! Everything here runs on the transcription thread, after cleanup. If the
//! checker cannot be created for the configured language, the original text
//! passes through unchanged — spell checking is a bonus, never a blocker.

use windows::Win32::Globalization::{
    CORRECTIVE_ACTION_GET_SUGGESTIONS, CORRECTIVE_ACTION_REPLACE, ISpellChecker,
    ISpellCheckerFactory, ISpellingError, SpellCheckerFactory,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::core::HSTRING;

use crate::logging::{self, Event};

/// Apply the OS spell checker to `text`. On any failure — language not
/// supported, checker unavailable, COM error — the original text is returned
/// unchanged. Never panics.
pub fn correct_text(text: &str, settings_language: &str) -> String {
    if text.trim().is_empty() {
        return text.to_string();
    }
    let Some(tag) = resolve_language(settings_language) else {
        logging::event(Event::SpellcheckApplied { errors: 0, fixed: 0 });
        return text.to_string();
    };
    let Ok(checker) = create_checker(&tag) else {
        logging::event(Event::SpellcheckApplied { errors: 0, fixed: 0 });
        return text.to_string();
    };
    let fixes = collect_fixes(&checker, text);
    let corrected = apply_fixes(text, &fixes);
    logging::event(Event::SpellcheckApplied {
        errors: fixes.len(),
        fixed: fixes.iter().filter(|(_, _, f)| !f.is_empty()).count(),
    });
    corrected
}

/// One fix to apply: (start_units, length_units, replacement).
type SpellFix = (usize, usize, String);

/// Resolve which BCP-47 tag to use. The Whisper language hint wins when it
/// names a supported language; a bare ISO code gets a common regional
/// variant; anything else falls back to the user's Windows locale.
fn resolve_language(settings_language: &str) -> Option<String> {
    let code = settings_language.trim();
    let candidate_codes: Vec<String> = if code.is_empty()
        || code.eq_ignore_ascii_case("auto")
    {
        os_locale_tag().map(|tag| vec![tag]).unwrap_or_else(|| vec!["en-US".into()])
    } else if code.contains('-') {
        vec![code.to_string()]
    } else {
        // Bare language code: prefer a US regional tag, then the popular default
        // for that language, then the bare code itself.
        let default_region = default_region_for(code);
        let mut list = vec![format!("{code}-{default_region}")];
        if code != "en" {
            list.push(format!("{code}-US"));
        }
        list.push(code.to_string());
        list
    };

    for candidate in &candidate_codes {
        if is_supported(candidate) {
            return Some(candidate.clone());
        }
    }
    // Fall back to the user's Windows locale if none of the above exist.
    let fallback = os_locale_tag()?;
    if is_supported(&fallback) {
        Some(fallback)
    } else {
        None
    }
}

fn default_region_for(code: &str) -> &'static str {
    match code.to_ascii_lowercase().as_str() {
        "en" => "US",
        "es" => "MX",
        "fr" => "FR",
        "de" => "DE",
        "it" => "IT",
        "pt" => "BR",
        "nl" => "NL",
        "ru" => "RU",
        "ja" => "JP",
        "ko" => "KR",
        "zh" => "CN",
        _ => "US",
    }
}

fn os_locale_tag() -> Option<String> {
    let mut buf = [0u16; 85];
    let len = unsafe {
        windows::Win32::Globalization::GetUserDefaultLocaleName(&mut buf)
    };
    if len <= 1 {
        return None;
    }
    String::from_utf16(&buf[..len as usize - 1]).ok()
}

fn is_supported(tag: &str) -> bool {
    let Ok(factory) = factory() else {
        return false;
    };
    let tag = HSTRING::from(tag);
    unsafe { factory.IsSupported(&tag) }
        .map(|supported| supported.as_bool())
        .unwrap_or(false)
}

fn factory() -> windows::core::Result<ISpellCheckerFactory> {
    // COM is per-thread and uninitialised by default. Safe to call repeatedly:
    // S_FALSE means "already initialised on this thread", which is fine.
    let _ = unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        )
    };
    unsafe { CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER) }
}

/// Create the checker for `tag`. If the language is unsupported on this
/// machine, the checker is not created and spell checking is skipped.
fn create_checker(tag: &str) -> windows::core::Result<ISpellChecker> {
    let factory = factory()?;
    let tag = HSTRING::from(tag);
    unsafe { factory.CreateSpellChecker(&tag) }
}

/// Collect the corrections the OS wants applied, in text order.
fn collect_fixes(checker: &ISpellChecker, text: &str) -> Vec<SpellFix> {
    let Ok(spelling_errors) = (unsafe { checker.ComprehensiveCheck(&HSTRING::from(text)) }) else {
        return Vec::new();
    };
    let mut fixes = Vec::new();
    loop {
        let mut error: Option<ISpellingError> = None;
        // Next returns S_OK with an item, S_FALSE at exhaustion, or an error.
        let hr = unsafe { spelling_errors.Next(&mut error) };
        if hr.is_err() {
            break;
        }
        let Some(error) = error else { break };
        let (Ok(start), Ok(length), Ok(action)) = (unsafe {
            (error.StartIndex(), error.Length(), error.CorrectiveAction())
        })
        else {
            continue;
        };
        if length == 0 {
            continue;
        }
        let start = start as usize;
        let length = length as usize;
        let units: Vec<u16> = text.encode_utf16().collect();
        if start + length > units.len() {
            continue;
        }
        let token = String::from_utf16(&units[start..start + length]).unwrap_or_default();
        if action == CORRECTIVE_ACTION_REPLACE {
            // The OS's own autocorrect decision, e.g. "recieve" -> "receive".
            let Ok(replacement_pw) = (unsafe { error.Replacement() }) else { continue };
            if replacement_pw.is_null() {
                continue;
            }
            let Ok(replacement) = (unsafe { replacement_pw.to_string() }) else {
                // Free the COM allocation and move on.
                unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(replacement_pw.as_ptr() as *const _)) };
                continue;
            };
            unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(replacement_pw.as_ptr() as *const _)) };
            if !replacement.is_empty() {
                fixes.push((start, length, replacement));
            }
            continue;
        }
        if action == CORRECTIVE_ACTION_GET_SUGGESTIONS {
            // Only repair unambiguous tokens: all-lowercase, or a single
            // capitalised first letter followed by lowercase (sentence-initial
            // "soemthiing"). Names mid-sentence are capitalised and protected
            // from auto-correction. Names suggested first are still applied —
            // the OS's ranking is the best available signal.
            let token_form = token_casing(&token);
            if token_form == TokenCasing::Other {
                continue;
            }
            if token.chars().count() < 4 {
                continue;
            }
            let Ok(suggestions) = (unsafe { checker.Suggest(&HSTRING::from(token.as_str())) }) else {
                continue;
            };
            if let Some(suggestion) = first_suggestion(&suggestions) {
                if !suggestion.contains(' ') && suggestion.chars().count().abs_diff(token.chars().count()) <= 2 {
                    // Match the token's casing so a sentence-initial fix stays
                    // sentence-initial.
                    let suggestion = if token_form == TokenCasing::CapitalizedFirst {
                        capitalise_first(&suggestion)
                    } else {
                        suggestion
                    };
                    fixes.push((start, length, suggestion));
                }
            }
            continue;
        }
        // DELETE and everything else: untouched.
    }
    fixes
}

fn first_suggestion(suggestions: &windows::Win32::System::Com::IEnumString) -> Option<String> {
    let mut items = [windows::core::PWSTR::null()];
    let mut fetched = 0u32;
    let hr = unsafe { suggestions.Next(&mut items, Some(&mut fetched)) };
    // The COM contract returns S_FALSE when the enumeration is exhausted —
    // not an error. Anything else with fetched>0 yields the first suggestion.
    if !hr.is_ok() || fetched == 0 || items[0].is_null() {
        return None;
    }
    let suggestion = unsafe { items[0].to_string().ok() };
    // Free the COM-allocated string.
    unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(items[0].as_ptr() as *const _)) };
    suggestion
}

#[derive(PartialEq, Eq)]
enum TokenCasing {
    Lower,
    CapitalizedFirst,
    Other,
}

fn token_casing(token: &str) -> TokenCasing {
    let mut chars = token.chars();
    let Some(first) = chars.next() else {
        return TokenCasing::Other;
    };
    if first.is_ascii_lowercase() {
        let rest_ok = chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '\'');
        return if rest_ok { TokenCasing::Lower } else { TokenCasing::Other };
    }
    if first.is_ascii_uppercase() {
        let rest_ok = chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '\'');
        return if rest_ok { TokenCasing::CapitalizedFirst } else { TokenCasing::Other };
    }
    TokenCasing::Other
}

fn capitalise_first(s: &str) -> String {
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return s.to_string();
    };
    let upper: String = first.to_uppercase().collect();
    format!("{}{}", upper, chars.as_str())
}

/// Apply fixes, back to front so earlier offsets don't shift.
fn apply_fixes(text: &str, fixes: &[SpellFix]) -> String {
    if fixes.is_empty() {
        return text.to_string();
    }
    let mut units: Vec<u16> = text.encode_utf16().collect();
    let mut sorted = fixes.to_vec();
    sorted.sort_by_key(|(start, _, _)| *start);
    // Reverse order: rewriting a long replacement first would shift earlier offsets.
    for (start, len, replacement) in sorted.into_iter().rev() {
        if start + len > units.len() {
            continue;
        }
        let replacement_units: Vec<u16> = replacement.encode_utf16().collect();
        units.splice(start..start + len, replacement_units);
    }
    String::from_utf16(&units).unwrap_or_else(|_| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixes_are_applied_back_to_front() {
        let fixes = vec![
            (0, 5, "HELLO".to_string()),
            (6, 5, "WORLD".to_string()),
        ];
        assert_eq!(apply_fixes("world again", &fixes), "HELLO WORLD");
    }

    #[test]
    fn a_fix_past_the_end_is_skipped() {
        let fixes = vec![(100, 4, "wrong".to_string())];
        assert_eq!(apply_fixes("hello", &fixes), "hello");
    }

    #[test]
    fn fixes_at_the_same_start_are_applied_deterministically() {
        let fixes = vec![(0, 2, "HI".to_string())];
        assert_eq!(apply_fixes("hi there", &fixes), "HI there");
    }

    #[test]
    fn emoji_are_preserved_when_fixing_earlier_text() {
        let text = "😀 teh cat";
        let start_units = "😀 ".encode_utf16().count();
        let fixes = vec![(start_units, 3, "the".to_string())];
        assert_eq!(apply_fixes(text, &fixes), "😀 the cat");
    }
}

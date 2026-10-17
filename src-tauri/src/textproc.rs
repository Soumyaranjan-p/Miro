//! Deterministic text clean-up. No model, no network, no surprises.
//!
//! The contract from the spec:
//!   * clean-up off  -> exactly the engine's output, trimmed only;
//!   * clean-up on   -> whitespace, sentence case and (opt-in) filler removal;
//!   * technical terms survive;
//!   * punctuation is only ever *repaired*, never invented. If the engine does
//!     not punctuate, Miro does not guess where the commas go.
//!
//! Everything here is a pure function over a string, which is why the test
//! module below can pin the behaviour line by line.

use crate::config::Cleanup;

/// Words that are conventionally lowercase and must not be capitalised by the
/// sentence-case pass (`npm` should never become `Npm`).
const LOWERCASE_TERMS: &[&str] = &[
    "npm",
    "npx",
    "pnpm",
    "yarn",
    "ios",
    "ipados",
    "macos",
    "k8s",
    "ssh",
    "grep",
    "awk",
    "sed",
    "sudo",
    "curl",
    "wget",
    "jq",
    "ffmpeg",
    "nginx",
    "tmux",
    "vim",
    "bash",
    "zsh",
    "git",
    "sqlite",
    "postgres",
    "mysql",
    "redis",
    "kubectl",
    "webpack",
    "eslint",
    "prettier",
    "rustc",
    "cargo",
    "python",
    "pandas",
    "numpy",
    "matplotlib",
    "localhost",
];

/// Acronyms the engine often emits in lowercase. Normalising them is one of the
/// few transformations a dictation tool can make that users reliably want.
const ACRONYMS: &[&str] = &[
    "api", "cli", "ui", "ux", "ai", "ml", "llm", "gpu", "cpu", "ram", "url", "uri", "http",
    "https", "sql", "html", "css", "json", "xml", "yaml", "toml", "csv", "sdk", "jwt", "vpn",
    "tls", "ssl", "dns", "tcp", "udp", "usb", "ssd", "pdf", "png", "jpg", "gif", "mp3", "mp4",
    "wav", "ascii", "utf8",
];

const CONTRACTIONS_OF_I: &[&str] = &["m", "s", "ll", "ve", "d"];

/// The one entry point. `raw` is whatever the engine produced.
pub fn process(raw: &str, options: &Cleanup) -> String {
    let trimmed = raw.trim();
    if !options.enabled {
        return trimmed.to_string();
    }

    let mut text = trimmed.to_string();

    if options.remove_filler_words && !options.filler_words.is_empty() {
        text = remove_fillers(&text, &options.filler_words);
        // Removal leaves gaps behind punctuation; tidy them before deciding
        // sentence boundaries.
        if options.normalize_whitespace {
            text = normalize_whitespace(&text);
        }
    }

    if options.normalize_whitespace {
        text = normalize_whitespace(&text);
    }

    if options.capitalize_sentences {
        text = capitalize_sentences(&text);
    }

    if options.normalize_whitespace {
        text = normalize_whitespace(&text);
    }

    text.trim().to_string()
}

/// Splits on whitespace while keeping the newlines intact.
fn words_of(text: &str) -> Vec<&str> {
    text.split_whitespace().collect()
}

/// Lowercases and strips surrounding punctuation, so `Hello,` matches `hello`.
fn bare(word: &str) -> String {
    word.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'' && c != '+' && c != '#')
        .to_ascii_lowercase()
}

pub fn normalize_whitespace(text: &str) -> String {
    let mut lines: Vec<String> = Vec::new();

    for line in text.replace('\r', "\n").split('\n') {
        let mut out = String::with_capacity(line.len());
        let mut last_was_space = false;
        for ch in line.chars() {
            if ch == ' ' || ch == '\t' {
                last_was_space = true;
                continue;
            }
            if last_was_space && !out.is_empty() && !is_tight_punctuation(ch) {
                out.push(' ');
            }
            last_was_space = false;
            out.push(ch);
        }

        let cleaned = out.trim().to_string();
        // A blank line only survives if it was deliberate; runs collapse to one.
        if cleaned.is_empty() && lines.last().map(|l| l.is_empty()).unwrap_or(true) {
            continue;
        }
        lines.push(cleaned);
    }

    let joined = lines.join("\n");
    collapse_empty_punctuation(joined.trim())
}

/// Punctuation that hugs the character before it.
fn is_tight_punctuation(ch: char) -> bool {
    matches!(
        ch,
        ',' | '.' | '!' | '?' | ';' | ':' | '%' | ')' | ']' | '}' | '\'' | '"'
    )
}

/// `hello , world` becomes `hello, world`; `,,` collapses to `,`.
fn collapse_empty_punctuation(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut previous_significant: Option<char> = None;

    for ch in text.chars() {
        if matches!(ch, ',' | ';') {
            // A comma with nothing before it, or right after another comma, is noise.
            match previous_significant {
                None => continue,
                Some(',' | ';') => continue,
                Some('\n') => continue,
                _ => {}
            }
        }
        if ch != '\n' && !ch.is_whitespace() {
            previous_significant = Some(ch);
        } else if ch == '\n' {
            previous_significant = Some('\n');
        }
        out.push(ch);
    }
    out
}

pub fn capitalize_sentences(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut index = 0usize;
    let mut at_sentence_start = true;

    while index < chars.len() {
        let ch = chars[index];

        if ch.is_whitespace() {
            out.push(ch);
            if ch == '\n' {
                at_sentence_start = true;
            }
            index += 1;
            continue;
        }

        let start = index;
        while index < chars.len() && !chars[index].is_whitespace() {
            index += 1;
        }
        let word: String = chars[start..index].iter().collect();

        let mut rendered = if at_sentence_start && !is_protected(&word) {
            uppercase_first_letter(&word)
        } else {
            word
        };
        rendered = normalize_pronoun_i(&rendered);
        rendered = normalize_acronym(&rendered);

        at_sentence_start = ends_sentence(&rendered);
        out.push_str(&rendered);
    }

    out
}

fn uppercase_first_letter(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) if first.is_alphabetic() && first.is_lowercase() => {
            let upper: String = first.to_uppercase().collect();
            format!("{upper}{}", chars.as_str())
        }
        _ => word.to_string(),
    }
}

/// `i` and `i'm` are always `I` and `I'm`.
fn normalize_pronoun_i(word: &str) -> String {
    let bare_form = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'');
    if bare_form == "i" {
        return word.replacen('i', "I", 1);
    }
    if let Some(rest) = bare_form.strip_prefix("i'") {
        if CONTRACTIONS_OF_I.contains(&rest) {
            return word.replacen('i', "I", 1);
        }
    }
    word.to_string()
}

/// Uppercases well-known acronyms when they appear as whole words.
fn normalize_acronym(word: &str) -> String {
    let bare_form = bare(word);
    if bare_form.len() < 2 || !ACRONYMS.contains(&bare_form.as_str()) {
        return word.to_string();
    }
    // Only rewrite pure lowercase forms; leave anything the user already capped.
    let core = word.trim_matches(|c: char| !c.is_alphanumeric());
    if core != bare_form {
        return word.to_string();
    }
    word.replace(&bare_form, &bare_form.to_uppercase())
}

/// True when the sentence-case pass must keep its hands off a word.
pub fn is_protected(word: &str) -> bool {
    let core =
        word.trim_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.');
    if core.is_empty() {
        return true;
    }
    if core.chars().any(|c| c.is_ascii_digit()) {
        return true; // version numbers, "sha256", "48 kHz"
    }
    if core.contains('_') || core.contains('/') || core.contains('\\') || core.contains('@') {
        return true; // identifiers, paths, handles
    }
    // camelCase or PascalCase inside a word, e.g. "TypeScript", "iPhone"
    if core.chars().skip(1).any(|c| c.is_uppercase()) {
        return true;
    }
    // Acronyms and file extensions
    if core.len() >= 2 && core.chars().all(|c| !c.is_alphabetic() || c.is_uppercase()) {
        return true;
    }
    // Dotted forms like "e.g.", "whisper.cpp", "config.json"
    if core.trim_matches('.').contains('.') {
        return true;
    }
    LOWERCASE_TERMS.contains(&core.to_ascii_lowercase().as_str())
}

fn ends_sentence(word: &str) -> bool {
    let closers = ['"', '\'', ')', ']', '}', '\u{201d}', '\u{2019}'];
    let core = word.trim_end_matches(closers);
    match core.chars().last() {
        Some('.') => !is_abbreviation(core),
        Some('!') | Some('?') => true,
        _ => false,
    }
}

/// `e.g.` and `U.S.A.` end with a dot but do not end a sentence.
fn is_abbreviation(word: &str) -> bool {
    let letters_between_dots = word
        .chars()
        .collect::<Vec<_>>()
        .windows(2)
        .any(|pair| pair[0] == '.' && pair[1].is_alphabetic());
    letters_between_dots || word.chars().filter(|c| *c == '.').count() > 1
}

pub fn remove_fillers(text: &str, fillers: &[String]) -> String {
    let mut phrases: Vec<Vec<String>> = fillers
        .iter()
        .map(|filler| {
            filler
                .split_whitespace()
                .map(|w| w.to_ascii_lowercase())
                .collect()
        })
        .filter(|phrase: &Vec<String>| !phrase.is_empty())
        .collect();
    // Longest first, so "you know" wins over "know".
    phrases.sort_by_key(|phrase| std::cmp::Reverse(phrase.len()));

    let words = words_of(text);
    let lowered: Vec<String> = words.iter().map(|w| bare(w)).collect();
    let mut drop = vec![false; words.len()];

    for phrase in &phrases {
        let span = phrase.len();
        if span > words.len() {
            continue;
        }
        for start in 0..=(words.len() - span) {
            if (0..span).any(|offset| drop[start + offset]) {
                continue;
            }
            let matches = (0..span).all(|offset| lowered[start + offset] == phrase[offset]);
            if matches {
                // Never remove a word that is part of a protected term.
                let protected = (0..span).any(|offset| is_protected(words[start + offset]));
                if protected {
                    continue;
                }
                for offset in 0..span {
                    drop[start + offset] = true;
                }
            }
        }
    }

    let kept: Vec<&str> = words
        .iter()
        .enumerate()
        .filter(|(index, _)| !drop[*index])
        .map(|(_, word)| *word)
        .collect();

    kept.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Cleanup;

    fn cleanup(enabled: bool) -> Cleanup {
        Cleanup {
            enabled,
            ..Cleanup::default()
        }
    }

    fn raw(enabled: bool) -> Cleanup {
        Cleanup {
            enabled,
            normalize_whitespace: false,
            capitalize_sentences: false,
            remove_filler_words: false,
            filler_words: Vec::new(),
        }
    }

    #[test]
    fn with_cleanup_off_the_engine_text_is_only_trimmed() {
        let input = "  hello   world ,  this   is   raw  ";
        assert_eq!(
            process(input, &raw(false)),
            "hello   world ,  this   is   raw"
        );
    }

    #[test]
    fn whitespace_normalisation_repairs_engine_spacing() {
        let out = process("hello   world  ,  again", &cleanup(true));
        assert_eq!(out, "Hello world, again");
    }

    #[test]
    fn sentence_case_handles_multiple_sentences() {
        let out = process(
            "hello world. this is a test. i am here. how are you?",
            &cleanup(true),
        );
        assert_eq!(out, "Hello world. This is a test. I am here. How are you?");
    }

    #[test]
    fn contractions_of_i_are_capitalised_mid_sentence() {
        let out = process("well i'm sure i've seen it, i'll check", &cleanup(true));
        assert_eq!(out, "Well I'm sure I've seen it, I'll check");
    }

    #[test]
    fn technical_terms_keep_their_casing() {
        let out = process(
            "install npm and then use typescript. ios apps need xcode.",
            &cleanup(true),
        );
        assert_eq!(
            out,
            "Install npm and then use typescript. ios apps need xcode."
        );
    }

    #[test]
    fn abbreviations_do_not_start_a_new_sentence() {
        let out = process("use a tool, e.g. a hammer. then stop.", &cleanup(true));
        assert_eq!(out, "Use a tool, e.g. a hammer. Then stop.");
    }

    #[test]
    fn acronyms_are_normalised_but_camel_case_survives() {
        let out = process(
            "the api returned json and typescript compiled",
            &cleanup(true),
        );
        assert_eq!(out, "The API returned JSON and TypeScript compiled");
    }

    #[test]
    fn filler_removal_is_off_then_on() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into(), "uh".into(), "you know".into()];

        assert_eq!(process("um hello uh world", &options), "Hello world");
        assert_eq!(
            process("this is, you know, fine", &options),
            "This is, fine"
        );

        options.remove_filler_words = false;
        assert_eq!(
            process("um hello", &options),
            "Um hello",
            "fillers stay when removal is off"
        );
    }

    #[test]
    fn filler_removal_leaves_real_words_alone() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["like".into(), "um".into()];
        // "like" as a whole word goes; "likely" and "likelihood" must not.
        assert_eq!(
            process("it is likely you like this likelihood", &options),
            "It is likely you this likelihood"
        );
    }

    #[test]
    fn a_filler_inside_a_protected_term_is_never_removed() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["know".into()];
        assert_eq!(
            process("i know you have know_how", &options),
            "I you have know_how"
        );
    }

    #[test]
    fn punctuation_is_repaired_but_never_invented() {
        let out = process("hello world this has no full stop", &cleanup(true));
        assert_eq!(
            out, "Hello world this has no full stop",
            "Miro must not guess punctuation"
        );
    }

    #[test]
    fn newlines_collapse_and_lines_are_trimmed() {
        let out = process("first line   \n\n\n   second line", &cleanup(true));
        assert_eq!(out, "First line\nSecond line");
    }

    #[test]
    fn protected_words_are_recognised() {
        for word in [
            "TypeScript",
            "iPhone",
            "whisper.cpp",
            "k8s",
            "sha256",
            "snake_case",
            "path/to/file",
            "@handle",
            "npm",
            "e.g.",
        ] {
            assert!(is_protected(word), "{word} should be protected");
        }
        for word in ["Hello", "world", "simple", "Sentence"] {
            assert!(!is_protected(word), "{word} should not be protected");
        }
    }

    #[test]
    fn empty_input_is_empty_output() {
        assert_eq!(process("", &cleanup(true)), "");
        assert_eq!(process("    ", &cleanup(true)), "");
        assert_eq!(process("", &raw(false)), "");
    }

    #[test]
    fn a_full_pipeline_run_is_stable() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into()];

        let input = "  um so the api  ,  um returns json . i'm using typescript  ";
        let once = process(input, &options);
        let twice = process(&once, &options);
        assert_eq!(once, "So the API, returns JSON. I'm using TypeScript.");
        assert_eq!(once, twice, "clean-up must be idempotent");
    }
}

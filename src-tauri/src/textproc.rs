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

/// Repeats that are grammatical or emphatic rather than stutters. "had had" is
/// the past perfect, "that that" is a demonstrative followed by a relative,
/// and the rest are conventional doubled words. Collapsing these would change
/// meaning, so they are left alone.
const ALLOWED_REPEATS: &[&str] = &["very", "had", "that", "no", "so", "bye", "really"];

/// Fillers that are only removable in a filler context (comma-delimited or at
/// a clause boundary). "like" doubles as a verb/preposition, and "you know"/
/// "I mean" carry meaning when not set off by commas, so they are gated.
const CONTEXTUAL_FILLERS: &[&str] = &["like", "you know", "i mean"];

/// Brand names the engine emits in plain lowercase but that have a canonical
/// casing nearly everyone wants preserved (`typescript` becomes `TypeScript`).
const BRAND_TERMS: &[(&str, &str)] = &[
    ("typescript", "TypeScript"),
    ("javascript", "JavaScript"),
    ("github", "GitHub"),
    ("gitlab", "GitLab"),
    ("nodejs", "Node.js"),
    ("vscode", "VS Code"),
];

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

    text = finish_terminal_punctuation(&text);

    text.trim().to_string()
}

/// Lowercases and strips surrounding punctuation, so `Hello,` matches `hello`.
fn bare(word: &str) -> String {
    word.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'' && c != '+' && c != '#')
        .to_ascii_lowercase()
}

pub fn normalize_whitespace(text: &str) -> String {
    // A single protected token has no internal whitespace to repair; leaving it
    // untouched keeps URLs, emails, handles and paths byte-for-byte.
    let trimmed = text.trim();
    if !trimmed.contains(char::is_whitespace) && is_protected(trimmed) {
        return trimmed.to_string();
    }

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
        // Dictation produces prose, not layout: every line break collapses and
        // empty lines vanish, so `a\n\n\nb` becomes `a\nb`.
        if cleaned.is_empty() {
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
    let trimmed = text.trim();
    if !trimmed.contains(char::is_whitespace) && is_protected(trimmed) {
        return text.to_string();
    }

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
        rendered = normalize_brand(&rendered);

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

/// Puts a brand name into its canonical casing when it appears as a pure
/// lowercase whole word: `typescript` -> `TypeScript`.
fn normalize_brand(word: &str) -> String {
    let bare_form = bare(word);
    let Some((lower, display)) = BRAND_TERMS.iter().find(|(lower, _)| bare_form == *lower) else {
        return word.to_string();
    };
    // Only rewrite the bare form; leave anything the user already spaced or
    // capped differently.
    let core = word.trim_matches(|c: char| !c.is_alphanumeric());
    if core != *lower {
        return word.to_string();
    }
    word.replace(lower, display)
}

/// Closes an unterminated final sentence, but only when the engine actually
/// produced sentence punctuation somewhere in the clip: completing a sentence
/// it started is repair, inventing punctuation in spoken text is not.
fn finish_terminal_punctuation(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return text.to_string();
    }
    // Never append punctuation to a lone protected token (URL, email, handle, path).
    if !trimmed.contains(char::is_whitespace) && is_protected(trimmed) {
        return text.to_string();
    }

    let mut chars = trimmed.chars();
    let Some(last_char) = chars.next_back() else {
        return text.to_string();
    };
    // Already closed, or the user is mid-list: a clause separator is theirs,
    // not a dropped full stop.
    if matches!(last_char, '.' | '!' | '?' | ',' | ';' | ':') || trimmed.is_empty() {
        return text.to_string();
    }
    let last_word = trimmed.split_whitespace().next_back().unwrap_or("");
    // A trailing dot that belongs to "e.g." is punctuation, not an opener.
    if last_word.ends_with('.') {
        return text.to_string();
    }
    if text.contains(['.', '!', '?']) {
        format!("{text}.")
    } else {
        text.to_string()
    }
}

/// True when the sentence-case pass must keep its hands off a word.
pub fn is_protected(word: &str) -> bool {
    // `@` survives the trim: for a handle it IS the word, and stripping it
    // first would leave a bare lowercase term that looks unprotected.
    let core = word.trim_matches(|c: char| {
        !c.is_alphanumeric() && c != '_' && c != '-' && c != '.' && c != '@'
    });
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
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return String::new();
    }

    // Prepare and sort phrases longest first, as before.
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
    phrases.sort_by_key(|phrase| std::cmp::Reverse(phrase.len()));

    let n = words.len();
    let lowered: Vec<String> = words.iter().map(|w| bare(w)).collect();

    // drop[i] == true means words[i] is removed.
    let mut drop = vec![false; n];

    // Contextual phrases ("like", "you know", "i mean") are only removable in a
    // filler context. Everything else in the list is an unambiguous filler.
    fn is_contextual(phrase: &[String]) -> bool {
        let joined = phrase.join(" ");
        CONTEXTUAL_FILLERS.contains(&joined.as_str())
    }

    // Iterative fixpoint: a contextual filler may become removable because the
    // word before it was just removed as another filler.
    let mut changed = true;
    while changed {
        changed = false;
        for phrase in &phrases {
            let span = phrase.len();
            if span == 0 || span > n {
                continue;
            }
            for start in 0..=(n - span) {
                if (0..span).any(|o| drop[start + o]) {
                    continue;
                }
                let matches = (0..span).all(|o| lowered[start + o] == phrase[o]);
                if !matches {
                    continue;
                }
                // Protected tokens are never removed.
                if (0..span).any(|o| is_protected(words[start + o])) {
                    continue;
                }
                let contextual = is_contextual(phrase);
                let mut removable = !contextual;
                if contextual {
                    let comma_before =
                        start > 0 && words[start - 1].trim_end().ends_with(',');
                    let comma_after = words[start + span - 1].trim_end().ends_with(',');
                    let at_end = start + span >= n
                        || words[start + span]
                            .chars()
                            .next()
                            .map(|c| matches!(c, '.' | '!' | '?' | ',' | ';' | ':'))
                            .unwrap_or(true);
                    let after_filler = start > 0 && drop[start - 1];
                    let ends_sentence_punct = words[start + span - 1]
                        .trim_end()
                        .chars()
                        .last()
                        .map(|c| matches!(c, '.' | '!' | '?'))
                        .unwrap_or(false);
                    if (comma_before && comma_after)
                        || (comma_before && at_end)
                        || (comma_before && ends_sentence_punct)
                        || after_filler
                    {
                        removable = true;
                    }
                }
                if !removable {
                    continue;
                }
                for o in 0..span {
                    if !drop[start + o] {
                        changed = true;
                    }
                    drop[start + o] = true;
                }
            }
        }
    }

    // Stutter collapse: drop later occurrences of an immediately repeated word.
    let allow_repeat = |w: &str| ALLOWED_REPEATS.contains(&w);
    let clean_token = |w: &str| {
        !w.chars().any(|c| matches!(c, '.' | '!' | '?' | ',' | ';' | ':' | '/' | '\\' | '@'))
            && !is_protected(w)
            && !w.chars().any(|c| c.is_ascii_digit())
    };
    let mut kept: Vec<usize> = (0..n).filter(|&idx| !drop[idx]).collect();
    let mut i = 0;
    while i < kept.len() {
        let idx = kept[i];
        let wb = lowered[idx].clone();
        if !allow_repeat(&wb) && clean_token(words[idx]) {
            let mut j = i + 1;
            while j < kept.len() {
                let nidx = kept[j];
                if lowered[nidx] != wb {
                    break;
                }
                if !clean_token(words[nidx]) {
                    break;
                }
                drop[nidx] = true;
                j += 1;
            }
            kept = (0..n).filter(|&x| !drop[x]).collect();
            // advance past the run we just collapsed
            i += 1;
            while i < kept.len() && kept[i] <= idx {
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    let kept_words: Vec<&str> = (0..n).filter(|&idx| !drop[idx]).map(|idx| words[idx]).collect();
    kept_words.join(" ")
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
        // npm/ios keep their conventional lowercase, but "typescript" gets
        // its canonical brand casing (BRAND_TERMS), same as in the other
        // pinned cases below - the engine emits it lowercase and every
        // consumer wants TypeScript.
        assert_eq!(
            out,
            "Install npm and then use TypeScript. ios apps need xcode."
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
        // "like" as a whole word goes only when it is a clear filler; "like
        // this" is a kept, non-filler use, and "likely"/"likelihood" are
        // never touched.
        assert_eq!(
            process("it is likely you like this likelihood", &options),
            "It is likely you like this likelihood"
        );
        // Comma-delimited "like" is removed while "likely"/"likelihood" stay.
        assert_eq!(
            process("it is, like, likely you will like this likelihood", &options),
            "It is, likely you will like this likelihood"
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

    // --- GAP 1: contextual "like" ---
    #[test]
    fn like_is_kept_in_real_uses() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["like".into(), "um".into()];
        for input in [
            "I like it",
            "looks like rain",
            "would you like tea",
            "like a boss",
            "like this",
            "feels like rain",
        ] {
            let out = process(input, &options);
            assert_eq!(out, capitalize_sentences(input), "kept: {input} -> {out}");
        }
    }

    #[test]
    fn like_is_removed_when_comma_delimited() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["like".into(), "um".into()];
        assert_eq!(process("it was, like, huge", &options), "It was, huge");
    }

    // --- GAP 1: "you know" / "I mean" ---
    #[test]
    fn you_know_and_i_mean_contextual() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["you know".into(), "i mean".into(), "um".into()];
        assert_eq!(process("It was, you know, fine", &options), "It was, fine");
        assert_eq!(process("It was, I mean, fine", &options), "It was, fine");
        // kept when carrying meaning
        assert_eq!(process("Do you know him", &options), "Do you know him");
        assert_eq!(process("I mean it", &options), "I mean it");
    }

    // --- GAP 1: unambiguous fillers ---
    #[test]
    fn unambiguous_fillers_removed_anywhere() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into(), "uh".into(), "er".into(), "erm".into(),
            "hmm".into(), "ah".into(), "umm".into(), "uhh".into()];
        // start, middle, end
        assert_eq!(process("um hello world", &options), "Hello world");
        assert_eq!(process("hello um world", &options), "Hello world");
        assert_eq!(process("hello world um", &options), "Hello world");
        // substrings untouched
        assert_eq!(process("umbrella error human uhura", &options), "Umbrella error human uhura");
    }

    // --- GAP 2: stutter collapse ---
    #[test]
    fn stutter_collapsed() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into()];
        assert_eq!(process("I I think", &options), "I think");
        assert_eq!(process("the the cat", &options), "The cat");
        assert_eq!(process("we we we should", &options), "We should");
    }

    #[test]
    fn stutter_kept_intentional() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into()];
        assert_eq!(process("very very good", &options), "Very very good");
        assert_eq!(process("had had enough", &options), "Had had enough");
        assert_eq!(process("that that is", &options), "That that is");
        assert_eq!(process("no no way", &options), "No no way");
        assert_eq!(process("so so true", &options), "So so true");
        assert_eq!(process("bye bye", &options), "Bye bye");
        assert_eq!(process("really really good", &options), "Really really good");
        assert_eq!(process("Go. Go now", &options), "Go. Go now.");
        assert_eq!(process("10 10", &options), "10 10");
    }

    // --- GAP 3: protected tokens byte-for-byte ---
    #[test]
    fn protected_tokens_survive_pipeline() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into(), "like".into()];
        for tok in ["github.com/foo/bar", "a.b@c.com", "@someone",
                    "C:\\Users\\me\\file.txt", "snake_case_name"] {
            assert_eq!(process(tok, &options), tok, "protected: {tok}");
        }
    }

    // --- only fillers / empty ---
    #[test]
    fn only_fillers_returns_empty() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["um".into(), "uh".into()];
        assert_eq!(process("um uh um", &options), "");
        assert_eq!(process("", &options), "");
        assert_eq!(process("   ", &options), "");
    }

    // --- idempotence ---
    #[test]
    fn cleanup_is_idempotent_for_new_cases() {
        let mut options = cleanup(true);
        options.remove_filler_words = true;
        options.filler_words = vec!["like".into(), "um".into(), "you know".into()];
        let cases = [
            "it was, like, huge",
            "I like it",
            "I I think we should go",
            "very very good",
            "Go. Go now",
            "github.com/foo/bar",
            "um so we go",
        ];
        for c in cases {
            let once = process(c, &options);
            let twice = process(&once, &options);
            assert_eq!(once, twice, "idempotent: {c}");
        }
    }

    // --- toggles ---
    #[test]
    fn toggles_off_leave_output_unchanged() {
        let raw_in = "  um I I think, like, we go  ";
        // master toggle off
        let mut off = cleanup(false);
        off.remove_filler_words = true;
        off.filler_words = vec!["like".into(), "um".into()];
        assert_eq!(process(raw_in, &off), raw_in.trim());

        // filler toggle off
        let mut filler_off = cleanup(true);
        filler_off.remove_filler_words = false;
        filler_off.filler_words = vec!["like".into(), "um".into()];
        // with filler off, "um"/"like" stay; spacing/case still apply
        let out = process(raw_in, &filler_off);
        assert!(out.contains("um") || out.contains("Um"), "filler stayed: {out}");
    }
}

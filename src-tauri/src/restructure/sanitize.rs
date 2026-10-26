//! Turns a model reply into the prompt a user can review.
//!
//! The model is asked for plain text only, but models add preambles, fences and
//! closing offers anyway. This module removes that packaging without rewriting
//! the prompt itself: every constraint, name and number stays exactly as the
//! model produced it.

const PREAMBLE_PREFIXES: &[&str] = &[
    "here is",
    "here's",
    "here’s",
    "below is",
    "the prompt is",
    "structured prompt",
    "rewritten prompt",
    "final prompt",
    "prompt:",
    "output:",
    "result:",
    "response:",
    "answer:",
    "sure,",
    "sure!",
    "certainly",
    "of course",
    "absolutely",
];

const TRAILING_PREFIXES: &[&str] = &[
    "let me know",
    "would you like",
    "if you want",
    "feel free",
    "i hope this helps",
    "this prompt",
    "you can now",
];

const REFUSAL_MARKERS: &[&str] = &[
    "i can't help",
    "i cannot help",
    "i can't assist",
    "i cannot assist",
    "i'm unable to",
    "i am unable to",
    "as an ai language model",
];

/// Returns the reviewable prompt, or `None` when the reply is empty, a
/// refusal, or nothing but packaging.
pub fn sanitize(raw: &str, max_chars: usize) -> Option<String> {
    let text = strip_code_fence(raw.trim());
    let lines: Vec<&str> = text.lines().collect();

    let mut start = 0usize;
    while start < lines.len() {
        let line = lines[start].trim();
        if line.is_empty() || is_preamble_line(line) {
            start += 1;
        } else {
            break;
        }
    }

    let mut end = lines.len();
    while end > start {
        let line = lines[end - 1].trim();
        if line.is_empty() || is_trailing_offer(line) {
            end -= 1;
        } else {
            break;
        }
    }

    let body = lines[start..end].join("\n");
    let body = strip_packaging(&body);
    let body = tidy_lines(&body);

    if body.is_empty() || looks_like_refusal(&body) {
        return None;
    }

    Some(truncate_chars(&body, max_chars))
}

fn strip_code_fence(text: &str) -> String {
    if !text.starts_with("```") {
        return text.to_string();
    }

    let mut lines = text.lines();
    let _ = lines.next();
    let mut body: Vec<&str> = lines.collect();
    if body
        .last()
        .map(|line| line.trim().starts_with("```"))
        .unwrap_or(false)
    {
        body.pop();
    }
    body.join("\n")
}

fn is_preamble_line(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    if lower.is_empty() {
        return true;
    }
    if PREAMBLE_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
    {
        return true;
    }
    // A short label such as "Structured prompt:" is packaging. A line such as
    // "Constraints:" is kept, because the constraints themselves follow it.
    lower.ends_with(':')
        && ["prompt", "output", "result", "response", "answer"]
            .iter()
            .any(|word| lower.contains(word))
}

fn is_trailing_offer(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    TRAILING_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
}

fn strip_packaging(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let line = line.trim_start().trim_start_matches('#').trim_start();
        let line = line.replace("**", "").replace("__", "").replace('`', "");
        out.push_str(&line);
        out.push('\n');
    }
    let out = out.trim().to_string();
    strip_wrapping_quotes(&out)
}

fn strip_wrapping_quotes(text: &str) -> String {
    let Some(first) = text.chars().next() else {
        return String::new();
    };
    let Some(last) = text.chars().next_back() else {
        return String::new();
    };
    let paired = matches!((first, last), ('"', '"') | ('\'', '\'') | ('“', '”'));
    if paired && text.chars().count() > 2 {
        text[first.len_utf8()..text.len() - last.len_utf8()]
            .trim()
            .to_string()
    } else {
        text.to_string()
    }
}

fn tidy_lines(text: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut blank = false;

    for line in text.lines() {
        let cleaned = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if cleaned.is_empty() {
            if !blank && !lines.is_empty() {
                lines.push(String::new());
            }
            blank = true;
        } else {
            lines.push(cleaned);
            blank = false;
        }
    }

    while lines.last().map(|line| line.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    lines.join("\n")
}

fn looks_like_refusal(text: &str) -> bool {
    let lower = text.to_lowercase();
    REFUSAL_MARKERS.iter().any(|marker| lower.contains(marker))
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let max_chars = max_chars.max(1);
    if text.chars().count() <= max_chars {
        return text.to_string();
    }

    let cut: String = text.chars().take(max_chars).collect();
    let boundary = cut.rfind(|character: char| {
        character.is_whitespace() || matches!(character, '.' | '!' | '?' | ';' | ':')
    });
    let trimmed = match boundary {
        Some(index) if index > 0 => &cut[..index],
        _ => cut.as_str(),
    };
    trimmed.trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_leading_preamble_is_stripped_and_constraints_survive() {
        let raw = "Here is the structured prompt:\n\nFix the login redirect bug. Keep the existing API and do not change the database schema.";
        let prompt = sanitize(raw, 1_200).expect("prompt");
        assert_eq!(
            prompt,
            "Fix the login redirect bug. Keep the existing API and do not change the database schema."
        );
    }

    #[test]
    fn code_fences_and_wrapping_quotes_are_packaging() {
        let raw = "```text\n\"Add a retry to the upload job. Keep the 3 second timeout.\"\n```";
        assert_eq!(
            sanitize(raw, 1_200).unwrap(),
            "Add a retry to the upload job. Keep the 3 second timeout."
        );
    }

    #[test]
    fn a_short_label_is_dropped_but_a_constraints_heading_is_kept() {
        let raw = "Prompt: Rewrite it.\n\nConstraints:\n- keep the existing API\n- do not rename the table";
        let prompt = sanitize(raw, 1_200).unwrap();
        assert!(prompt.contains("Constraints:"));
        assert!(prompt.contains("- keep the existing API"));
        assert!(prompt.contains("- do not rename the table"));
        assert!(!prompt.contains("Prompt:"));
    }

    #[test]
    fn a_trailing_offer_is_removed() {
        let raw = "Fix the parser.\n\nLet me know if you want it shorter.";
        assert_eq!(sanitize(raw, 1_200).unwrap(), "Fix the parser.");
    }

    #[test]
    fn empty_refusal_and_preamble_only_replies_are_rejected() {
        assert!(sanitize("", 1_200).is_none());
        assert!(sanitize("Here is the prompt:", 1_200).is_none());
        assert!(sanitize("I'm sorry, I cannot help with that.", 1_200).is_none());
    }

    #[test]
    fn output_is_cut_at_a_word_boundary() {
        let raw = "Fix the upload job and keep the existing retry policy unchanged";
        let prompt = sanitize(raw, 30).unwrap();
        assert!(prompt.chars().count() <= 30);
        assert!(!prompt.ends_with("pol"));
        assert!(raw.starts_with(&prompt));
    }

    #[test]
    fn whitespace_is_tidied_without_losing_lines() {
        let raw = "  Fix   the   parser.  \n\n\n\nKeep   the   API.  ";
        assert_eq!(
            sanitize(raw, 1_200).unwrap(),
            "Fix the parser.\n\nKeep the API."
        );
    }
}

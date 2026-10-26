//! The two PromptRestructurer implementations.
//!
//! Local is Ollama's `/api/generate`; cloud is an OpenAI-compatible
//! `/chat/completions` call. Both receive the transcript as text, never audio,
//! and both return the model's reply for the sanitizer to clean up.

use serde::Deserialize;
use serde_json::json;

use super::{PromptRestructurer, RestructureError, RestructureRequest, SYSTEM_PROMPT};

/// Talks to an Ollama server on this machine.
pub struct LocalOllama {
    agent: ureq::Agent,
}

impl LocalOllama {
    pub fn new(agent: ureq::Agent) -> Self {
        Self { agent }
    }
}

impl PromptRestructurer for LocalOllama {
    fn name(&self) -> &'static str {
        "ollama"
    }

    fn restructure(&self, request: &RestructureRequest) -> Result<String, RestructureError> {
        validate_endpoint(&request.endpoint)?;
        let body = json!({
            "model": request.model,
            "system": SYSTEM_PROMPT,
            "prompt": request.transcript,
            "stream": false,
            "options": { "temperature": 0 }
        });

        let mut response = self
            .agent
            .post(&ollama_url(&request.endpoint))
            .config()
            .timeout_global(Some(request.timeout))
            .build()
            .header("Content-Type", "application/json")
            .send_json(&body)
            .map_err(map_ureq)?;

        let raw = response
            .body_mut()
            .read_to_string()
            .map_err(|error| RestructureError::Transport(error.to_string()))?;
        parse_ollama_response(&raw)
    }
}

/// Talks to an OpenAI-compatible chat-completions endpoint.
pub struct CloudRestructurer {
    agent: ureq::Agent,
    api_key: String,
}

impl CloudRestructurer {
    pub fn new(agent: ureq::Agent, api_key: String) -> Self {
        Self { agent, api_key }
    }
}

impl PromptRestructurer for CloudRestructurer {
    fn name(&self) -> &'static str {
        "cloud"
    }

    fn restructure(&self, request: &RestructureRequest) -> Result<String, RestructureError> {
        validate_endpoint(&request.endpoint)?;
        let body = json!({
            "model": request.model,
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": request.transcript }
            ],
            "temperature": 0
        });
        let authorization = format!("Bearer {}", self.api_key);

        let mut response = self
            .agent
            .post(&request.endpoint)
            .config()
            .timeout_global(Some(request.timeout))
            .build()
            .header("Content-Type", "application/json")
            .header("Authorization", &authorization)
            .send_json(&body)
            .map_err(map_ureq)?;

        let raw = response
            .body_mut()
            .read_to_string()
            .map_err(|error| RestructureError::Transport(error.to_string()))?;
        parse_cloud_response(&raw)
    }
}

/// Base URL plus the generate path; a URL that already names the path is
/// accepted unchanged.
pub fn ollama_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/api/generate") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/api/generate")
    }
}

/// Refuses an endpoint that would send a transcript in clear text to another
/// machine. Loopback over http is allowed; everything else must be https.
pub fn validate_endpoint(endpoint: &str) -> Result<(), RestructureError> {
    let value = endpoint.trim();
    let (scheme, rest) = value
        .split_once("://")
        .ok_or_else(|| RestructureError::Provider("endpoint must include a scheme".into()))?;
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "https" && scheme != "http" {
        return Err(RestructureError::Provider(
            "endpoint must use http or https".into(),
        ));
    }

    let authority = rest.split('/').next().unwrap_or("").trim();
    if authority.is_empty() || authority.contains('@') || authority.contains(char::is_whitespace) {
        return Err(RestructureError::Provider(
            "endpoint has no usable host".into(),
        ));
    }
    if scheme == "https" {
        return Ok(());
    }

    if is_loopback(authority) {
        Ok(())
    } else {
        Err(RestructureError::Provider(
            "plain http is only allowed for localhost".into(),
        ))
    }
}

fn is_loopback(authority: &str) -> bool {
    let host = if let Some(end) = authority.find(']') {
        &authority[..=end]
    } else {
        authority.split(':').next().unwrap_or(authority)
    };
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "[::1]"
}

fn map_ureq(error: ureq::Error) -> RestructureError {
    match error {
        ureq::Error::Timeout(_) => RestructureError::Timeout,
        ureq::Error::StatusCode(code) => RestructureError::Provider(format!("HTTP {code}")),
        other => RestructureError::Transport(other.to_string()),
    }
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

fn parse_ollama_response(raw: &str) -> Result<String, RestructureError> {
    let parsed: OllamaResponse = serde_json::from_str(raw)
        .map_err(|_| RestructureError::Provider("Ollama returned invalid JSON".into()))?;
    if parsed.response.trim().is_empty() {
        Err(RestructureError::Empty)
    } else {
        Ok(parsed.response)
    }
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

fn parse_cloud_response(raw: &str) -> Result<String, RestructureError> {
    let parsed: ChatResponse = serde_json::from_str(raw)
        .map_err(|_| RestructureError::Provider("endpoint returned invalid JSON".into()))?;
    let content = parsed
        .choices
        .first()
        .map(|choice| choice.message.content.as_str())
        .unwrap_or("");
    if content.trim().is_empty() {
        Err(RestructureError::Empty)
    } else {
        Ok(content.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_url_appends_the_generate_path_once() {
        assert_eq!(
            ollama_url("http://127.0.0.1:11434"),
            "http://127.0.0.1:11434/api/generate"
        );
        assert_eq!(
            ollama_url("http://127.0.0.1:11434/"),
            "http://127.0.0.1:11434/api/generate"
        );
        assert_eq!(
            ollama_url("http://127.0.0.1:11434/api/generate"),
            "http://127.0.0.1:11434/api/generate"
        );
    }

    #[test]
    fn plain_http_is_only_allowed_on_loopback() {
        assert!(validate_endpoint("http://127.0.0.1:11434").is_ok());
        assert!(validate_endpoint("http://localhost:8080/v1").is_ok());
        assert!(validate_endpoint("http://[::1]:8080").is_ok());
        assert!(validate_endpoint("http://example.com/v1").is_err());
        assert!(validate_endpoint("https://example.com/v1").is_ok());
        assert!(validate_endpoint("file:///etc/passwd").is_err());
        assert!(validate_endpoint("example.com").is_err());
    }

    #[test]
    fn an_ollama_reply_is_read_from_response() {
        let raw = r#"{"response":"Add a retry to the upload job.","done":true}"#;
        assert_eq!(
            parse_ollama_response(raw).unwrap(),
            "Add a retry to the upload job."
        );
        assert!(matches!(
            parse_ollama_response(r#"{"response":"  "}"#),
            Err(RestructureError::Empty)
        ));
        assert!(parse_ollama_response("not json").is_err());
    }

    #[test]
    fn a_cloud_reply_is_read_from_the_first_choice() {
        let raw =
            r#"{"choices":[{"message":{"role":"assistant","content":"Keep the API stable."}}]}"#;
        assert_eq!(parse_cloud_response(raw).unwrap(), "Keep the API stable.");
        assert!(matches!(
            parse_cloud_response(r#"{"choices":[]}"#),
            Err(RestructureError::Empty)
        ));
        assert!(parse_cloud_response("{}").is_err());
    }
}

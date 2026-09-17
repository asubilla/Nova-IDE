use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use tauri::Emitter;

use super::error::CommandError;

const SERVICE_NAME: &str = "nova-ide";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIProvider {
    pub id: String,
    pub name: String,
    pub api_key: Option<String>,
    pub base_url: String,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

fn default_providers() -> Vec<AIProvider> {
    vec![
        AIProvider {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            api_key: None,
            base_url: "https://api.openai.com/v1".to_string(),
            models: vec![
                "gpt-4o".to_string(),
                "gpt-4o-mini".to_string(),
                "gpt-4-turbo".to_string(),
                "gpt-3.5-turbo".to_string(),
            ],
        },
        AIProvider {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            api_key: None,
            base_url: "https://api.anthropic.com/v1".to_string(),
            models: vec![
                "claude-opus-4-20250514".to_string(),
                "claude-sonnet-4-20250514".to_string(),
                "claude-3-5-haiku-20241022".to_string(),
            ],
        },
        AIProvider {
            id: "google".to_string(),
            name: "Google Gemini".to_string(),
            api_key: None,
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
            models: vec![
                "gemini-2.0-flash".to_string(),
                "gemini-1.5-pro".to_string(),
                "gemini-1.5-flash".to_string(),
            ],
        },
        AIProvider {
            id: "groq".to_string(),
            name: "Groq".to_string(),
            api_key: None,
            base_url: "https://api.groq.com/openai/v1".to_string(),
            models: vec![
                "llama-3.3-70b-versatile".to_string(),
                "mixtral-8x7b-32768".to_string(),
            ],
        },
        AIProvider {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            api_key: None,
            base_url: "https://api.deepseek.com/v1".to_string(),
            models: vec![
                "deepseek-chat".to_string(),
                "deepseek-coder".to_string(),
            ],
        },
    ]
}

async fn get_api_key(provider_id: &str) -> Result<Option<String>, CommandError> {
    let entry =
        Entry::new(SERVICE_NAME, &format!("api_key_{}", provider_id)).map_err(|e| CommandError { code: "KEYRING_ERROR".into(), message: e.to_string() })?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(CommandError { code: "KEYRING_ERROR".into(), message: e.to_string() }),
    }
}

async fn store_api_key(provider_id: &str, api_key: &str) -> Result<(), CommandError> {
    let entry =
        Entry::new(SERVICE_NAME, &format!("api_key_{}", provider_id)).map_err(|e| CommandError { code: "KEYRING_ERROR".into(), message: e.to_string() })?;
    entry
        .set_password(api_key)
        .map_err(|e| CommandError { code: "KEYRING_ERROR".into(), message: e.to_string() })?;
    Ok(())
}

async fn send_openai_request(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: Vec<AIMessage>,
) -> Result<String, CommandError> {
    let client = reqwest::Client::new();
    let messages_json: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            let mut obj = json!({
                "role": m.role,
                "content": m.content,
            });
            if let Some(tool_calls) = &m.tool_calls {
                obj["tool_calls"] = json!(tool_calls);
            }
            obj
        })
        .collect();

    let response = client
        .post(format!("{}/chat/completions", base_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": messages_json,
        }))
        .send()
        .await
        .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Request failed: {}", e) })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Failed to read response: {}", e) })?;

    if !status.is_success() {
        return Err(CommandError { code: "API_ERROR".into(), message: format!("API error ({}): {}", status, body) });
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| CommandError { code: "PARSE_ERROR".into(), message: format!("Failed to parse response: {}", e) })?;

    parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| CommandError { code: "UNEXPECTED_RESPONSE".into(), message: format!("Unexpected response structure: {}", body) })
}

async fn send_anthropic_request(
    api_key: &str,
    model: &str,
    messages: Vec<AIMessage>,
) -> Result<String, CommandError> {
    let client = reqwest::Client::new();
    let api_messages: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let system_msg = messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone());

    let mut body = json!({
        "model": model,
        "max_tokens": 4096,
        "messages": api_messages,
    });

    if let Some(sys) = system_msg {
        body["system"] = json!(sys);
    }

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Request failed: {}", e) })?;

    let status = response.status();
    let resp_body = response
        .text()
        .await
        .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Failed to read response: {}", e) })?;

    if !status.is_success() {
        return Err(CommandError { code: "API_ERROR".into(), message: format!("API error ({}): {}", status, resp_body) });
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&resp_body).map_err(|e| CommandError { code: "PARSE_ERROR".into(), message: format!("Failed to parse response: {}", e) })?;

    parsed["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| CommandError { code: "UNEXPECTED_RESPONSE".into(), message: format!("Unexpected response structure: {}", resp_body) })
}

async fn send_gemini_request(
    api_key: &str,
    model: &str,
    messages: Vec<AIMessage>,
) -> Result<String, CommandError> {
    let client = reqwest::Client::new();
    let contents: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            json!({
                "role": if m.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": m.content }],
            })
        })
        .collect();

    let response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, api_key
        ))
        .header("Content-Type", "application/json")
        .json(&json!({
            "contents": contents,
        }))
        .send()
        .await
        .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Request failed: {}", e) })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Failed to read response: {}", e) })?;

    if !status.is_success() {
        return Err(CommandError { code: "API_ERROR".into(), message: format!("API error ({}): {}", status, body) });
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| CommandError { code: "PARSE_ERROR".into(), message: format!("Failed to parse response: {}", e) })?;

    parsed["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| CommandError { code: "UNEXPECTED_RESPONSE".into(), message: format!("Unexpected response structure: {}", body) })
}

#[tauri::command]
pub async fn send_ai_message(
    provider_id: String,
    model: String,
    messages: Vec<AIMessage>,
) -> Result<String, CommandError> {
    let providers = default_providers();
    let provider = providers
        .iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| CommandError { code: "INVALID_PROVIDER".into(), message: format!("Unknown provider: {}", provider_id) })?;

    let api_key = get_api_key(&provider_id)
        .await?
        .ok_or_else(|| CommandError { code: "NO_API_KEY".into(), message: format!("No API key configured for {}", provider.name) })?;

    match provider_id.as_str() {
        "openai" | "groq" | "deepseek" => {
            send_openai_request(&provider.base_url, &api_key, &model, messages).await
        }
        "anthropic" => send_anthropic_request(&api_key, &model, messages).await,
        "google" => send_gemini_request(&api_key, &model, messages).await,
        _ => Err(CommandError { code: "UNSUPPORTED_PROVIDER".into(), message: format!("Unsupported provider: {}", provider_id) }),
    }
}

#[tauri::command]
pub async fn stream_ai_message(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    messages: Vec<AIMessage>,
) -> Result<(), CommandError> {
    let full_response = send_ai_message(provider_id.clone(), model, messages).await?;

    let chars: Vec<char> = full_response.chars().collect();
    let total = chars.len();
    let chunk_size = (total / 4).max(1);

    let mut start = 0;
    while start < total {
        let end = (start + chunk_size).min(total);
        let chunk: String = chars[start..end].iter().collect();
        let _ = app.emit("ai-token", &chunk);
        start = end;
        if start < total {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }

    let _ = app.emit("ai-stream-complete", ());
    Ok(())
}

#[tauri::command]
pub async fn list_providers() -> Result<Vec<AIProvider>, CommandError> {
    let providers = default_providers();
    let mut result = Vec::new();

    for mut provider in providers {
        let has_key = get_api_key(&provider.id).await?.is_some();
        if has_key {
            provider.api_key = Some("••••••••".to_string());
        }
        result.push(provider);
    }

    Ok(result)
}

#[tauri::command]
pub async fn save_api_key(provider_id: String, api_key: String) -> Result<(), CommandError> {
    let providers = default_providers();
    if !providers.iter().any(|p| p.id == provider_id) {
        return Err(CommandError { code: "INVALID_PROVIDER".into(), message: format!("Unknown provider: {}", provider_id) });
    }
    store_api_key(&provider_id, &api_key).await
}

#[tauri::command]
pub async fn test_connection(provider_id: String) -> Result<bool, CommandError> {
    let providers = default_providers();
    let provider = providers
        .iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| CommandError { code: "INVALID_PROVIDER".into(), message: format!("Unknown provider: {}", provider_id) })?;

    let api_key = get_api_key(&provider_id)
        .await?
        .ok_or_else(|| CommandError { code: "NO_API_KEY".into(), message: format!("No API key configured for {}", provider.name) })?;

    let client = reqwest::Client::new();
    let test_messages = vec![AIMessage {
        role: "user".to_string(),
        content: "Hello".to_string(),
        tool_calls: None,
    }];

    match provider_id.as_str() {
        "openai" | "groq" | "deepseek" => {
            let response = client
                .post(format!("{}/chat/completions", provider.base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&json!({
                    "model": provider.models.first().unwrap_or(&"gpt-3.5-turbo".to_string()),
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5,
                }))
                .send()
                .await
                .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Connection test failed: {}", e) })?;
            Ok(response.status().is_success())
        }
        "anthropic" => {
            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&json!({
                    "model": provider.models.first().unwrap_or(&"claude-3-5-haiku-20241022".to_string()),
                    "max_tokens": 5,
                    "messages": [{"role": "user", "content": "Hi"}],
                }))
                .send()
                .await
                .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Connection test failed: {}", e) })?;
            Ok(response.status().is_success())
        }
        "google" => {
            let model = provider.models.first().unwrap_or(&"gemini-1.5-flash".to_string());
            let response = client
                .post(format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                    model, api_key
                ))
                .header("Content-Type", "application/json")
                .json(&json!({
                    "contents": [{"role": "user", "parts": [{"text": "Hi"}]}],
                }))
                .send()
                .await
                .map_err(|e| CommandError { code: "NETWORK_ERROR".into(), message: format!("Connection test failed: {}", e) })?;
            Ok(response.status().is_success())
        }
        _ => Err(CommandError { code: "UNSUPPORTED_PROVIDER".into(), message: format!("Unsupported provider: {}", provider_id) }),
    }
}

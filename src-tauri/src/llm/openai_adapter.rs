use std::io::BufRead;
use tauri::Emitter;
use crate::llm::adapter::{ChatMessage, ChatResponse, TokenUsage};
use crate::models::settings::LlmConfig;

pub struct OpenAiCompatibleAdapter {
    api_url: String,
    api_key: String,
    model: String,
    max_tokens: i32,
}

impl OpenAiCompatibleAdapter {
    pub fn new(config: &LlmConfig) -> Self {
        Self {
            api_url: config.api_url.trim_end_matches('/').to_string(),
            api_key: config.api_key.clone(),
            model: config.model.clone(),
            max_tokens: config.max_tokens.unwrap_or(4096),
        }
    }

    fn build_messages_json(&self, messages: &[ChatMessage]) -> Vec<serde_json::Value> {
        messages.iter().map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        }).collect()
    }

    pub fn chat_completion(
        &self,
        messages: &[ChatMessage],
        temperature: Option<f64>,
    ) -> Result<ChatResponse, String> {
        let url = format!("{}/chat/completions", self.api_url);
        let messages_json = self.build_messages_json(messages);

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": messages_json,
            "max_tokens": self.max_tokens,
        });

        if let Some(temp) = temperature {
            body["temperature"] = serde_json::json!(temp);
        }

        let response = ureq::post(&url)
            .set("Authorization", &format!("Bearer {}", self.api_key))
            .set("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(300))
            .send_json(&body)
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let response_json: serde_json::Value = response.into_json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = response_json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let usage = if let Some(usage_obj) = response_json.get("usage") {
            Some(TokenUsage {
                prompt_tokens: usage_obj["prompt_tokens"].as_i64().unwrap_or(0),
                completion_tokens: usage_obj["completion_tokens"].as_i64().unwrap_or(0),
                total_tokens: usage_obj["total_tokens"].as_i64().unwrap_or(0),
            })
        } else {
            None
        };

        Ok(ChatResponse { content, usage })
    }

    /// Stream chat completion via SSE, emitting chunks as Tauri events.
    /// Returns the full accumulated content when done.
    /// When `enable_thinking` is Some(false), disables deep thinking for models that support it (e.g. Qwen3).
    pub fn chat_completion_stream(
        &self,
        messages: &[ChatMessage],
        temperature: Option<f64>,
        app_handle: &tauri::AppHandle,
        enable_thinking: Option<bool>,
    ) -> Result<ChatResponse, String> {
        let url = format!("{}/chat/completions", self.api_url);
        let messages_json = self.build_messages_json(messages);

        let mut body = serde_json::json!({
            "model": self.model,
            "messages": messages_json,
            "max_tokens": self.max_tokens,
            "stream": true,
            "stream_options": { "include_usage": true },
        });

        if let Some(temp) = temperature {
            body["temperature"] = serde_json::json!(temp);
        }

        // Control thinking mode (Qwen3, DeepSeek-R1, etc.)
        if let Some(thinking) = enable_thinking {
            body["enable_thinking"] = serde_json::json!(thinking);
        }

        let request_start = std::time::Instant::now();

        let response = ureq::post(&url)
            .set("Authorization", &format!("Bearer {}", self.api_key))
            .set("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(300))
            .send_json(&body)
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let connect_ms = request_start.elapsed().as_millis();

        // Signal that connection is established — include timing info
        let _ = app_handle.emit("llm-stream-start", serde_json::json!({
            "connect_ms": connect_ms,
        }));

        let reader = response.into_reader();
        let buf_reader = std::io::BufReader::new(reader);
        let mut full_content = String::new();
        let mut thinking_content = String::new();
        let mut first_token = true;
        let mut first_thinking = true;
        let mut usage: Option<TokenUsage> = None;

        for line in buf_reader.lines() {
            let line = line.map_err(|e| format!("Stream read error: {}", e))?;

            if !line.starts_with("data: ") {
                continue;
            }

            let data = line[6..].trim();
            if data == "[DONE]" {
                break;
            }

            if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(data) {
                let delta = &chunk["choices"][0]["delta"];

                // Parse reasoning_content (Qwen3 thinking mode / DeepSeek-R1)
                if let Some(reasoning) = delta.get("reasoning_content").and_then(|v| v.as_str()) {
                    if !reasoning.is_empty() {
                        if first_thinking {
                            let _ = app_handle.emit("llm-stream-thinking-start", true);
                            first_thinking = false;
                        }
                        thinking_content.push_str(reasoning);
                        let _ = app_handle.emit("llm-stream-thinking", reasoning);
                    }
                }

                // Parse content delta
                if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                    if !content.is_empty() {
                        if first_token {
                            let ttft_ms = request_start.elapsed().as_millis();
                            let _ = app_handle.emit("llm-stream-first-token", serde_json::json!({
                                "ttft_ms": ttft_ms,
                                "thinking_chars": thinking_content.len(),
                            }));
                            first_token = false;
                        }
                        full_content.push_str(content);
                        let _ = app_handle.emit("llm-stream-chunk", content);
                    }
                }

                // Parse usage from the final chunk (OpenAI stream_options.include_usage)
                if let Some(usage_obj) = chunk.get("usage") {
                    if usage_obj.is_object() && usage_obj.get("total_tokens").is_some() {
                        usage = Some(TokenUsage {
                            prompt_tokens: usage_obj["prompt_tokens"].as_i64().unwrap_or(0),
                            completion_tokens: usage_obj["completion_tokens"].as_i64().unwrap_or(0),
                            total_tokens: usage_obj["total_tokens"].as_i64().unwrap_or(0),
                        });
                    }
                }
            }
        }

        let total_ms = request_start.elapsed().as_millis();

        // Signal stream end with usage info
        let _ = app_handle.emit("llm-stream-done", serde_json::json!({
            "total_ms": total_ms,
            "content_length": full_content.len(),
            "thinking_length": thinking_content.len(),
            "usage": usage.as_ref().map(|u| serde_json::json!({
                "prompt_tokens": u.prompt_tokens,
                "completion_tokens": u.completion_tokens,
                "total_tokens": u.total_tokens,
            })),
        }));

        Ok(ChatResponse { content: full_content, usage })
    }
}

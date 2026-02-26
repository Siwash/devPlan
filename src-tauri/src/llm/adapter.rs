use serde::{Deserialize, Serialize};

/// LLM Adapter trait for future integration
#[allow(async_fn_in_trait)]
pub trait LlmAdapter {
    /// Analyze sheet mapping - help match Excel columns to task fields
    async fn analyze_sheet_mapping(
        &self,
        headers: &[String],
        sample_data: &[Vec<String>],
        field_definitions: &[FieldInfo],
    ) -> Result<Vec<LlmColumnSuggestion>, String>;

    /// Suggest schedule arrangement based on tasks, members, and availability
    async fn suggest_schedule(
        &self,
        tasks: &[TaskInfo],
        developers: &[DeveloperInfo],
        constraints: &ScheduleConstraints,
    ) -> Result<Vec<ScheduleSuggestion>, String>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldInfo {
    pub field: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmColumnSuggestion {
    pub header: String,
    pub suggested_field: String,
    pub confidence: f64,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInfo {
    pub id: i64,
    pub name: String,
    pub task_type: Option<String>,
    pub priority: Option<String>,
    pub planned_hours: Option<f64>,
    pub required_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperInfo {
    pub id: i64,
    pub name: String,
    pub skills: Vec<String>,
    pub available_hours: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConstraints {
    pub start_date: String,
    pub end_date: String,
    pub max_hours_per_day: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleSuggestion {
    pub task_id: i64,
    pub developer_id: i64,
    pub planned_start: String,
    pub planned_end: String,
    pub reasoning: String,
}

/// Placeholder adapter that returns empty results (for future implementation)
pub struct NoopLlmAdapter;

impl LlmAdapter for NoopLlmAdapter {
    async fn analyze_sheet_mapping(
        &self,
        _headers: &[String],
        _sample_data: &[Vec<String>],
        _field_definitions: &[FieldInfo],
    ) -> Result<Vec<LlmColumnSuggestion>, String> {
        Ok(Vec::new())
    }

    async fn suggest_schedule(
        &self,
        _tasks: &[TaskInfo],
        _developers: &[DeveloperInfo],
        _constraints: &ScheduleConstraints,
    ) -> Result<Vec<ScheduleSuggestion>, String> {
        Ok(Vec::new())
    }
}

// Chat types for LLM integration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmChatResponse {
    pub message: String,
    pub actions: Vec<ChatAction>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatAction {
    pub action_type: String,
    pub description: String,
    pub payload: serde_json::Value,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGroup {
    pub group_name: String,
    pub task_ids: Vec<i64>,
    pub suggested_parent_id: Option<i64>,
    pub suggested_external_prefix: Option<String>,
}

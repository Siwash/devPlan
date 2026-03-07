use serde::{Deserialize, Serialize};

/// Markdown-first standup contract used by Tauri commands.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StandupMarkdownRecord {
    pub id: i64,
    pub date: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveStandupMarkdownRequest {
    pub date: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StandupMeeting {
    pub id: i64,
    pub meeting_date: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub entries: Vec<StandupEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StandupEntry {
    pub id: i64,
    pub meeting_id: i64,
    pub developer_id: i64,
    pub developer_name: String,
    pub done_items: Vec<StandupItem>,
    pub plan_items: Vec<StandupItem>,
    pub blockers: Vec<StandupItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StandupItem {
    pub text: String,
    pub task_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveStandupRequest {
    pub meeting_date: String,
    pub notes: Option<String>,
    pub entries: Vec<SaveEntryRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveEntryRequest {
    pub developer_id: i64,
    pub done_items: Vec<StandupItem>,
    pub plan_items: Vec<StandupItem>,
    pub blockers: Vec<StandupItem>,
}

impl From<StandupMeeting> for StandupMarkdownRecord {
    fn from(value: StandupMeeting) -> Self {
        Self {
            id: value.id,
            date: value.meeting_date,
            content: value.notes.unwrap_or_default(),
            created_at: value.created_at,
        }
    }
}

impl From<SaveStandupMarkdownRequest> for SaveStandupRequest {
    fn from(value: SaveStandupMarkdownRequest) -> Self {
        Self {
            meeting_date: value.date,
            notes: Some(value.content),
            entries: vec![],
        }
    }
}

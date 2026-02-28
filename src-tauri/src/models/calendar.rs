use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start: String,
    pub end: Option<String>,
    pub resource_id: Option<String>,
    pub color: Option<String>,
    pub ext_props: Option<CalendarEventExtProps>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEventExtProps {
    pub task_id: i64,
    pub task_type: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub owner_id: Option<i64>,
    pub owner_name: Option<String>,
    pub planned_hours: Option<f64>,
    pub sprint_id: Option<i64>,
    pub sprint_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarResource {
    pub id: String,
    pub title: String,
    pub avatar_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperWorkload {
    pub developer_id: i64,
    pub developer_name: String,
    pub date: String,
    pub allocated_hours: f64,
    pub max_hours: f64,
    pub available_hours: f64,
    pub tasks: Vec<WorkloadTask>,
    #[serde(default)]
    pub is_overtime: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadTask {
    pub task_id: i64,
    pub task_name: String,
    pub daily_hours: f64,
}

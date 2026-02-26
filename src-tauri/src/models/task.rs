use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: i64,
    pub external_id: Option<String>,
    pub task_type: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Option<i64>,
    pub owner_name: Option<String>,
    pub sprint_id: Option<i64>,
    pub sprint_name: Option<String>,
    pub priority: Option<String>,
    pub planned_start: Option<String>,
    pub planned_end: Option<String>,
    pub planned_hours: Option<f64>,
    pub parent_task_id: Option<i64>,
    pub status: Option<String>,
    pub co_owners: Option<Vec<CoOwner>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoOwner {
    pub developer_id: i64,
    pub developer_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskDto {
    pub external_id: Option<String>,
    pub task_type: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Option<i64>,
    pub sprint_id: Option<i64>,
    pub priority: Option<String>,
    pub planned_start: Option<String>,
    pub planned_end: Option<String>,
    pub planned_hours: Option<f64>,
    pub parent_task_id: Option<i64>,
    pub status: Option<String>,
    pub co_owner_ids: Option<Vec<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskDto {
    pub id: i64,
    pub external_id: Option<String>,
    pub task_type: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub owner_id: Option<i64>,
    pub sprint_id: Option<i64>,
    pub priority: Option<String>,
    pub planned_start: Option<String>,
    pub planned_end: Option<String>,
    pub planned_hours: Option<f64>,
    pub parent_task_id: Option<i64>,
    pub status: Option<String>,
    pub co_owner_ids: Option<Vec<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskFilter {
    pub sprint_id: Option<i64>,
    pub owner_id: Option<i64>,
    pub status: Option<String>,
    pub task_type: Option<String>,
    pub priority: Option<String>,
    pub search: Option<String>,
}

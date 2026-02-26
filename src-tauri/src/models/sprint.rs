use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprint {
    pub id: i64,
    pub name: String,
    pub project_id: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub phase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSprintDto {
    pub name: String,
    pub project_id: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub phase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectDto {
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
}

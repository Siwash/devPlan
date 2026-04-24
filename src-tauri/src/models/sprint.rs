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
    /// 关联任务数（查询时计算）by AI.Coding
    #[serde(default)]
    pub task_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSprintDto {
    pub name: String,
    pub project_id: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub phase: Option<String>,
}

/// 迭代更新 DTO by AI.Coding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSprintDto {
    pub id: i64,
    pub name: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub phase: Option<String>,
}

/// 删除迭代返回结果 by AI.Coding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteSprintResult {
    pub deleted: bool,
    pub unlinked_tasks: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectDto {
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
}

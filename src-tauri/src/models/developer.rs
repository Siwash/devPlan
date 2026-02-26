use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Developer {
    pub id: i64,
    pub name: String,
    pub roles: Vec<String>,
    pub skills: Vec<String>,
    pub max_hours_per_day: f64,
    pub avatar_color: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDeveloperDto {
    pub name: String,
    pub roles: Option<Vec<String>>,
    pub skills: Option<Vec<String>>,
    pub max_hours_per_day: Option<f64>,
    pub avatar_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDeveloperDto {
    pub id: i64,
    pub name: Option<String>,
    pub roles: Option<Vec<String>>,
    pub skills: Option<Vec<String>>,
    pub max_hours_per_day: Option<f64>,
    pub avatar_color: Option<String>,
    pub is_active: Option<bool>,
}

impl Developer {
    pub fn default_colors() -> Vec<&'static str> {
        vec![
            "#1890ff", "#52c41a", "#faad14", "#f5222d", "#722ed1",
            "#13c2c2", "#eb2f96", "#fa8c16", "#a0d911", "#2f54eb",
            "#fadb14",
        ]
    }
}

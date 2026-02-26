use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSetting {
    pub key: String,
    pub value: String,
    pub category: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub api_key: String,
    pub api_url: String,
    pub model: String,
    pub max_tokens: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelTemplateConfig {
    pub column_mapping: Vec<TemplateColumn>,
    pub header_row: Option<i32>,
    pub default_sheet_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateColumn {
    pub excel_header: String,
    pub mapped_field: String,
    pub column_index: Option<usize>,
}

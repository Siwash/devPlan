use rusqlite::Connection;
use crate::db::settings_repo;
use crate::models::settings::{LlmConfig, ExcelTemplateConfig};
use std::collections::HashMap;

pub fn get_llm_config(conn: &Connection) -> Result<Option<LlmConfig>, String> {
    let settings = settings_repo::get_settings_by_category(conn, "llm")
        .map_err(|e| e.to_string())?;

    let api_key = match settings.get("llm.api_key") {
        Some(k) if !k.is_empty() => k.clone(),
        _ => return Ok(None),
    };
    let api_url = settings.get("llm.api_url")
        .cloned()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
    let model = settings.get("llm.model")
        .cloned()
        .unwrap_or_else(|| "gpt-4".to_string());
    let max_tokens = settings.get("llm.max_tokens")
        .and_then(|v| v.parse::<i32>().ok());

    Ok(Some(LlmConfig { api_key, api_url, model, max_tokens }))
}

pub fn save_llm_config(conn: &Connection, config: &LlmConfig) -> Result<(), String> {
    settings_repo::set_setting(conn, "llm.api_key", &config.api_key, "llm")
        .map_err(|e| e.to_string())?;
    settings_repo::set_setting(conn, "llm.api_url", &config.api_url, "llm")
        .map_err(|e| e.to_string())?;
    settings_repo::set_setting(conn, "llm.model", &config.model, "llm")
        .map_err(|e| e.to_string())?;
    if let Some(max_tokens) = config.max_tokens {
        settings_repo::set_setting(conn, "llm.max_tokens", &max_tokens.to_string(), "llm")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_excel_template_config(conn: &Connection) -> Result<Option<ExcelTemplateConfig>, String> {
    let settings = settings_repo::get_settings_by_category(conn, "excel_template")
        .map_err(|e| e.to_string())?;

    let column_mapping_str = match settings.get("excel_template.column_mapping") {
        Some(s) if !s.is_empty() => s.clone(),
        _ => return Ok(None),
    };

    let column_mapping = serde_json::from_str(&column_mapping_str)
        .map_err(|e| format!("Failed to parse column_mapping: {}", e))?;

    let header_row = settings.get("excel_template.header_row")
        .and_then(|v| v.parse::<i32>().ok());
    let default_sheet_name = settings.get("excel_template.default_sheet_name").cloned();

    Ok(Some(ExcelTemplateConfig { column_mapping, header_row, default_sheet_name }))
}

pub fn save_excel_template_config(conn: &Connection, config: &ExcelTemplateConfig) -> Result<(), String> {
    let column_mapping_str = serde_json::to_string(&config.column_mapping)
        .map_err(|e| format!("Failed to serialize column_mapping: {}", e))?;
    settings_repo::set_setting(conn, "excel_template.column_mapping", &column_mapping_str, "excel_template")
        .map_err(|e| e.to_string())?;
    if let Some(header_row) = config.header_row {
        settings_repo::set_setting(conn, "excel_template.header_row", &header_row.to_string(), "excel_template")
            .map_err(|e| e.to_string())?;
    }
    if let Some(ref sheet_name) = config.default_sheet_name {
        settings_repo::set_setting(conn, "excel_template.default_sheet_name", sheet_name, "excel_template")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    settings_repo::get_setting(conn, key).map_err(|e| e.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str, category: &str) -> Result<(), String> {
    settings_repo::set_setting(conn, key, value, category).map_err(|e| e.to_string())
}

pub fn get_settings_by_category(conn: &Connection, category: &str) -> Result<HashMap<String, String>, String> {
    settings_repo::get_settings_by_category(conn, category).map_err(|e| e.to_string())
}

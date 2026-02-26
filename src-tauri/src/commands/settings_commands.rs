use tauri::State;
use crate::db::AppDatabase;
use crate::models::settings::{LlmConfig, ExcelTemplateConfig};
use crate::services::settings_service;

#[tauri::command]
pub fn get_llm_config(db: State<AppDatabase>) -> Result<Option<LlmConfig>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    settings_service::get_llm_config(&conn)
}

#[tauri::command]
pub fn save_llm_config(db: State<AppDatabase>, config: LlmConfig) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    settings_service::save_llm_config(&conn, &config)
}

#[tauri::command]
pub fn get_excel_template_config(db: State<AppDatabase>) -> Result<Option<ExcelTemplateConfig>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    settings_service::get_excel_template_config(&conn)
}

#[tauri::command]
pub fn save_excel_template_config(db: State<AppDatabase>, config: ExcelTemplateConfig) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    settings_service::save_excel_template_config(&conn, &config)
}

#[tauri::command]
pub fn get_setting(db: State<AppDatabase>, key: String) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    settings_service::get_setting(&conn, &key)
}

#[tauri::command]
pub fn save_setting(db: State<AppDatabase>, key: String, value: String, category: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    settings_service::set_setting(&conn, &key, &value, &category)
}

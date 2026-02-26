use tauri::State;
use crate::db::AppDatabase;
use crate::models::developer::{Developer, CreateDeveloperDto, UpdateDeveloperDto};
use crate::services::developer_service;

#[tauri::command]
pub fn list_developers(db: State<AppDatabase>) -> Result<Vec<Developer>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    developer_service::list_developers(&conn)
}

#[tauri::command]
pub fn get_developer(db: State<AppDatabase>, id: i64) -> Result<Option<Developer>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    developer_service::get_developer(&conn, id)
}

#[tauri::command]
pub fn create_developer(db: State<AppDatabase>, dto: CreateDeveloperDto) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    developer_service::create_developer(&conn, &dto)
}

#[tauri::command]
pub fn update_developer(db: State<AppDatabase>, dto: UpdateDeveloperDto) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    developer_service::update_developer(&conn, &dto)
}

#[tauri::command]
pub fn delete_developer(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    developer_service::delete_developer(&conn, id)
}

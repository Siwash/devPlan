use tauri::State;
use crate::db::AppDatabase;
use crate::models::standup::{StandupMeeting, SaveStandupRequest};
use crate::services::standup_service;

#[tauri::command]
pub fn get_standup_by_date(db: State<AppDatabase>, date: String) -> Result<Option<StandupMeeting>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    standup_service::get_meeting_by_date(&conn, &date)
}

#[tauri::command]
pub fn save_standup(db: State<AppDatabase>, request: SaveStandupRequest) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    standup_service::save_meeting(&conn, &request)
}

#[tauri::command]
pub fn list_standups(db: State<AppDatabase>, start_date: String, end_date: String) -> Result<Vec<StandupMeeting>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    standup_service::list_meetings(&conn, &start_date, &end_date)
}

#[tauri::command]
pub fn delete_standup(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    standup_service::delete_meeting(&conn, id)
}

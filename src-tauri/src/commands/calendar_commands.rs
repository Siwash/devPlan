use tauri::State;
use crate::db::AppDatabase;
use crate::models::calendar::{CalendarEvent, CalendarResource, DeveloperWorkload};
use crate::services::{schedule_service, holiday_service};

#[tauri::command]
pub fn get_calendar_events(
    db: State<AppDatabase>,
    start_date: String,
    end_date: String,
    developer_id: Option<i64>,
) -> Result<Vec<CalendarEvent>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    schedule_service::get_calendar_events(&conn, &start_date, &end_date, developer_id)
}

#[tauri::command]
pub fn get_calendar_resources(db: State<AppDatabase>) -> Result<Vec<CalendarResource>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    schedule_service::get_calendar_resources(&conn)
}

#[tauri::command]
pub fn get_developer_workload(
    db: State<AppDatabase>,
    developer_id: i64,
    start_date: String,
    end_date: String,
    include_overtime: Option<bool>,
) -> Result<Vec<DeveloperWorkload>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    schedule_service::get_developer_workload(&conn, developer_id, &start_date, &end_date, include_overtime.unwrap_or(false))
}

#[tauri::command]
pub fn sync_holidays(db: State<AppDatabase>, year: i32) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    holiday_service::sync_holidays_for_year(&conn, year)
}

use crate::db::AppDatabase;
use crate::models::standup::{
    SaveStandupMarkdownRequest, SaveStandupRequest, StandupMarkdownRecord, StandupMeeting,
};
use crate::services::standup_service;
use tauri::State;

#[tauri::command]
pub fn get_standup_by_date(
    db: State<AppDatabase>,
    date: String,
) -> Result<Option<StandupMarkdownRecord>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let meeting = standup_service::get_meeting_by_date(&conn, &date)?;
    Ok(meeting.map(StandupMarkdownRecord::from))
}

#[tauri::command]
pub fn save_standup(
    db: State<AppDatabase>,
    request: SaveStandupMarkdownRequest,
) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let legacy_request: SaveStandupRequest = request.into();
    standup_service::save_meeting(&conn, &legacy_request)
}

#[tauri::command]
pub fn list_standups(
    db: State<AppDatabase>,
    start_date: String,
    end_date: String,
) -> Result<Vec<StandupMarkdownRecord>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let meetings: Vec<StandupMeeting> =
        standup_service::list_meetings(&conn, &start_date, &end_date)?;
    Ok(meetings
        .into_iter()
        .map(StandupMarkdownRecord::from)
        .collect())
}

#[tauri::command]
pub fn delete_standup(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    standup_service::delete_meeting(&conn, id)
}

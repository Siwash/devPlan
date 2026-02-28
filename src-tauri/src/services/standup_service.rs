use rusqlite::Connection;
use crate::db::standup_repo;
use crate::models::standup::{StandupMeeting, SaveStandupRequest};

pub fn get_meeting_by_date(conn: &Connection, date: &str) -> Result<Option<StandupMeeting>, String> {
    standup_repo::get_meeting_by_date(conn, date).map_err(|e| e.to_string())
}

pub fn save_meeting(conn: &Connection, request: &SaveStandupRequest) -> Result<i64, String> {
    standup_repo::save_meeting(conn, request).map_err(|e| e.to_string())
}

pub fn list_meetings(conn: &Connection, start_date: &str, end_date: &str) -> Result<Vec<StandupMeeting>, String> {
    standup_repo::list_meetings(conn, start_date, end_date).map_err(|e| e.to_string())
}

pub fn delete_meeting(conn: &Connection, id: i64) -> Result<(), String> {
    standup_repo::delete_meeting(conn, id).map_err(|e| e.to_string())
}

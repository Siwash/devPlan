use rusqlite::Connection;
use crate::db::developer_repo;
use crate::models::developer::{Developer, CreateDeveloperDto, UpdateDeveloperDto};

pub fn list_developers(conn: &Connection) -> Result<Vec<Developer>, String> {
    developer_repo::get_all(conn).map_err(|e| e.to_string())
}

pub fn get_developer(conn: &Connection, id: i64) -> Result<Option<Developer>, String> {
    developer_repo::get_by_id(conn, id).map_err(|e| e.to_string())
}

pub fn create_developer(conn: &Connection, dto: &CreateDeveloperDto) -> Result<i64, String> {
    developer_repo::create(conn, dto).map_err(|e| e.to_string())
}

pub fn update_developer(conn: &Connection, dto: &UpdateDeveloperDto) -> Result<(), String> {
    developer_repo::update(conn, dto).map_err(|e| e.to_string())
}

pub fn delete_developer(conn: &Connection, id: i64) -> Result<(), String> {
    developer_repo::delete(conn, id).map_err(|e| e.to_string())
}

pub fn find_or_create_by_name(conn: &Connection, name: &str, color_index: usize) -> Result<i64, String> {
    developer_repo::find_or_create_by_name(conn, name, color_index).map_err(|e| e.to_string())
}

use rusqlite::Connection;
use crate::db::task_repo;
use crate::models::task::{Task, CreateTaskDto, UpdateTaskDto, TaskFilter};

pub fn list_tasks(conn: &Connection, filter: &TaskFilter) -> Result<Vec<Task>, String> {
    task_repo::get_all(conn, filter).map_err(|e| e.to_string())
}

pub fn get_task(conn: &Connection, id: i64) -> Result<Option<Task>, String> {
    task_repo::get_by_id(conn, id).map_err(|e| e.to_string())
}

pub fn create_task(conn: &Connection, dto: &CreateTaskDto) -> Result<i64, String> {
    task_repo::create(conn, dto).map_err(|e| e.to_string())
}

pub fn update_task(conn: &Connection, dto: &UpdateTaskDto) -> Result<(), String> {
    task_repo::update(conn, dto).map_err(|e| e.to_string())
}

pub fn delete_task(conn: &Connection, id: i64) -> Result<(), String> {
    task_repo::delete(conn, id).map_err(|e| e.to_string())
}

pub fn count_tasks(conn: &Connection) -> Result<i64, String> {
    task_repo::count_tasks(conn).map_err(|e| e.to_string())
}

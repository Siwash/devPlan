use rusqlite::Connection;
use crate::db::task_repo;
use crate::models::task::{Task, CreateTaskDto, UpdateTaskDto, TaskFilter};
use crate::models::batch::BatchResult;

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

pub fn batch_update_tasks(conn: &Connection, updates: &[UpdateTaskDto]) -> Result<BatchResult, String> {
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let mut success_count = 0;
    let mut fail_count = 0;
    let mut errors = Vec::new();

    for dto in updates {
        match task_repo::update(conn, dto) {
            Ok(_) => success_count += 1,
            Err(e) => {
                fail_count += 1;
                errors.push(format!("Task {}: {}", dto.id, e));
            }
        }
    }

    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(BatchResult { success_count, fail_count, errors })
}

pub fn batch_delete_tasks(conn: &Connection, ids: &[i64]) -> Result<usize, String> {
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let mut count = 0;
    for id in ids {
        match task_repo::delete(conn, *id) {
            Ok(_) => count += 1,
            Err(e) => {
                conn.execute_batch("ROLLBACK").ok();
                return Err(format!("Failed to delete task {}: {}", id, e));
            }
        }
    }
    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(count)
}

pub fn batch_create_tasks(conn: &Connection, tasks: &[CreateTaskDto]) -> Result<Vec<i64>, String> {
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for dto in tasks {
        match task_repo::create(conn, dto) {
            Ok(id) => ids.push(id),
            Err(e) => {
                conn.execute_batch("ROLLBACK").ok();
                return Err(format!("Failed to create task '{}': {}", dto.name, e));
            }
        }
    }
    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(ids)
}

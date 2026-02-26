use tauri::State;
use crate::db::AppDatabase;
use crate::models::task::{CreateTaskDto, UpdateTaskDto};
use crate::models::batch::BatchResult;
use crate::services::task_service;

#[tauri::command]
pub fn batch_update_tasks(db: State<AppDatabase>, updates: Vec<UpdateTaskDto>) -> Result<BatchResult, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::batch_update_tasks(&conn, &updates)
}

#[tauri::command]
pub fn batch_delete_tasks(db: State<AppDatabase>, ids: Vec<i64>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::batch_delete_tasks(&conn, &ids)
}

#[tauri::command]
pub fn batch_create_tasks(db: State<AppDatabase>, tasks: Vec<CreateTaskDto>) -> Result<Vec<i64>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::batch_create_tasks(&conn, &tasks)
}

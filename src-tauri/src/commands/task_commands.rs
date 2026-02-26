use tauri::State;
use crate::db::AppDatabase;
use crate::models::task::{Task, CreateTaskDto, UpdateTaskDto, TaskFilter};
use crate::services::task_service;

#[tauri::command]
pub fn list_tasks(db: State<AppDatabase>, filter: TaskFilter) -> Result<Vec<Task>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::list_tasks(&conn, &filter)
}

#[tauri::command]
pub fn get_task(db: State<AppDatabase>, id: i64) -> Result<Option<Task>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::get_task(&conn, id)
}

#[tauri::command]
pub fn create_task(db: State<AppDatabase>, dto: CreateTaskDto) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::create_task(&conn, &dto)
}

#[tauri::command]
pub fn update_task(db: State<AppDatabase>, dto: UpdateTaskDto) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::update_task(&conn, &dto)
}

#[tauri::command]
pub fn delete_task(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::delete_task(&conn, id)
}

#[tauri::command]
pub fn count_tasks(db: State<AppDatabase>) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    task_service::count_tasks(&conn)
}

use tauri::State;
use crate::db::AppDatabase;
use crate::models::sprint::{Sprint, Project, CreateSprintDto, CreateProjectDto};
use crate::db::sprint_repo;

#[tauri::command]
pub fn list_sprints(db: State<AppDatabase>) -> Result<Vec<Sprint>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    sprint_repo::get_all_sprints(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_sprint(db: State<AppDatabase>, dto: CreateSprintDto) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    sprint_repo::create_sprint(&conn, &dto).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_sprint(db: State<AppDatabase>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    sprint_repo::delete_sprint(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_projects(db: State<AppDatabase>) -> Result<Vec<Project>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    sprint_repo::get_all_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(db: State<AppDatabase>, dto: CreateProjectDto) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    sprint_repo::create_project(&conn, &dto).map_err(|e| e.to_string())
}

use tauri::State;
use crate::db::AppDatabase;
use crate::models::sprint::{Sprint, Project, CreateSprintDto, CreateProjectDto, UpdateSprintDto, DeleteSprintResult};
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

/// 更新迭代信息 by AI.Coding
#[tauri::command]
pub fn update_sprint(db: State<AppDatabase>, dto: UpdateSprintDto) -> Result<Sprint, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    sprint_repo::update_sprint(&conn, &dto).map_err(|e| e.to_string())
}

/// 删除迭代并解关联任务（事务保护）by AI.Coding
#[tauri::command]
pub fn delete_sprint(db: State<AppDatabase>, id: i64) -> Result<DeleteSprintResult, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    // 检查迭代是否存在
    let sprint = sprint_repo::get_sprint_by_id(&conn, id).map_err(|e| e.to_string())?;
    if sprint.is_none() {
        return Err("迭代不存在".to_string());
    }
    // 先查询关联任务数
    let task_count = sprint_repo::get_task_count_by_sprint(&conn, id).map_err(|e| e.to_string())?;
    // 事务保护：unlink + delete 原子执行
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    let result = (|| -> Result<DeleteSprintResult, String> {
        if task_count > 0 {
            sprint_repo::unlink_tasks_by_sprint(&conn, id).map_err(|e| e.to_string())?;
        }
        sprint_repo::delete_sprint(&conn, id).map_err(|e| e.to_string())?;
        Ok(DeleteSprintResult {
            deleted: true,
            unlinked_tasks: task_count,
        })
    })();
    match result {
        Ok(r) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(r)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
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

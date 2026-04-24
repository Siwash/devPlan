use rusqlite::{params, Connection, Result};
use crate::models::sprint::{Sprint, Project, CreateSprintDto, CreateProjectDto, UpdateSprintDto, DeleteSprintResult};

/// 迭代列表（含关联任务数）by AI.Coding
pub fn get_all_sprints(conn: &Connection) -> Result<Vec<Sprint>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.project_id, s.start_date, s.end_date, s.phase, \
         (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) as task_count \
         FROM sprints s ORDER BY s.name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Sprint {
            id: row.get(0)?,
            name: row.get(1)?,
            project_id: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            phase: row.get(5)?,
            task_count: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn get_sprint_by_id(conn: &Connection, id: i64) -> Result<Option<Sprint>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.project_id, s.start_date, s.end_date, s.phase, \
         (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) as task_count \
         FROM sprints s WHERE s.id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Sprint {
            id: row.get(0)?,
            name: row.get(1)?,
            project_id: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            phase: row.get(5)?,
            task_count: row.get(6)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn find_sprint_by_name(conn: &Connection, name: &str) -> Result<Option<Sprint>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.project_id, s.start_date, s.end_date, s.phase, \
         (SELECT COUNT(*) FROM tasks WHERE sprint_id = s.id) as task_count \
         FROM sprints s WHERE s.name = ?1"
    )?;
    let mut rows = stmt.query_map(params![name], |row| {
        Ok(Sprint {
            id: row.get(0)?,
            name: row.get(1)?,
            project_id: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            phase: row.get(5)?,
            task_count: row.get(6)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn find_or_create_sprint(conn: &Connection, name: &str) -> Result<i64> {
    if let Some(sprint) = find_sprint_by_name(conn, name)? {
        return Ok(sprint.id);
    }
    create_sprint(conn, &CreateSprintDto {
        name: name.to_string(),
        project_id: None,
        start_date: None,
        end_date: None,
        phase: None,
    })
}

/// 创建迭代（名称查重）by AI.Coding
pub fn create_sprint(conn: &Connection, dto: &CreateSprintDto) -> Result<i64> {
    // 名称查重
    if let Some(_) = find_sprint_by_name(conn, &dto.name)? {
        return Err(rusqlite::Error::InvalidParameterName(
            "迭代名称已存在".to_string(),
        ));
    }
    conn.execute(
        "INSERT INTO sprints (name, project_id, start_date, end_date, phase) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![dto.name, dto.project_id, dto.start_date, dto.end_date, dto.phase],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_sprint(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM sprints WHERE id = ?1", params![id])?;
    Ok(())
}

/// 查询迭代关联任务数 by AI.Coding
pub fn get_task_count_by_sprint(conn: &Connection, sprint_id: i64) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE sprint_id = ?1",
        params![sprint_id],
        |row| row.get(0),
    )
}

/// 解除迭代下所有任务的关联 by AI.Coding
pub fn unlink_tasks_by_sprint(conn: &Connection, sprint_id: i64) -> Result<usize> {
    let count = conn.execute(
        "UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ?1",
        params![sprint_id],
    )?;
    Ok(count)
}

/// 更新迭代信息 by AI.Coding
/// 约定：空字符串 "" 表示清空字段（SET NULL），非空字符串表示更新值
pub fn update_sprint(conn: &Connection, dto: &UpdateSprintDto) -> Result<Sprint> {
    // 名称查重：如果传了 name 且与当前不同，检查是否已存在同名迭代
    if let Some(ref name) = dto.name {
        if !name.is_empty() {
            if let Some(existing) = find_sprint_by_name(conn, name)? {
                if existing.id != dto.id {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "迭代名称已存在".to_string(),
                    ));
                }
            }
        }
    }

    // 动态构建 SET 子句，空字符串 "" 视为清空（SET NULL）by AI.Coding
    let mut set_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref name) = dto.name {
        set_clauses.push(format!("name = ?{}", param_idx));
        param_values.push(Box::new(name.clone()));
        param_idx += 1;
    }
    if let Some(ref start_date) = dto.start_date {
        set_clauses.push(format!("start_date = ?{}", param_idx));
        // 空字符串 → NULL
        if start_date.is_empty() {
            param_values.push(Box::new(Option::<String>::None));
        } else {
            param_values.push(Box::new(start_date.clone()));
        }
        param_idx += 1;
    }
    if let Some(ref end_date) = dto.end_date {
        set_clauses.push(format!("end_date = ?{}", param_idx));
        if end_date.is_empty() {
            param_values.push(Box::new(Option::<String>::None));
        } else {
            param_values.push(Box::new(end_date.clone()));
        }
        param_idx += 1;
    }
    if let Some(ref phase) = dto.phase {
        set_clauses.push(format!("phase = ?{}", param_idx));
        if phase.is_empty() {
            param_values.push(Box::new(Option::<String>::None));
        } else {
            param_values.push(Box::new(phase.clone()));
        }
        param_idx += 1;
    }

    if set_clauses.is_empty() {
        return get_sprint_by_id(conn, dto.id)
            .and_then(|opt| opt.ok_or(rusqlite::Error::QueryReturnedNoRows));
    }

    let id_param_idx = param_idx;
    param_values.push(Box::new(dto.id));

    let sql = format!(
        "UPDATE sprints SET {} WHERE id = ?{}",
        set_clauses.join(", "),
        id_param_idx
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;

    get_sprint_by_id(conn, dto.id)?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

// Project operations
pub fn get_all_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, code, description FROM projects ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            code: row.get(2)?,
            description: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn create_project(conn: &Connection, dto: &CreateProjectDto) -> Result<i64> {
    conn.execute(
        "INSERT INTO projects (name, code, description) VALUES (?1, ?2, ?3)",
        params![dto.name, dto.code.clone().unwrap_or_default(), dto.description.clone().unwrap_or_default()],
    )?;
    Ok(conn.last_insert_rowid())
}

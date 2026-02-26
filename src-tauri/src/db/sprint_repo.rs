use rusqlite::{params, Connection, Result};
use crate::models::sprint::{Sprint, Project, CreateSprintDto, CreateProjectDto};

pub fn get_all_sprints(conn: &Connection) -> Result<Vec<Sprint>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_id, start_date, end_date, phase FROM sprints ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Sprint {
            id: row.get(0)?,
            name: row.get(1)?,
            project_id: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            phase: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn get_sprint_by_id(conn: &Connection, id: i64) -> Result<Option<Sprint>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_id, start_date, end_date, phase FROM sprints WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Sprint {
            id: row.get(0)?,
            name: row.get(1)?,
            project_id: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            phase: row.get(5)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn find_sprint_by_name(conn: &Connection, name: &str) -> Result<Option<Sprint>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_id, start_date, end_date, phase FROM sprints WHERE name = ?1"
    )?;
    let mut rows = stmt.query_map(params![name], |row| {
        Ok(Sprint {
            id: row.get(0)?,
            name: row.get(1)?,
            project_id: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            phase: row.get(5)?,
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

pub fn create_sprint(conn: &Connection, dto: &CreateSprintDto) -> Result<i64> {
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

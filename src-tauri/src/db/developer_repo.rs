use rusqlite::{params, Connection, Result};
use crate::models::developer::{Developer, CreateDeveloperDto, UpdateDeveloperDto};

pub fn get_all(conn: &Connection) -> Result<Vec<Developer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, roles, skills, max_hours_per_day, avatar_color, is_active FROM developers ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        let roles_str: String = row.get(2)?;
        let skills_str: String = row.get(3)?;
        Ok(Developer {
            id: row.get(0)?,
            name: row.get(1)?,
            roles: serde_json::from_str(&roles_str).unwrap_or_default(),
            skills: serde_json::from_str(&skills_str).unwrap_or_default(),
            max_hours_per_day: row.get(4)?,
            avatar_color: row.get(5)?,
            is_active: row.get::<_, i32>(6)? != 0,
        })
    })?;
    rows.collect()
}

pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Developer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, roles, skills, max_hours_per_day, avatar_color, is_active FROM developers WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        let roles_str: String = row.get(2)?;
        let skills_str: String = row.get(3)?;
        Ok(Developer {
            id: row.get(0)?,
            name: row.get(1)?,
            roles: serde_json::from_str(&roles_str).unwrap_or_default(),
            skills: serde_json::from_str(&skills_str).unwrap_or_default(),
            max_hours_per_day: row.get(4)?,
            avatar_color: row.get(5)?,
            is_active: row.get::<_, i32>(6)? != 0,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn find_by_name(conn: &Connection, name: &str) -> Result<Option<Developer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, roles, skills, max_hours_per_day, avatar_color, is_active FROM developers WHERE name = ?1"
    )?;
    let mut rows = stmt.query_map(params![name], |row| {
        let roles_str: String = row.get(2)?;
        let skills_str: String = row.get(3)?;
        Ok(Developer {
            id: row.get(0)?,
            name: row.get(1)?,
            roles: serde_json::from_str(&roles_str).unwrap_or_default(),
            skills: serde_json::from_str(&skills_str).unwrap_or_default(),
            max_hours_per_day: row.get(4)?,
            avatar_color: row.get(5)?,
            is_active: row.get::<_, i32>(6)? != 0,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, dto: &CreateDeveloperDto) -> Result<i64> {
    let roles_json = serde_json::to_string(&dto.roles.clone().unwrap_or_default()).unwrap();
    let skills_json = serde_json::to_string(&dto.skills.clone().unwrap_or_default()).unwrap();
    let color = dto.avatar_color.clone().unwrap_or_else(|| "#1890ff".to_string());
    let max_hours = dto.max_hours_per_day.unwrap_or(8.0);

    conn.execute(
        "INSERT INTO developers (name, roles, skills, max_hours_per_day, avatar_color) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![dto.name, roles_json, skills_json, max_hours, color],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn find_or_create_by_name(conn: &Connection, name: &str, color_index: usize) -> Result<i64> {
    if let Some(dev) = find_by_name(conn, name)? {
        return Ok(dev.id);
    }
    let colors = Developer::default_colors();
    let color = colors[color_index % colors.len()];
    let dto = CreateDeveloperDto {
        name: name.to_string(),
        roles: None,
        skills: None,
        max_hours_per_day: None,
        avatar_color: Some(color.to_string()),
    };
    create(conn, &dto)
}

pub fn update(conn: &Connection, dto: &UpdateDeveloperDto) -> Result<()> {
    let current = get_by_id(conn, dto.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    let name = dto.name.as_ref().unwrap_or(&current.name);
    let roles = dto.roles.as_ref().unwrap_or(&current.roles);
    let skills = dto.skills.as_ref().unwrap_or(&current.skills);
    let max_hours = dto.max_hours_per_day.unwrap_or(current.max_hours_per_day);
    let color = dto.avatar_color.as_ref().unwrap_or(&current.avatar_color);
    let active = dto.is_active.unwrap_or(current.is_active);

    let roles_json = serde_json::to_string(roles).unwrap();
    let skills_json = serde_json::to_string(skills).unwrap();

    conn.execute(
        "UPDATE developers SET name=?1, roles=?2, skills=?3, max_hours_per_day=?4, avatar_color=?5, is_active=?6 WHERE id=?7",
        params![name, roles_json, skills_json, max_hours, color, active as i32, dto.id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM developers WHERE id = ?1", params![id])?;
    Ok(())
}

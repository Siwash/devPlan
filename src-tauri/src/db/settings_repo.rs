use rusqlite::{params, Connection, Result};
use crate::models::settings::AppSetting;
use std::collections::HashMap;

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str, category: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value, category, updated_at) VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, category = ?3, updated_at = datetime('now')",
        params![key, value, category],
    )?;
    Ok(())
}

pub fn get_settings_by_category(conn: &Connection, category: &str) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings WHERE category = ?1")?;
    let rows = stmt.query_map(params![category], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn get_all(conn: &Connection) -> Result<Vec<AppSetting>> {
    let mut stmt = conn.prepare("SELECT key, value, category, updated_at FROM app_settings ORDER BY category, key")?;
    let rows = stmt.query_map([], |row| {
        Ok(AppSetting {
            key: row.get(0)?,
            value: row.get(1)?,
            category: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

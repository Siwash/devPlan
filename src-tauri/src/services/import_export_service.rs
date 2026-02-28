use rusqlite::Connection;
use crate::db::{task_repo, developer_repo, sprint_repo};
use crate::models::task::{CreateTaskDto, UpdateTaskDto};
use crate::services::settings_service;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImportResult {
    pub rows_imported: usize,
    pub rows_updated: usize,
    pub rows_skipped: usize,
    pub developers_created: Vec<String>,
    pub sprints_created: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImportConflict {
    pub row_index: usize,
    pub import_name: String,
    pub import_external_id: String,
    pub existing_task_id: i64,
    pub existing_name: String,
    pub existing_external_id: String,
    pub match_type: String, // "external_id" | "name"
}

pub fn detect_import_conflicts(
    conn: &Connection,
    rows: &[std::collections::HashMap<String, String>],
    column_mapping: &std::collections::HashMap<String, String>,
) -> Result<Vec<ImportConflict>, String> {
    let mut conflicts = Vec::new();

    for (idx, row) in rows.iter().enumerate() {
        let get_mapped = |field: &str| -> Option<String> {
            column_mapping.get(field)
                .and_then(|col| row.get(col))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };

        let name = get_mapped("name").unwrap_or_default();
        let external_id = get_mapped("external_id").unwrap_or_default();

        // Check by external_id first
        if !external_id.is_empty() {
            let result = conn.query_row(
                "SELECT id, name, COALESCE(external_id, '') FROM tasks WHERE external_id = ?1",
                rusqlite::params![external_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
            );
            if let Ok((task_id, existing_name, existing_ext_id)) = result {
                conflicts.push(ImportConflict {
                    row_index: idx,
                    import_name: name.clone(),
                    import_external_id: external_id.clone(),
                    existing_task_id: task_id,
                    existing_name,
                    existing_external_id: existing_ext_id,
                    match_type: "external_id".to_string(),
                });
                continue;
            }
        }

        // Check by name
        if !name.is_empty() {
            let result = conn.query_row(
                "SELECT id, name, COALESCE(external_id, '') FROM tasks WHERE name = ?1",
                rusqlite::params![name],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
            );
            if let Ok((task_id, existing_name, existing_ext_id)) = result {
                conflicts.push(ImportConflict {
                    row_index: idx,
                    import_name: name.clone(),
                    import_external_id: external_id.clone(),
                    existing_task_id: task_id,
                    existing_name,
                    existing_external_id: existing_ext_id,
                    match_type: "name".to_string(),
                });
            }
        }
    }

    Ok(conflicts)
}

pub fn import_tasks_from_rows(
    conn: &Connection,
    rows: &[std::collections::HashMap<String, String>],
    column_mapping: &std::collections::HashMap<String, String>,
    conflict_mode: &str,
) -> Result<ImportResult, String> {
    let mut result = ImportResult {
        rows_imported: 0,
        rows_updated: 0,
        rows_skipped: 0,
        developers_created: Vec::new(),
        sprints_created: Vec::new(),
        errors: Vec::new(),
    };

    let mut dev_color_index = 0usize;

    // Read hours_per_day from settings (default 8)
    let hours_per_day = settings_service::get_setting(conn, "work_hours.hours_per_day")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(8.0);

    for (idx, row) in rows.iter().enumerate() {
        let get_mapped = |field: &str| -> Option<String> {
            column_mapping.get(field)
                .and_then(|col| row.get(col))
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };

        let name = match get_mapped("name") {
            Some(n) => n,
            None => {
                result.errors.push(format!("Row {}: missing task name", idx + 1));
                continue;
            }
        };

        // Check for existing task when conflict_mode is not "create_new"
        let existing_task_id = if conflict_mode != "create_new" {
            find_existing_task(conn, &get_mapped("external_id"), &name)
        } else {
            None
        };

        // Handle conflict modes
        if let Some(task_id) = existing_task_id {
            match conflict_mode {
                "skip" => {
                    result.rows_skipped += 1;
                    continue;
                }
                "update" => {
                    // Resolve owner for update
                    let owner_id = if let Some(owner_name) = get_mapped("owner") {
                        match developer_repo::find_or_create_by_name(conn, &owner_name, dev_color_index) {
                            Ok(id) => {
                                if developer_repo::find_by_name(conn, &owner_name)
                                    .ok()
                                    .flatten()
                                    .is_some()
                                {
                                    // Already existed
                                } else {
                                    result.developers_created.push(owner_name.clone());
                                }
                                dev_color_index += 1;
                                Some(id)
                            }
                            Err(e) => {
                                result.errors.push(format!("Row {}: failed to create developer '{}': {}", idx + 1, owner_name, e));
                                None
                            }
                        }
                    } else {
                        None
                    };

                    // Resolve sprint for update
                    let sprint_id = if let Some(sprint_name) = get_mapped("sprint") {
                        match sprint_repo::find_or_create_sprint(conn, &sprint_name) {
                            Ok(id) => {
                                result.sprints_created.push(sprint_name.clone());
                                Some(id)
                            }
                            Err(e) => {
                                result.errors.push(format!("Row {}: failed to create sprint '{}': {}", idx + 1, sprint_name, e));
                                None
                            }
                        }
                    } else {
                        None
                    };

                    let update_dto = UpdateTaskDto {
                        id: task_id,
                        external_id: get_mapped("external_id"),
                        task_type: get_mapped("task_type"),
                        name: Some(name),
                        description: get_mapped("description"),
                        owner_id,
                        sprint_id,
                        priority: get_mapped("priority"),
                        planned_start: get_mapped("planned_start"),
                        planned_end: get_mapped("planned_end"),
                        planned_hours: get_mapped("planned_hours").and_then(|h| parse_days_to_hours(&h, hours_per_day)),
                        parent_task_id: None,
                        parent_number: get_mapped("parent_number"),
                        parent_name: get_mapped("parent_name"),
                        status: get_mapped("status"),
                        co_owner_ids: None,
                    };

                    match task_repo::update(conn, &update_dto) {
                        Ok(_) => result.rows_updated += 1,
                        Err(e) => result.errors.push(format!("Row {}: failed to update task: {}", idx + 1, e)),
                    }
                    continue;
                }
                _ => {} // "create_new" - fall through to create
            }
        }

        // Resolve owner
        let owner_id = if let Some(owner_name) = get_mapped("owner") {
            match developer_repo::find_or_create_by_name(conn, &owner_name, dev_color_index) {
                Ok(id) => {
                    if developer_repo::find_by_name(conn, &owner_name)
                        .ok()
                        .flatten()
                        .is_some()
                    {
                        // Already existed
                    } else {
                        result.developers_created.push(owner_name.clone());
                    }
                    dev_color_index += 1;
                    Some(id)
                }
                Err(e) => {
                    result.errors.push(format!("Row {}: failed to create developer '{}': {}", idx + 1, owner_name, e));
                    None
                }
            }
        } else {
            None
        };

        // Resolve sprint
        let sprint_id = if let Some(sprint_name) = get_mapped("sprint") {
            match sprint_repo::find_or_create_sprint(conn, &sprint_name) {
                Ok(id) => {
                    result.sprints_created.push(sprint_name.clone());
                    Some(id)
                }
                Err(e) => {
                    result.errors.push(format!("Row {}: failed to create sprint '{}': {}", idx + 1, sprint_name, e));
                    None
                }
            }
        } else {
            None
        };

        let dto = CreateTaskDto {
            external_id: get_mapped("external_id"),
            task_type: get_mapped("task_type"),
            name,
            description: get_mapped("description"),
            owner_id,
            sprint_id,
            priority: get_mapped("priority"),
            planned_start: get_mapped("planned_start"),
            planned_end: get_mapped("planned_end"),
            planned_hours: get_mapped("planned_hours").and_then(|h| parse_days_to_hours(&h, hours_per_day)),
            parent_task_id: None,
            parent_number: get_mapped("parent_number"),
            parent_name: get_mapped("parent_name"),
            status: get_mapped("status"),
            co_owner_ids: None,
        };

        match task_repo::create(conn, &dto) {
            Ok(_) => result.rows_imported += 1,
            Err(e) => result.errors.push(format!("Row {}: failed to insert task: {}", idx + 1, e)),
        }
    }

    // Record import history
    let mapping_json = serde_json::to_string(column_mapping).unwrap_or_default();
    let total_affected = (result.rows_imported + result.rows_updated) as i64;
    let _ = conn.execute(
        "INSERT INTO import_history (file_name, import_date, column_mapping, rows_imported) VALUES (?1, datetime('now'), ?2, ?3)",
        rusqlite::params!["excel_import", mapping_json, total_affected],
    );

    // Deduplicate
    result.developers_created.sort();
    result.developers_created.dedup();
    result.sprints_created.sort();
    result.sprints_created.dedup();

    Ok(result)
}

/// Find an existing task by external_id or name.
/// Returns the task id if found.
fn find_existing_task(conn: &Connection, external_id: &Option<String>, name: &str) -> Option<i64> {
    // Try by external_id first
    if let Some(ref ext_id) = external_id {
        if !ext_id.is_empty() {
            if let Ok(id) = conn.query_row(
                "SELECT id FROM tasks WHERE external_id = ?1",
                rusqlite::params![ext_id],
                |row| row.get::<_, i64>(0),
            ) {
                return Some(id);
            }
        }
    }
    // Try by name
    if !name.is_empty() {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM tasks WHERE name = ?1",
            rusqlite::params![name],
            |row| row.get::<_, i64>(0),
        ) {
            return Some(id);
        }
    }
    None
}

/// Parse a days value from Excel to hours (1 day = 8 hours).
/// Handles formats: "1", "0.5", "2天", "1.5 天", "1day", "0.5 days", etc.
fn parse_days_to_hours(raw: &str, hours_per_day: f64) -> Option<f64> {
    let cleaned = raw
        .replace("天", "")
        .replace("day", "")
        .replace("days", "")
        .replace("d", "")
        .replace("D", "")
        .trim()
        .to_string();
    let days = cleaned.parse::<f64>().ok()?;
    if days < 0.0 {
        return None;
    }
    Some(days * hours_per_day)
}

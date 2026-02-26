use rusqlite::Connection;
use crate::db::{task_repo, developer_repo, sprint_repo};
use crate::models::task::CreateTaskDto;
use crate::services::settings_service;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImportResult {
    pub rows_imported: usize,
    pub developers_created: Vec<String>,
    pub sprints_created: Vec<String>,
    pub errors: Vec<String>,
}

pub fn import_tasks_from_rows(
    conn: &Connection,
    rows: &[std::collections::HashMap<String, String>],
    column_mapping: &std::collections::HashMap<String, String>,
) -> Result<ImportResult, String> {
    let mut result = ImportResult {
        rows_imported: 0,
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
    let _ = conn.execute(
        "INSERT INTO import_history (file_name, import_date, column_mapping, rows_imported) VALUES (?1, datetime('now'), ?2, ?3)",
        rusqlite::params!["excel_import", mapping_json, result.rows_imported as i64],
    );

    // Deduplicate
    result.developers_created.sort();
    result.developers_created.dedup();
    result.sprints_created.sort();
    result.sprints_created.dedup();

    Ok(result)
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

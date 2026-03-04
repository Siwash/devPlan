use crate::db::task_repo;
use crate::models::task::TaskFilter;
use crate::services::settings_service;
use rusqlite::Connection;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};
use std::collections::HashSet;

const DEFAULT_EXPORT_COLUMNS: [&str; 14] = [
    "task_type",
    "external_id",
    "name",
    "description",
    "owner_name",
    "co_owners",
    "sprint_name",
    "priority",
    "planned_start",
    "planned_end",
    "planned_hours",
    "parent_number",
    "parent_name",
    "status",
];

fn export_label(key: &str) -> &'static str {
    match key {
        "task_type" => "Task类型",
        "external_id" => "编号",
        "name" => "名称",
        "description" => "详细描述",
        "owner_name" => "负责人",
        "co_owners" => "其他负责人",
        "sprint_name" => "所属迭代",
        "priority" => "优先级",
        "planned_start" => "计划开始时间",
        "planned_end" => "计划结束时间",
        "planned_hours" => "计划工作量",
        "parent_number" => "父级编号",
        "parent_name" => "父级项名称",
        "status" => "进度",
        _ => "",
    }
}

fn export_width(key: &str) -> f64 {
    match key {
        "task_type" => 12.0,
        "external_id" => 15.0,
        "name" => 30.0,
        "description" => 40.0,
        "owner_name" => 10.0,
        "co_owners" => 20.0,
        "sprint_name" => 12.0,
        "priority" => 8.0,
        "planned_start" => 14.0,
        "planned_end" => 14.0,
        "planned_hours" => 12.0,
        "parent_number" => 12.0,
        "parent_name" => 18.0,
        "status" => 10.0,
        _ => 12.0,
    }
}

fn is_date_column(key: &str) -> bool {
    matches!(key, "planned_start" | "planned_end")
}

fn resolve_export_columns(conn: &Connection) -> Vec<String> {
    let configured = settings_service::get_excel_template_config(conn)
        .ok()
        .flatten()
        .and_then(|c| c.export_columns);

    let mut seen = HashSet::new();
    let mut output = Vec::new();
    let source = configured.unwrap_or_else(|| {
        DEFAULT_EXPORT_COLUMNS
            .iter()
            .map(|s| (*s).to_string())
            .collect()
    });

    for key in source {
        if export_label(&key).is_empty() {
            continue;
        }
        if seen.insert(key.clone()) {
            output.push(key);
        }
    }

    if output.is_empty() {
        return DEFAULT_EXPORT_COLUMNS
            .iter()
            .map(|s| (*s).to_string())
            .collect();
    }
    output
}

pub fn export_tasks_to_excel(
    conn: &Connection,
    file_path: &str,
    filter: &TaskFilter,
) -> Result<String, String> {
    let tasks = task_repo::get_all(conn, filter).map_err(|e| e.to_string())?;

    // Read work hours display settings
    let display_unit = settings_service::get_setting(conn, "work_hours.display_unit")
        .ok()
        .flatten()
        .unwrap_or_else(|| "day".to_string());
    let hours_per_day = settings_service::get_setting(conn, "work_hours.hours_per_day")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(8.0);

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Task").map_err(|e| e.to_string())?;

    // Header format
    let header_format = Format::new()
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_background_color(Color::RGB(0x4472C4))
        .set_font_color(Color::White)
        .set_border(FormatBorder::Thin);

    let cell_format = Format::new().set_border(FormatBorder::Thin).set_text_wrap();

    let date_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("yyyy-mm-dd");

    let export_columns = resolve_export_columns(conn);

    for (col, key) in export_columns.iter().enumerate() {
        worksheet
            .write_string_with_format(0, col as u16, export_label(key), &header_format)
            .map_err(|e| e.to_string())?;
    }

    for (col, key) in export_columns.iter().enumerate() {
        worksheet
            .set_column_width(col as u16, export_width(key))
            .map_err(|e| e.to_string())?;
    }

    // Data rows
    for (row_idx, task) in tasks.iter().enumerate() {
        let row = (row_idx + 1) as u32;

        let write_cell =
            |ws: &mut rust_xlsxwriter::Worksheet, col: u16, val: &str| -> Result<(), String> {
                ws.write_string_with_format(row, col, val, &cell_format)
                    .map_err(|e| e.to_string())?;
                Ok(())
            };

        for (col_idx, key) in export_columns.iter().enumerate() {
            let col = col_idx as u16;
            match key.as_str() {
                "task_type" => write_cell(worksheet, col, task.task_type.as_deref().unwrap_or(""))?,
                "external_id" => {
                    write_cell(worksheet, col, task.external_id.as_deref().unwrap_or(""))?
                }
                "name" => write_cell(worksheet, col, &task.name)?,
                "description" => {
                    write_cell(worksheet, col, task.description.as_deref().unwrap_or(""))?
                }
                "owner_name" => {
                    write_cell(worksheet, col, task.owner_name.as_deref().unwrap_or(""))?
                }
                "co_owners" => {
                    let co = task
                        .co_owners
                        .as_ref()
                        .map(|list| {
                            list.iter()
                                .map(|c| c.developer_name.clone())
                                .collect::<Vec<_>>()
                                .join("、")
                        })
                        .unwrap_or_default();
                    write_cell(worksheet, col, &co)?;
                }
                "sprint_name" => {
                    write_cell(worksheet, col, task.sprint_name.as_deref().unwrap_or(""))?
                }
                "priority" => write_cell(worksheet, col, task.priority.as_deref().unwrap_or(""))?,
                "planned_start" => {
                    worksheet
                        .write_string_with_format(
                            row,
                            col,
                            task.planned_start.as_deref().unwrap_or(""),
                            &date_format,
                        )
                        .map_err(|e| e.to_string())?;
                }
                "planned_end" => {
                    worksheet
                        .write_string_with_format(
                            row,
                            col,
                            task.planned_end.as_deref().unwrap_or(""),
                            &date_format,
                        )
                        .map_err(|e| e.to_string())?;
                }
                "planned_hours" => {
                    if let Some(hours) = task.planned_hours {
                        let val = if display_unit == "hour" {
                            hours
                        } else {
                            hours / hours_per_day
                        };
                        worksheet
                            .write_number_with_format(row, col, val, &cell_format)
                            .map_err(|e| e.to_string())?;
                    }
                }
                "parent_number" => {
                    write_cell(worksheet, col, task.parent_number.as_deref().unwrap_or(""))?
                }
                "parent_name" => {
                    write_cell(worksheet, col, task.parent_name.as_deref().unwrap_or(""))?
                }
                "status" => write_cell(worksheet, col, task.status.as_deref().unwrap_or(""))?,
                _ => {
                    if is_date_column(key) {
                        worksheet
                            .write_string_with_format(row, col, "", &date_format)
                            .map_err(|e| e.to_string())?;
                    } else {
                        write_cell(worksheet, col, "")?;
                    }
                }
            }
        }
    }

    workbook.save(file_path).map_err(|e| e.to_string())?;

    Ok(file_path.to_string())
}

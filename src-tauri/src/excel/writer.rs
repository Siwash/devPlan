use rust_xlsxwriter::{Workbook, Format, FormatAlign, FormatBorder, Color};
use rusqlite::Connection;
use crate::db::task_repo;
use crate::models::task::TaskFilter;

pub fn export_tasks_to_excel(
    conn: &Connection,
    file_path: &str,
    filter: &TaskFilter,
) -> Result<String, String> {
    let tasks = task_repo::get_all(conn, filter).map_err(|e| e.to_string())?;

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

    let cell_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_text_wrap();

    let date_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("yyyy-mm-dd");

    // Headers
    let headers = [
        "类型", "编号", "名称", "描述", "负责人", "迭代",
        "优先级", "计划开始", "计划结束", "计划工时", "状态",
    ];

    for (col, header) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *header, &header_format)
            .map_err(|e| e.to_string())?;
    }

    // Set column widths
    let widths = [12.0, 15.0, 30.0, 40.0, 10.0, 12.0, 8.0, 12.0, 12.0, 10.0, 10.0];
    for (col, width) in widths.iter().enumerate() {
        worksheet.set_column_width(col as u16, *width)
            .map_err(|e| e.to_string())?;
    }

    // Data rows
    for (row_idx, task) in tasks.iter().enumerate() {
        let row = (row_idx + 1) as u32;

        let write_cell = |ws: &mut rust_xlsxwriter::Worksheet, col: u16, val: &str| -> Result<(), String> {
            ws.write_string_with_format(row, col, val, &cell_format)
                .map_err(|e| e.to_string())?;
            Ok(())
        };

        write_cell(worksheet, 0, task.task_type.as_deref().unwrap_or(""))?;
        write_cell(worksheet, 1, task.external_id.as_deref().unwrap_or(""))?;
        write_cell(worksheet, 2, &task.name)?;
        write_cell(worksheet, 3, task.description.as_deref().unwrap_or(""))?;
        write_cell(worksheet, 4, task.owner_name.as_deref().unwrap_or(""))?;
        write_cell(worksheet, 5, task.sprint_name.as_deref().unwrap_or(""))?;
        write_cell(worksheet, 6, task.priority.as_deref().unwrap_or(""))?;

        worksheet.write_string_with_format(row, 7, task.planned_start.as_deref().unwrap_or(""), &date_format)
            .map_err(|e| e.to_string())?;
        worksheet.write_string_with_format(row, 8, task.planned_end.as_deref().unwrap_or(""), &date_format)
            .map_err(|e| e.to_string())?;

        if let Some(hours) = task.planned_hours {
            worksheet.write_number_with_format(row, 9, hours, &cell_format)
                .map_err(|e| e.to_string())?;
        }

        write_cell(worksheet, 10, task.status.as_deref().unwrap_or(""))?;
    }

    workbook.save(file_path).map_err(|e| e.to_string())?;

    Ok(file_path.to_string())
}

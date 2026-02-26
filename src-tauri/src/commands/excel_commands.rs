use tauri::State;
use crate::db::AppDatabase;
use crate::excel::reader::{ExcelFileInfo, read_excel_info, read_sheet_data, read_sheet_as_maps};
use crate::excel::smart_matcher::{SheetScore, ColumnMatch, score_sheets, match_columns};
use crate::excel::writer::export_tasks_to_excel;
use crate::services::import_export_service::{ImportResult, import_tasks_from_rows};
use crate::models::task::TaskFilter;
use std::collections::HashMap;

#[tauri::command]
pub fn analyze_excel(file_path: String) -> Result<ExcelFileInfo, String> {
    read_excel_info(&file_path)
}

#[tauri::command]
pub fn score_excel_sheets(file_path: String) -> Result<Vec<SheetScore>, String> {
    let info = read_excel_info(&file_path)?;
    Ok(score_sheets(&info.sheets))
}

#[tauri::command]
pub fn match_excel_columns(
    file_path: String,
    sheet_name: String,
) -> Result<Vec<ColumnMatch>, String> {
    let (headers, rows) = read_sheet_data(&file_path, &sheet_name)?;
    let sample: Vec<Vec<String>> = rows.into_iter().take(20).collect();
    Ok(match_columns(&headers, &sample))
}

#[tauri::command]
pub fn preview_excel_import(
    file_path: String,
    sheet_name: String,
    limit: Option<usize>,
) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let (headers, rows) = read_sheet_data(&file_path, &sheet_name)?;
    let limited_rows: Vec<Vec<String>> = rows.into_iter().take(limit.unwrap_or(20)).collect();
    Ok((headers, limited_rows))
}

#[tauri::command]
pub fn import_excel(
    db: State<AppDatabase>,
    file_path: String,
    sheet_name: String,
    column_mapping: HashMap<String, String>,
) -> Result<ImportResult, String> {
    let (_, rows) = read_sheet_as_maps(&file_path, &sheet_name)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    import_tasks_from_rows(&conn, &rows, &column_mapping)
}

#[tauri::command]
pub fn export_excel(
    db: State<AppDatabase>,
    file_path: String,
    filter: TaskFilter,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    export_tasks_to_excel(&conn, &file_path, &filter)
}

#[tauri::command]
pub fn get_import_history(db: State<AppDatabase>) -> Result<Vec<serde_json::Value>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, file_name, file_path, import_date, sheet_name, column_mapping, rows_imported FROM import_history ORDER BY import_date DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "file_name": row.get::<_, String>(1)?,
            "file_path": row.get::<_, Option<String>>(2)?,
            "import_date": row.get::<_, String>(3)?,
            "sheet_name": row.get::<_, Option<String>>(4)?,
            "column_mapping": row.get::<_, Option<String>>(5)?,
            "rows_imported": row.get::<_, i64>(6)?,
        }))
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

use calamine::{Reader, open_workbook, Xlsx, Data, Range};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetInfo {
    pub name: String,
    pub row_count: usize,
    pub col_count: usize,
    pub headers: Vec<String>,
    pub sample_rows: Vec<Vec<String>>,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelFileInfo {
    pub file_name: String,
    pub sheets: Vec<SheetInfo>,
}

pub fn read_excel_info(file_path: &str) -> Result<ExcelFileInfo, String> {
    let path = Path::new(file_path);
    let file_name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let mut sheets = Vec::new();

    for name in &sheet_names {
        if let Ok(range) = workbook.worksheet_range(name) {
            let sheet_info = parse_sheet_info(name, &range);
            sheets.push(sheet_info);
        }
    }

    Ok(ExcelFileInfo { file_name, sheets })
}

fn parse_sheet_info(name: &str, range: &Range<Data>) -> SheetInfo {
    let (row_count, col_count) = range.get_size();

    let headers: Vec<String> = if row_count > 0 {
        (0..col_count)
            .map(|c| cell_to_string(range.get((0, c))))
            .collect()
    } else {
        Vec::new()
    };

    let sample_rows: Vec<Vec<String>> = (1..std::cmp::min(21, row_count))
        .map(|r| {
            (0..col_count)
                .map(|c| cell_to_string(range.get((r, c))))
                .collect()
        })
        .collect();

    SheetInfo {
        name: name.to_string(),
        row_count: if row_count > 0 { row_count - 1 } else { 0 },
        col_count,
        headers,
        sample_rows,
        is_hidden: false,
    }
}

pub fn read_sheet_data(
    file_path: &str,
    sheet_name: &str,
) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let path = Path::new(file_path);
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let range = workbook.worksheet_range(sheet_name)
        .map_err(|e| format!("Failed to read sheet '{}': {}", sheet_name, e))?;

    let (row_count, col_count) = range.get_size();
    if row_count == 0 {
        return Ok((Vec::new(), Vec::new()));
    }

    let headers: Vec<String> = (0..col_count)
        .map(|c| cell_to_string(range.get((0, c))))
        .collect();

    let rows: Vec<Vec<String>> = (1..row_count)
        .map(|r| {
            (0..col_count)
                .map(|c| cell_to_string(range.get((r, c))))
                .collect()
        })
        .collect();

    Ok((headers, rows))
}

pub fn read_sheet_as_maps(
    file_path: &str,
    sheet_name: &str,
) -> Result<(Vec<String>, Vec<HashMap<String, String>>), String> {
    let (headers, rows) = read_sheet_data(file_path, sheet_name)?;

    let maps: Vec<HashMap<String, String>> = rows.iter().map(|row| {
        let mut map = HashMap::new();
        for (i, header) in headers.iter().enumerate() {
            if let Some(val) = row.get(i) {
                map.insert(header.clone(), val.clone());
            }
        }
        map
    }).collect();

    Ok((headers, maps))
}

fn cell_to_string(cell: Option<&Data>) -> String {
    match cell {
        Some(Data::String(s)) => s.clone(),
        Some(Data::Float(f)) => {
            if *f == (*f as i64) as f64 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Some(Data::Int(i)) => format!("{}", i),
        Some(Data::Bool(b)) => format!("{}", b),
        Some(Data::DateTime(dt)) => {
            if let Some(date) = excel_date_to_string(dt.as_f64()) {
                date
            } else {
                format!("{}", dt)
            }
        }
        Some(Data::DateTimeIso(s)) => s.clone(),
        Some(Data::DurationIso(s)) => s.clone(),
        Some(Data::Error(e)) => format!("ERROR: {:?}", e),
        Some(Data::Empty) | None => String::new(),
    }
}

fn excel_date_to_string(serial: f64) -> Option<String> {
    if serial < 1.0 {
        return None;
    }
    let days = serial as i64;
    let adjusted = if days > 59 { days - 1 } else { days };
    let base = chrono::NaiveDate::from_ymd_opt(1899, 12, 31)?;
    let date = base + chrono::Duration::days(adjusted);
    Some(date.format("%Y-%m-%d").to_string())
}

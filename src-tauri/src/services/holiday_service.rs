use rusqlite::Connection;
use chrono::{NaiveDate, Datelike};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct HolidayApiResponse {
    code: i32,
    holiday: Option<HashMap<String, HolidayEntry>>,
}

#[derive(Debug, Deserialize)]
struct HolidayEntry {
    holiday: bool,   // true = day off, false = makeup workday
    name: String,
    date: String,
}

/// Sync holiday data for a given year from timor.tech API and cache in DB.
pub fn sync_holidays_for_year(conn: &Connection, year: i32) -> Result<usize, String> {
    let url = format!("https://timor.tech/api/holiday/year/{}", year);

    let resp: HolidayApiResponse = ureq::get(&url)
        .call()
        .map_err(|e| format!("HTTP request failed: {}", e))?
        .into_json()
        .map_err(|e| format!("JSON parse failed: {}", e))?;

    if resp.code != 0 {
        return Err(format!("API returned error code: {}", resp.code));
    }

    let holidays = resp.holiday.unwrap_or_default();

    // Clear existing cache for this year
    conn.execute("DELETE FROM holiday_cache WHERE year = ?1", rusqlite::params![year])
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    for (_key, entry) in &holidays {
        // entry.holiday == true means it's a day off (holiday)
        // entry.holiday == false means it's a makeup workday (补班, weekend but work)
        let is_holiday = if entry.holiday { 1 } else { 0 };
        let is_workday = if entry.holiday { 0 } else { 1 };

        conn.execute(
            "INSERT OR REPLACE INTO holiday_cache (date, is_holiday, is_workday, name, year) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![entry.date, is_holiday, is_workday, entry.name, year],
        ).map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

/// Check if a date is a workday considering Chinese holidays.
/// Logic:
/// 1. If the date is in holiday_cache with is_holiday=1, it's NOT a workday (holiday on a weekday)
/// 2. If the date is in holiday_cache with is_workday=1, it IS a workday (makeup work on weekend)
/// 3. Otherwise, fall back to Mon-Fri = workday, Sat-Sun = not workday
pub fn is_workday(conn: &Connection, date: &NaiveDate) -> bool {
    let date_str = date.format("%Y-%m-%d").to_string();

    // Check cache first
    let result: Option<(i32, i32)> = conn.query_row(
        "SELECT is_holiday, is_workday FROM holiday_cache WHERE date = ?1",
        rusqlite::params![date_str],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).ok();

    if let Some((is_holiday, is_makeup_workday)) = result {
        if is_holiday == 1 {
            return false; // It's a holiday, not a workday
        }
        if is_makeup_workday == 1 {
            return true; // It's a makeup workday (e.g., Saturday but work)
        }
    }

    // Fallback: simple weekday check
    date.weekday().num_days_from_monday() < 5
}

/// Count working days between two dates (inclusive) considering holidays.
pub fn count_working_days(conn: &Connection, start: &NaiveDate, end: &NaiveDate) -> i64 {
    let mut count = 0i64;
    let mut current = *start;
    while current <= *end {
        if is_workday(conn, &current) {
            count += 1;
        }
        current += chrono::Duration::days(1);
    }
    count.max(1)
}

/// Ensure holiday data is cached for the years covered by a date range.
/// Auto-syncs any missing years.
pub fn ensure_holidays_cached(conn: &Connection, start: &NaiveDate, end: &NaiveDate) {
    let start_year = start.year();
    let end_year = end.year();

    for year in start_year..=end_year {
        // Check if we already have data for this year
        let cached: i64 = conn.query_row(
            "SELECT COUNT(*) FROM holiday_cache WHERE year = ?1",
            rusqlite::params![year],
            |row| row.get(0),
        ).unwrap_or(0);

        if cached == 0 {
            // Try to sync; if it fails (no network), just log and continue
            match sync_holidays_for_year(conn, year) {
                Ok(n) => log::info!("Synced {} holiday entries for year {}", n, year),
                Err(e) => log::warn!("Failed to sync holidays for {}: {}", year, e),
            }
        }
    }
}

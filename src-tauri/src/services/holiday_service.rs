use rusqlite::Connection;
use chrono::{NaiveDate, Datelike};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

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

/// Read overtime configuration from app_settings.
/// Returns (weekend_mode, custom_dates_set).
fn read_overtime_config(conn: &Connection) -> (String, HashSet<String>) {
    let json_str: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'schedule.overtime_days'",
            [],
            |row| row.get(0),
        )
        .ok();

    match json_str {
        Some(s) => {
            #[derive(Deserialize)]
            struct OvertimeCfg {
                weekend: Option<String>,
                custom_dates: Option<Vec<String>>,
            }
            if let Ok(cfg) = serde_json::from_str::<OvertimeCfg>(&s) {
                let weekend = cfg.weekend.unwrap_or_else(|| "none".to_string());
                let dates: HashSet<String> = cfg
                    .custom_dates
                    .unwrap_or_default()
                    .into_iter()
                    .collect();
                (weekend, dates)
            } else {
                ("none".to_string(), HashSet::new())
            }
        }
        None => ("none".to_string(), HashSet::new()),
    }
}

/// Check if a date is a workday considering Chinese holidays and overtime config.
/// Priority: holiday_cache > overtime config > default Mon-Fri
/// 1. holiday_cache hit: is_holiday=1 → false, is_workday=1 → true
/// 2. overtime config: weekend match or custom_dates match → true
/// 3. Fallback: Mon-Fri = workday
pub fn is_workday(conn: &Connection, date: &NaiveDate) -> bool {
    let date_str = date.format("%Y-%m-%d").to_string();

    // Check holiday cache first (highest priority)
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

    // Check overtime config (second priority)
    let (weekend_mode, custom_dates) = read_overtime_config(conn);
    let weekday = date.weekday().num_days_from_monday(); // 0=Mon .. 6=Sun

    // Check weekend overtime
    if weekday == 5 && (weekend_mode == "saturday" || weekend_mode == "both") {
        return true;
    }
    if weekday == 6 && (weekend_mode == "sunday" || weekend_mode == "both") {
        return true;
    }

    // Check custom overtime dates
    if custom_dates.contains(&date_str) {
        return true;
    }

    // Fallback: simple weekday check
    weekday < 5
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

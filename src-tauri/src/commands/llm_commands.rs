use crate::db::AppDatabase;
use crate::db::{developer_repo, sprint_repo, task_repo};
use crate::llm::adapter::{
    ChatAction, ChatMessage, LlmChatResponse, ScheduleSuggestion, TaskGroup,
};
use crate::llm::openai_adapter::OpenAiCompatibleAdapter;
use crate::models::task::{TaskFilter, UpdateTaskDto};
use crate::services::{holiday_service, llm_service, settings_service};
use chrono::{Duration, Local, NaiveDate};
use std::collections::{HashMap, HashSet};
use tauri::State;

const DEFAULT_HOURS_PER_DAY: f64 = 8.0;
const ALLOC_EPSILON: f64 = 1e-6;
const MAX_SCHEDULE_DAYS_SCAN: i64 = 3650;

#[tauri::command]
pub fn llm_chat(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    user_message: String,
    history: Vec<ChatMessage>,
) -> Result<LlmChatResponse, String> {
    // Scoped DB lock — read all needed data then release
    let (config, developers, sprints, task_count, tasks, hours_per_day) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?
            .ok_or("LLM 未配置，请先在设置中填写 API Key")?;
        let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
        let sprints = sprint_repo::get_all_sprints(&conn).map_err(|e| e.to_string())?;
        let task_count = task_repo::count_tasks(&conn).map_err(|e| e.to_string())?;
        let tasks = task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let hours_per_day = settings_service::get_setting(&conn, "work_hours.hours_per_day")
            .ok()
            .flatten()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(8.0);
        (
            config,
            developers,
            sprints,
            task_count,
            tasks,
            hours_per_day,
        )
    }; // DB lock released here

    llm_service::chat_with_context_stream(
        &config,
        &user_message,
        &history,
        &app_handle,
        &developers,
        &sprints,
        task_count,
        &tasks,
        hours_per_day,
    )
}

#[tauri::command]
pub fn llm_execute_action(db: State<AppDatabase>, action: ChatAction) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
    let sprints = sprint_repo::get_all_sprints(&conn).map_err(|e| e.to_string())?;
    llm_service::execute_chat_action(&conn, &action, &developers, &sprints)
}

#[tauri::command]
pub fn llm_smart_schedule(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    task_ids: Vec<i64>,
    _sprint_id: Option<i64>,
) -> Result<Vec<ScheduleSuggestion>, String> {
    // Scoped DB lock — read all needed data then release
    let (config, tasks, all_tasks, developers, hours_per_day) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?.ok_or("LLM 未配置")?;
        let all_tasks =
            task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let tasks: Vec<_> = all_tasks
            .iter()
            .filter(|t| task_ids.contains(&t.id))
            .cloned()
            .collect();
        let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
        let hours_per_day = settings_service::get_setting(&conn, "work_hours.hours_per_day")
            .ok()
            .flatten()
            .and_then(|v| v.parse::<f64>().ok())
            .filter(|v| *v > 0.0)
            .unwrap_or(DEFAULT_HOURS_PER_DAY);
        (config, tasks, all_tasks, developers, hours_per_day)
    }; // DB lock released here

    let raw = llm_service::ai_smart_schedule(
        &config,
        &tasks,
        &developers,
        hours_per_day,
        Some(&app_handle),
    )?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    Ok(normalize_schedule_suggestions(
        &conn,
        &tasks,
        &all_tasks,
        &developers,
        &raw,
        hours_per_day,
    ))
}

#[tauri::command]
pub fn llm_identify_similar_tasks(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    task_ids: Vec<i64>,
) -> Result<Vec<TaskGroup>, String> {
    // Scoped DB lock — read all needed data then release
    let (config, tasks) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?.ok_or("LLM 未配置")?;
        let all_tasks =
            task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let tasks: Vec<_> = all_tasks
            .into_iter()
            .filter(|t| task_ids.contains(&t.id))
            .collect();
        (config, tasks)
    }; // DB lock released here

    llm_service::ai_identify_similar_tasks(&config, &tasks, Some(&app_handle))
}

#[tauri::command]
pub fn llm_auto_fill_tasks(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    task_ids: Vec<i64>,
) -> Result<Vec<UpdateTaskDto>, String> {
    // Scoped DB lock — read all needed data then release
    let (config, tasks, all_tasks, developers, hours_per_day) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?.ok_or("LLM 未配置")?;
        let all_tasks =
            task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let tasks: Vec<_> = all_tasks
            .iter()
            .filter(|t| task_ids.contains(&t.id))
            .cloned()
            .collect();
        let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
        let hours_per_day = settings_service::get_setting(&conn, "work_hours.hours_per_day")
            .ok()
            .flatten()
            .and_then(|v| v.parse::<f64>().ok())
            .filter(|v| *v > 0.0)
            .unwrap_or(DEFAULT_HOURS_PER_DAY);
        (config, tasks, all_tasks, developers, hours_per_day)
    }; // DB lock released here

    let raw = llm_service::ai_auto_fill_tasks(
        &config,
        &tasks,
        &developers,
        hours_per_day,
        Some(&app_handle),
    )?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    Ok(normalize_auto_fill_updates(
        &conn,
        &tasks,
        &all_tasks,
        &developers,
        &raw,
        hours_per_day,
    ))
}

#[tauri::command]
pub fn llm_test_connection(db: State<AppDatabase>) -> Result<String, String> {
    // Scoped DB lock — only read config
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        settings_service::get_llm_config(&conn)?.ok_or("LLM 未配置，请先在设置中填写 API Key")?
    }; // DB lock released here

    let adapter = OpenAiCompatibleAdapter::new(&config);
    adapter.chat_completion(
        &[ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        }],
        None,
    )?;
    Ok("连接成功".to_string())
}

#[derive(Debug, Clone)]
struct ProposedAssignment {
    task_id: i64,
    developer_id: i64,
    suggested_start: Option<NaiveDate>,
    reasoning: String,
}

fn parse_ymd(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

fn next_workday(conn: &rusqlite::Connection, mut date: NaiveDate) -> NaiveDate {
    let mut scanned = 0i64;
    while scanned < MAX_SCHEDULE_DAYS_SCAN {
        if holiday_service::is_workday(conn, &date) {
            return date;
        }
        date += Duration::days(1);
        scanned += 1;
    }
    date
}

fn list_workdays(conn: &rusqlite::Connection, start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
    let mut days = Vec::new();
    let mut d = start;
    while d <= end {
        if holiday_service::is_workday(conn, &d) {
            days.push(d);
        }
        d += Duration::days(1);
    }
    days
}

fn build_existing_daily_load(
    conn: &rusqlite::Connection,
    all_tasks: &[crate::models::task::Task],
    exclude_task_ids: &HashSet<i64>,
) -> HashMap<(i64, NaiveDate), f64> {
    let mut load: HashMap<(i64, NaiveDate), f64> = HashMap::new();

    for t in all_tasks {
        if exclude_task_ids.contains(&t.id) {
            continue;
        }
        if matches!(t.status.as_deref(), Some("已取消")) {
            continue;
        }

        let Some(owner_id) = t.owner_id else { continue };
        let Some(start_str) = t.planned_start.as_deref() else {
            continue;
        };
        let Some(end_str) = t.planned_end.as_deref() else {
            continue;
        };
        let Some(start) = parse_ymd(start_str) else {
            continue;
        };
        let Some(end) = parse_ymd(end_str) else {
            continue;
        };
        if end < start {
            continue;
        }

        let hours = t.planned_hours.unwrap_or(0.0);
        if hours <= ALLOC_EPSILON {
            continue;
        }

        let workdays = list_workdays(conn, start, end);
        if workdays.is_empty() {
            continue;
        }

        let daily = hours / (workdays.len() as f64);
        for d in workdays {
            *load.entry((owner_id, d)).or_insert(0.0) += daily;
        }
    }

    load
}

fn choose_fallback_developer_id(
    developers: &[crate::models::developer::Developer],
    hours_per_day: f64,
) -> Option<i64> {
    developers
        .iter()
        .filter(|d| d.is_active)
        .max_by(|a, b| {
            let ah = if a.max_hours_per_day > 0.0 {
                a.max_hours_per_day
            } else {
                hours_per_day
            };
            let bh = if b.max_hours_per_day > 0.0 {
                b.max_hours_per_day
            } else {
                hours_per_day
            };
            ah.partial_cmp(&bh).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|d| d.id)
}

fn normalize_assignments(
    conn: &rusqlite::Connection,
    selected_tasks: &[crate::models::task::Task],
    all_tasks: &[crate::models::task::Task],
    developers: &[crate::models::developer::Developer],
    proposals: &[ProposedAssignment],
    hours_per_day: f64,
) -> Vec<ScheduleSuggestion> {
    if selected_tasks.is_empty() {
        return Vec::new();
    }

    let today = Local::now().date_naive();
    holiday_service::ensure_holidays_cached(conn, &today, &(today + Duration::days(730)));

    let selected_ids: HashSet<i64> = selected_tasks.iter().map(|t| t.id).collect();
    let mut load_map = build_existing_daily_load(conn, all_tasks, &selected_ids);

    let mut dev_capacity: HashMap<i64, f64> = HashMap::new();
    for d in developers.iter().filter(|d| d.is_active) {
        let cap = if d.max_hours_per_day > 0.0 {
            d.max_hours_per_day
        } else {
            hours_per_day
        };
        dev_capacity.insert(d.id, cap.max(0.1));
    }

    let fallback_dev_id = choose_fallback_developer_id(developers, hours_per_day);

    let mut proposal_map: HashMap<i64, ProposedAssignment> = HashMap::new();
    for p in proposals {
        proposal_map.insert(p.task_id, p.clone());
    }

    let mut ordered_ids: Vec<i64> = selected_tasks.iter().map(|t| t.id).collect();
    ordered_ids.sort_by_key(|task_id| {
        proposal_map
            .get(task_id)
            .and_then(|p| p.suggested_start)
            .unwrap_or(today)
    });

    let task_map: HashMap<i64, &crate::models::task::Task> =
        selected_tasks.iter().map(|t| (t.id, t)).collect();

    let mut result = Vec::new();

    for task_id in ordered_ids {
        let Some(task) = task_map.get(&task_id) else {
            continue;
        };
        let proposal = proposal_map.get(&task_id);

        let proposed_dev = proposal.map(|p| p.developer_id).or(task.owner_id);
        let developer_id = proposed_dev
            .filter(|id| dev_capacity.contains_key(id))
            .or(fallback_dev_id)
            .unwrap_or(0);

        if developer_id <= 0 {
            continue;
        }

        let mut cursor = proposal
            .and_then(|p| p.suggested_start)
            .or_else(|| task.planned_start.as_deref().and_then(parse_ymd))
            .unwrap_or(today);

        if cursor < today {
            cursor = today;
        }
        cursor = next_workday(conn, cursor);

        let max_h = dev_capacity
            .get(&developer_id)
            .copied()
            .unwrap_or(hours_per_day.max(0.1));

        let mut remaining = task.planned_hours.unwrap_or(0.0).max(0.0);
        let mut first_day: Option<NaiveDate> = None;
        let mut last_day: Option<NaiveDate> = None;
        let mut scanned = 0i64;

        if remaining <= ALLOC_EPSILON {
            first_day = Some(cursor);
            last_day = Some(cursor);
        } else {
            while remaining > ALLOC_EPSILON && scanned < MAX_SCHEDULE_DAYS_SCAN {
                if !holiday_service::is_workday(conn, &cursor) {
                    cursor += Duration::days(1);
                    scanned += 1;
                    continue;
                }

                let key = (developer_id, cursor);
                let used = *load_map.get(&key).unwrap_or(&0.0);
                let capacity = (max_h - used).max(0.0);

                if capacity > ALLOC_EPSILON {
                    let alloc = remaining.min(capacity);
                    *load_map.entry(key).or_insert(0.0) += alloc;
                    remaining -= alloc;
                    if first_day.is_none() {
                        first_day = Some(cursor);
                    }
                    last_day = Some(cursor);
                }

                cursor += Duration::days(1);
                scanned += 1;
            }
        }

        let start = first_day.unwrap_or_else(|| next_workday(conn, today));
        let end = last_day.unwrap_or(start);

        let mut reasoning = proposal
            .map(|p| p.reasoning.clone())
            .unwrap_or_else(|| "按容量自动分配".to_string());
        reasoning.push_str("（已按每日容量归一化）");

        result.push(ScheduleSuggestion {
            task_id,
            developer_id,
            planned_start: start.format("%Y-%m-%d").to_string(),
            planned_end: end.format("%Y-%m-%d").to_string(),
            reasoning,
        });
    }

    result
}

fn normalize_schedule_suggestions(
    conn: &rusqlite::Connection,
    selected_tasks: &[crate::models::task::Task],
    all_tasks: &[crate::models::task::Task],
    developers: &[crate::models::developer::Developer],
    raw: &[ScheduleSuggestion],
    hours_per_day: f64,
) -> Vec<ScheduleSuggestion> {
    let proposals: Vec<ProposedAssignment> = raw
        .iter()
        .map(|s| ProposedAssignment {
            task_id: s.task_id,
            developer_id: s.developer_id,
            suggested_start: parse_ymd(&s.planned_start),
            reasoning: s.reasoning.clone(),
        })
        .collect();

    normalize_assignments(
        conn,
        selected_tasks,
        all_tasks,
        developers,
        &proposals,
        hours_per_day,
    )
}

fn normalize_auto_fill_updates(
    conn: &rusqlite::Connection,
    selected_tasks: &[crate::models::task::Task],
    all_tasks: &[crate::models::task::Task],
    developers: &[crate::models::developer::Developer],
    raw: &[UpdateTaskDto],
    hours_per_day: f64,
) -> Vec<UpdateTaskDto> {
    let proposals: Vec<ProposedAssignment> = raw
        .iter()
        .map(|u| ProposedAssignment {
            task_id: u.id,
            developer_id: u.owner_id.unwrap_or(0),
            suggested_start: u.planned_start.as_deref().and_then(parse_ymd),
            reasoning: "自动分配".to_string(),
        })
        .collect();

    let normalized = normalize_assignments(
        conn,
        selected_tasks,
        all_tasks,
        developers,
        &proposals,
        hours_per_day,
    );

    normalized
        .into_iter()
        .map(|s| UpdateTaskDto {
            id: s.task_id,
            external_id: None,
            task_type: None,
            name: None,
            description: None,
            owner_id: Some(s.developer_id),
            sprint_id: None,
            priority: None,
            planned_start: Some(s.planned_start),
            planned_end: Some(s.planned_end),
            planned_hours: None,
            parent_task_id: None,
            parent_number: None,
            parent_name: None,
            status: None,
            co_owner_ids: None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init;
    use crate::models::developer::Developer;
    use crate::models::task::Task;
    use chrono::Datelike;
    use rusqlite::{params, Connection};

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        init::create_tables(&conn).expect("create tables");
        init::run_migrations(&conn).expect("run migrations");

        let today = Local::now().date_naive();
        let years = [today.year(), (today + Duration::days(370)).year()];
        for year in years {
            let seed_date = format!("{}-01-01", year);
            conn.execute(
                "INSERT OR REPLACE INTO holiday_cache (date, is_holiday, is_workday, name, year) VALUES (?1, 0, 1, 'seed', ?2)",
                params![seed_date, year],
            )
            .expect("seed holiday cache");
        }

        conn
    }

    fn make_dev(id: i64, max_h: f64) -> Developer {
        Developer {
            id,
            name: format!("Dev-{}", id),
            roles: vec![],
            skills: vec![],
            max_hours_per_day: max_h,
            avatar_color: "#1890ff".to_string(),
            is_active: true,
        }
    }

    fn make_task(
        id: i64,
        owner_id: Option<i64>,
        planned_hours: f64,
        planned_start: Option<String>,
        planned_end: Option<String>,
    ) -> Task {
        Task {
            id,
            external_id: None,
            task_type: Some("代码开发".to_string()),
            name: format!("Task-{}", id),
            description: None,
            owner_id,
            owner_name: owner_id.map(|oid| format!("Dev-{}", oid)),
            sprint_id: None,
            sprint_name: None,
            priority: Some("P1".to_string()),
            planned_start,
            planned_end,
            planned_hours: Some(planned_hours),
            parent_task_id: None,
            parent_number: None,
            parent_name: None,
            status: Some("待开始".to_string()),
            co_owners: None,
        }
    }

    fn nth_workday_from(conn: &Connection, mut start: NaiveDate, mut offset: usize) -> NaiveDate {
        start = next_workday(conn, start);
        while offset > 0 {
            start += Duration::days(1);
            start = next_workday(conn, start);
            offset -= 1;
        }
        start
    }

    #[test]
    fn normalize_schedule_should_expand_duration_by_daily_capacity() {
        let conn = setup_conn();
        let today = Local::now().date_naive();
        let first_workday = next_workday(&conn, today);

        let developers = vec![make_dev(1, 8.0)];
        let selected = vec![make_task(101, Some(1), 24.0, None, None)];
        let all_tasks = selected.clone();

        let raw = vec![ScheduleSuggestion {
            task_id: 101,
            developer_id: 1,
            planned_start: first_workday.format("%Y-%m-%d").to_string(),
            planned_end: first_workday.format("%Y-%m-%d").to_string(),
            reasoning: "llm".to_string(),
        }];

        let normalized =
            normalize_schedule_suggestions(&conn, &selected, &all_tasks, &developers, &raw, 8.0);
        assert_eq!(normalized.len(), 1);

        let s = &normalized[0];
        let start = parse_ymd(&s.planned_start).expect("valid start");
        let end = parse_ymd(&s.planned_end).expect("valid end");
        let days = list_workdays(&conn, start, end);

        assert_eq!(days.len(), 3, "24h at 8h/day must span 3 workdays");
    }

    #[test]
    fn normalize_schedule_should_skip_fully_loaded_day() {
        let conn = setup_conn();
        let today = Local::now().date_naive();
        let day1 = next_workday(&conn, today);
        let day2 = nth_workday_from(&conn, day1, 1);
        let day3 = nth_workday_from(&conn, day1, 2);

        let developers = vec![make_dev(1, 8.0)];
        let selected = vec![make_task(201, Some(1), 16.0, None, None)];

        // Existing task fully occupies day1 (8h)
        let existing = make_task(
            999,
            Some(1),
            8.0,
            Some(day1.format("%Y-%m-%d").to_string()),
            Some(day1.format("%Y-%m-%d").to_string()),
        );

        let mut all_tasks = vec![existing];
        all_tasks.extend(selected.clone());

        let raw = vec![ScheduleSuggestion {
            task_id: 201,
            developer_id: 1,
            planned_start: day1.format("%Y-%m-%d").to_string(),
            planned_end: day1.format("%Y-%m-%d").to_string(),
            reasoning: "llm".to_string(),
        }];

        let normalized =
            normalize_schedule_suggestions(&conn, &selected, &all_tasks, &developers, &raw, 8.0);
        assert_eq!(normalized.len(), 1);

        let s = &normalized[0];
        assert_eq!(s.planned_start, day2.format("%Y-%m-%d").to_string());
        assert_eq!(s.planned_end, day3.format("%Y-%m-%d").to_string());
    }
}

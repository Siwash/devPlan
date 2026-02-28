use std::collections::HashSet;
use rusqlite::Connection;
use chrono::NaiveDate;
use crate::db::{task_repo, developer_repo};
use crate::models::calendar::{CalendarEvent, CalendarResource, DeveloperWorkload, WorkloadTask, CalendarEventExtProps};
use crate::models::task::Task;
use crate::services::holiday_service;

/// Internal struct for tracking per-task allocation state
struct TaskSlot {
    task_id: i64,
    task_name: String,
    remaining: f64,
    start: NaiveDate,
    end: NaiveDate,
}

/// Get calendar events for a date range, optionally filtered by developer
pub fn get_calendar_events(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
    developer_id: Option<i64>,
) -> Result<Vec<CalendarEvent>, String> {
    // Ensure holiday data is cached for the date range
    if let (Ok(s), Ok(e)) = (
        NaiveDate::parse_from_str(start_date, "%Y-%m-%d"),
        NaiveDate::parse_from_str(end_date, "%Y-%m-%d"),
    ) {
        holiday_service::ensure_holidays_cached(conn, &s, &e);
    }

    let tasks = if let Some(dev_id) = developer_id {
        task_repo::get_tasks_for_developer_in_range(conn, dev_id, start_date, end_date)
    } else {
        task_repo::get_tasks_in_date_range(conn, start_date, end_date)
    }.map_err(|e| e.to_string())?;

    let events: Vec<CalendarEvent> = tasks.iter().map(|task| {
        let color = task_type_color(task.task_type.as_deref());
        CalendarEvent {
            id: format!("task-{}", task.id),
            title: format!("{}{}", task.name,
                task.owner_name.as_ref().map(|n| format!(" [{}]", n)).unwrap_or_default()),
            start: task.planned_start.clone().unwrap_or_default(),
            end: task.planned_end.clone().map(|d| {
                // FullCalendar end date is exclusive, add one day
                if let Ok(date) = NaiveDate::parse_from_str(&d, "%Y-%m-%d") {
                    (date + chrono::Duration::days(1)).format("%Y-%m-%d").to_string()
                } else {
                    d
                }
            }),
            resource_id: task.owner_id.map(|id| id.to_string()),
            color: Some(color.to_string()),
            ext_props: Some(CalendarEventExtProps {
                task_id: task.id,
                task_type: task.task_type.clone(),
                priority: task.priority.clone(),
                status: task.status.clone(),
                owner_id: task.owner_id,
                owner_name: task.owner_name.clone(),
                planned_hours: task.planned_hours,
                sprint_id: task.sprint_id,
                sprint_name: task.sprint_name.clone(),
            }),
        }
    }).collect();

    Ok(events)
}

/// Get calendar resources (developers)
pub fn get_calendar_resources(conn: &Connection) -> Result<Vec<CalendarResource>, String> {
    let developers = developer_repo::get_all(conn).map_err(|e| e.to_string())?;
    Ok(developers.iter().filter(|d| d.is_active).map(|d| {
        CalendarResource {
            id: d.id.to_string(),
            title: d.name.clone(),
            avatar_color: Some(d.avatar_color.clone()),
        }
    }).collect())
}

/// Get developer workload using EDF (Earliest Deadline First) load-balanced allocation.
///
/// Algorithm: process working days in order. For each day, find active tasks
/// sorted by end date (earliest first). Allocate min(remaining, capacity) to each
/// task in priority order. On a task's last working day, force-allocate all remaining
/// hours. This naturally balances load across days:
///   - 1.5d (12h) task over 2 days = 8h + 4h (front-loaded)
///   - Two overlapping 1.5d tasks = 8h, 8h, 8h (balanced across 3 days)
pub fn get_developer_workload(
    conn: &Connection,
    developer_id: i64,
    start_date: &str,
    end_date: &str,
    include_overtime: bool,
) -> Result<Vec<DeveloperWorkload>, String> {
    let developer = developer_repo::get_by_id(conn, developer_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Developer not found".to_string())?;

    let tasks = task_repo::get_tasks_for_developer_in_range(conn, developer_id, start_date, end_date)
        .map_err(|e| e.to_string())?;

    let view_start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|e| e.to_string())?;
    let view_end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
        .map_err(|e| e.to_string())?;

    // Build task slots with remaining hours
    let mut slots: Vec<TaskSlot> = tasks.iter().filter_map(|t| {
        let hours = t.planned_hours.unwrap_or(0.0);
        if hours <= 0.0 { return None; }
        let ts = NaiveDate::parse_from_str(t.planned_start.as_ref()?, "%Y-%m-%d").ok()?;
        let te = NaiveDate::parse_from_str(t.planned_end.as_ref()?, "%Y-%m-%d").ok()?;
        Some(TaskSlot { task_id: t.id, task_name: t.name.clone(), remaining: hours, start: ts, end: te })
    }).collect();

    if slots.is_empty() {
        return Ok(Vec::new());
    }

    // Find the earliest task start — may be before view range.
    // We must simulate allocation from there so front-loading is correct.
    let earliest_start = slots.iter().map(|s| s.start).min().unwrap();
    let process_start = earliest_start.min(view_start);

    // Ensure holidays cached for the full processing range
    let latest_end = slots.iter().map(|s| s.end).max().unwrap().max(view_end);
    holiday_service::ensure_holidays_cached(conn, &process_start, &latest_end);

    // Build overtime day set: non-workdays that have tasks scheduled
    let overtime_set: HashSet<NaiveDate> = if include_overtime {
        let mut set = HashSet::new();
        for slot in &slots {
            let mut d = slot.start;
            while d <= slot.end {
                if !holiday_service::is_workday(conn, &d) {
                    set.insert(d);
                }
                d += chrono::Duration::days(1);
            }
        }
        set
    } else {
        HashSet::new()
    };

    // Local helpers that account for overtime days
    let is_effective_workday = |date: &NaiveDate| -> bool {
        holiday_service::is_workday(conn, date) || overtime_set.contains(date)
    };
    let count_effective_workdays = |start: &NaiveDate, end: &NaiveDate| -> i64 {
        let mut count = 0i64;
        let mut cur = *start;
        while cur <= *end {
            if is_effective_workday(&cur) {
                count += 1;
            }
            cur += chrono::Duration::days(1);
        }
        count
    };

    let max_h = developer.max_hours_per_day;
    let mut workloads = Vec::new();
    let mut current = process_start;

    while current <= view_end {
        if !is_effective_workday(&current) {
            current += chrono::Duration::days(1);
            continue;
        }

        let is_overtime_day = overtime_set.contains(&current);

        // Collect active task indices, sorted by end date (earliest deadline first)
        let mut active: Vec<usize> = (0..slots.len())
            .filter(|&i| slots[i].remaining > 0.0 && current >= slots[i].start && current <= slots[i].end)
            .collect();
        active.sort_by_key(|&i| slots[i].end);

        let mut capacity = max_h;
        let mut daily_tasks: Vec<WorkloadTask> = Vec::new();
        let mut total_hours = 0.0;

        for &idx in &active {
            let remaining_workdays = count_effective_workdays(&current, &slots[idx].end);
            let is_last_day = remaining_workdays <= 1;

            let alloc = if is_last_day {
                // Last working day: must take all remaining (may exceed capacity)
                slots[idx].remaining
            } else {
                // Front-load: take as much as capacity allows
                slots[idx].remaining.min(capacity.max(0.0))
            };

            if alloc > 0.0 {
                // Only record in output if within view range
                if current >= view_start {
                    daily_tasks.push(WorkloadTask {
                        task_id: slots[idx].task_id,
                        task_name: slots[idx].task_name.clone(),
                        daily_hours: alloc,
                    });
                    total_hours += alloc;
                }
                slots[idx].remaining -= alloc;
                capacity -= alloc;
            }
        }

        if current >= view_start {
            workloads.push(DeveloperWorkload {
                developer_id,
                developer_name: developer.name.clone(),
                date: current.format("%Y-%m-%d").to_string(),
                allocated_hours: total_hours,
                max_hours: max_h,
                available_hours: (max_h - total_hours).max(0.0),
                tasks: daily_tasks,
                is_overtime: is_overtime_day,
            });
        }

        current += chrono::Duration::days(1);
    }

    Ok(workloads)
}

fn task_type_color(task_type: Option<&str>) -> &'static str {
    match task_type {
        Some("需求澄清") => "#1890ff",
        Some("技术预研") => "#722ed1",
        Some("产品设计") => "#13c2c2",
        Some("UE设计") => "#eb2f96",
        Some("架构设计") => "#fa8c16",
        Some("详细设计") => "#a0d911",
        Some("代码开发") => "#52c41a",
        Some("代码检查") => "#2f54eb",
        Some("演示") => "#fadb14",
        Some("用例设计") => "#f5222d",
        Some("测试执行") => "#faad14",
        Some("应用检查") => "#ff7a45",
        Some("JIRA BUG") => "#f5222d",
        _ => "#1890ff",
    }
}

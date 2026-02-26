use rusqlite::{params, Connection, Result};
use crate::models::task::{Task, CoOwner, CreateTaskDto, UpdateTaskDto, TaskFilter};

pub fn get_all(conn: &Connection, filter: &TaskFilter) -> Result<Vec<Task>> {
    let mut sql = String::from(
        "SELECT t.id, t.external_id, t.task_type, t.name, t.description, t.owner_id, d.name as owner_name, \
         t.sprint_id, s.name as sprint_name, t.priority, t.planned_start, t.planned_end, \
         t.planned_hours, t.parent_task_id, t.status \
         FROM tasks t \
         LEFT JOIN developers d ON t.owner_id = d.id \
         LEFT JOIN sprints s ON t.sprint_id = s.id \
         WHERE 1=1"
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref sprint_id) = filter.sprint_id {
        sql.push_str(&format!(" AND t.sprint_id = ?{}", param_idx));
        param_values.push(Box::new(*sprint_id));
        param_idx += 1;
    }
    if let Some(ref owner_id) = filter.owner_id {
        sql.push_str(&format!(" AND t.owner_id = ?{}", param_idx));
        param_values.push(Box::new(*owner_id));
        param_idx += 1;
    }
    if let Some(ref status) = filter.status {
        sql.push_str(&format!(" AND t.status = ?{}", param_idx));
        param_values.push(Box::new(status.clone()));
        param_idx += 1;
    }
    if let Some(ref task_type) = filter.task_type {
        sql.push_str(&format!(" AND t.task_type = ?{}", param_idx));
        param_values.push(Box::new(task_type.clone()));
        param_idx += 1;
    }
    if let Some(ref priority) = filter.priority {
        sql.push_str(&format!(" AND t.priority = ?{}", param_idx));
        param_values.push(Box::new(priority.clone()));
        param_idx += 1;
    }
    if let Some(ref search) = filter.search {
        sql.push_str(&format!(" AND (t.name LIKE ?{} OR t.description LIKE ?{} OR t.external_id LIKE ?{})", param_idx, param_idx, param_idx));
        param_values.push(Box::new(format!("%{}%", search)));
        let _ = param_idx;
    }

    sql.push_str(" ORDER BY t.id DESC");

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Task {
            id: row.get(0)?,
            external_id: row.get(1)?,
            task_type: row.get(2)?,
            name: row.get(3)?,
            description: row.get(4)?,
            owner_id: row.get(5)?,
            owner_name: row.get(6)?,
            sprint_id: row.get(7)?,
            sprint_name: row.get(8)?,
            priority: row.get(9)?,
            planned_start: row.get(10)?,
            planned_end: row.get(11)?,
            planned_hours: row.get(12)?,
            parent_task_id: row.get(13)?,
            status: row.get(14)?,
            co_owners: None,
        })
    })?;

    let mut tasks: Vec<Task> = rows.collect::<Result<Vec<_>>>()?;

    // Load co-owners for each task
    for task in &mut tasks {
        task.co_owners = Some(get_co_owners(conn, task.id)?);
    }

    Ok(tasks)
}

pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Task>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.external_id, t.task_type, t.name, t.description, t.owner_id, d.name as owner_name, \
         t.sprint_id, s.name as sprint_name, t.priority, t.planned_start, t.planned_end, \
         t.planned_hours, t.parent_task_id, t.status \
         FROM tasks t \
         LEFT JOIN developers d ON t.owner_id = d.id \
         LEFT JOIN sprints s ON t.sprint_id = s.id \
         WHERE t.id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Task {
            id: row.get(0)?,
            external_id: row.get(1)?,
            task_type: row.get(2)?,
            name: row.get(3)?,
            description: row.get(4)?,
            owner_id: row.get(5)?,
            owner_name: row.get(6)?,
            sprint_id: row.get(7)?,
            sprint_name: row.get(8)?,
            priority: row.get(9)?,
            planned_start: row.get(10)?,
            planned_end: row.get(11)?,
            planned_hours: row.get(12)?,
            parent_task_id: row.get(13)?,
            status: row.get(14)?,
            co_owners: None,
        })
    })?;

    match rows.next() {
        Some(row) => {
            let mut task = row?;
            task.co_owners = Some(get_co_owners(conn, task.id)?);
            Ok(Some(task))
        }
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, dto: &CreateTaskDto) -> Result<i64> {
    conn.execute(
        "INSERT INTO tasks (external_id, task_type, name, description, owner_id, sprint_id, priority, \
         planned_start, planned_end, planned_hours, parent_task_id, status) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            dto.external_id, dto.task_type, dto.name, dto.description,
            dto.owner_id, dto.sprint_id, dto.priority,
            dto.planned_start, dto.planned_end, dto.planned_hours,
            dto.parent_task_id, dto.status.as_deref().unwrap_or("待开始")
        ],
    )?;
    let task_id = conn.last_insert_rowid();

    if let Some(ref co_owner_ids) = dto.co_owner_ids {
        for dev_id in co_owner_ids {
            conn.execute(
                "INSERT OR IGNORE INTO task_co_owners (task_id, developer_id) VALUES (?1, ?2)",
                params![task_id, dev_id],
            )?;
        }
    }

    Ok(task_id)
}

pub fn update(conn: &Connection, dto: &UpdateTaskDto) -> Result<()> {
    let current = get_by_id(conn, dto.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;

    conn.execute(
        "UPDATE tasks SET external_id=?1, task_type=?2, name=?3, description=?4, owner_id=?5, \
         sprint_id=?6, priority=?7, planned_start=?8, planned_end=?9, planned_hours=?10, \
         parent_task_id=?11, status=?12 WHERE id=?13",
        params![
            dto.external_id.as_ref().or(current.external_id.as_ref()),
            dto.task_type.as_ref().or(current.task_type.as_ref()),
            dto.name.as_ref().unwrap_or(&current.name),
            dto.description.as_ref().or(current.description.as_ref()),
            dto.owner_id.or(current.owner_id),
            dto.sprint_id.or(current.sprint_id),
            dto.priority.as_ref().or(current.priority.as_ref()),
            dto.planned_start.as_ref().or(current.planned_start.as_ref()),
            dto.planned_end.as_ref().or(current.planned_end.as_ref()),
            dto.planned_hours.or(current.planned_hours),
            dto.parent_task_id.or(current.parent_task_id),
            dto.status.as_ref().or(current.status.as_ref()),
            dto.id
        ],
    )?;

    if let Some(ref co_owner_ids) = dto.co_owner_ids {
        conn.execute("DELETE FROM task_co_owners WHERE task_id = ?1", params![dto.id])?;
        for dev_id in co_owner_ids {
            conn.execute(
                "INSERT OR IGNORE INTO task_co_owners (task_id, developer_id) VALUES (?1, ?2)",
                params![dto.id, dev_id],
            )?;
        }
    }

    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM task_co_owners WHERE task_id = ?1", params![id])?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_co_owners(conn: &Connection, task_id: i64) -> Result<Vec<CoOwner>> {
    let mut stmt = conn.prepare(
        "SELECT tc.developer_id, d.name FROM task_co_owners tc \
         JOIN developers d ON tc.developer_id = d.id WHERE tc.task_id = ?1"
    )?;
    let rows = stmt.query_map(params![task_id], |row| {
        Ok(CoOwner {
            developer_id: row.get(0)?,
            developer_name: row.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn get_tasks_for_developer_in_range(
    conn: &Connection,
    developer_id: i64,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.external_id, t.task_type, t.name, t.description, t.owner_id, d.name as owner_name, \
         t.sprint_id, s.name as sprint_name, t.priority, t.planned_start, t.planned_end, \
         t.planned_hours, t.parent_task_id, t.status \
         FROM tasks t \
         LEFT JOIN developers d ON t.owner_id = d.id \
         LEFT JOIN sprints s ON t.sprint_id = s.id \
         WHERE t.owner_id = ?1 \
         AND t.planned_start IS NOT NULL AND t.planned_end IS NOT NULL \
         AND t.planned_start <= ?3 AND t.planned_end >= ?2 \
         AND t.status NOT IN ('已取消') \
         ORDER BY t.planned_start"
    )?;
    let rows = stmt.query_map(params![developer_id, start_date, end_date], |row| {
        Ok(Task {
            id: row.get(0)?,
            external_id: row.get(1)?,
            task_type: row.get(2)?,
            name: row.get(3)?,
            description: row.get(4)?,
            owner_id: row.get(5)?,
            owner_name: row.get(6)?,
            sprint_id: row.get(7)?,
            sprint_name: row.get(8)?,
            priority: row.get(9)?,
            planned_start: row.get(10)?,
            planned_end: row.get(11)?,
            planned_hours: row.get(12)?,
            parent_task_id: row.get(13)?,
            status: row.get(14)?,
            co_owners: None,
        })
    })?;
    rows.collect()
}

pub fn count_tasks(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
}

pub fn get_tasks_in_date_range(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.external_id, t.task_type, t.name, t.description, t.owner_id, d.name as owner_name, \
         t.sprint_id, s.name as sprint_name, t.priority, t.planned_start, t.planned_end, \
         t.planned_hours, t.parent_task_id, t.status \
         FROM tasks t \
         LEFT JOIN developers d ON t.owner_id = d.id \
         LEFT JOIN sprints s ON t.sprint_id = s.id \
         WHERE t.planned_start IS NOT NULL AND t.planned_end IS NOT NULL \
         AND t.planned_start <= ?2 AND t.planned_end >= ?1 \
         AND t.status NOT IN ('已取消') \
         ORDER BY t.planned_start"
    )?;
    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok(Task {
            id: row.get(0)?,
            external_id: row.get(1)?,
            task_type: row.get(2)?,
            name: row.get(3)?,
            description: row.get(4)?,
            owner_id: row.get(5)?,
            owner_name: row.get(6)?,
            sprint_id: row.get(7)?,
            sprint_name: row.get(8)?,
            priority: row.get(9)?,
            planned_start: row.get(10)?,
            planned_end: row.get(11)?,
            planned_hours: row.get(12)?,
            parent_task_id: row.get(13)?,
            status: row.get(14)?,
            co_owners: None,
        })
    })?;
    rows.collect()
}

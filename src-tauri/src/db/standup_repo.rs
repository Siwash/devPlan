use rusqlite::{params, Connection, Result};
use crate::models::standup::{
    StandupMeeting, StandupEntry, SaveStandupRequest,
};

pub fn get_meeting_by_date(conn: &Connection, date: &str) -> Result<Option<StandupMeeting>> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_date, notes, created_at FROM standup_meetings WHERE meeting_date = ?1"
    )?;
    let mut rows = stmt.query_map(params![date], |row| {
        Ok(StandupMeeting {
            id: row.get(0)?,
            meeting_date: row.get(1)?,
            notes: row.get(2)?,
            created_at: row.get(3)?,
            entries: vec![],
        })
    })?;

    let meeting = match rows.next() {
        Some(row) => Some(row?),
        None => return Ok(None),
    };

    let mut meeting = meeting.unwrap();
    meeting.entries = get_entries_for_meeting(conn, meeting.id)?;
    Ok(Some(meeting))
}

fn get_entries_for_meeting(conn: &Connection, meeting_id: i64) -> Result<Vec<StandupEntry>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.meeting_id, e.developer_id, d.name, e.done_items, e.plan_items, e.blockers
         FROM standup_entries e
         JOIN developers d ON d.id = e.developer_id
         WHERE e.meeting_id = ?1
         ORDER BY d.name"
    )?;
    let rows = stmt.query_map(params![meeting_id], |row| {
        let done_str: String = row.get(4)?;
        let plan_str: String = row.get(5)?;
        let blockers_str: String = row.get(6)?;
        Ok(StandupEntry {
            id: row.get(0)?,
            meeting_id: row.get(1)?,
            developer_id: row.get(2)?,
            developer_name: row.get(3)?,
            done_items: serde_json::from_str(&done_str).unwrap_or_default(),
            plan_items: serde_json::from_str(&plan_str).unwrap_or_default(),
            blockers: serde_json::from_str(&blockers_str).unwrap_or_default(),
        })
    })?;

    let mut entries: Vec<StandupEntry> = Vec::new();
    for row in rows {
        let mut entry = row?;
        // Load task links for this entry
        load_task_links(conn, &mut entry)?;
        entries.push(entry);
    }
    Ok(entries)
}

fn load_task_links(conn: &Connection, entry: &mut StandupEntry) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT task_id, link_type FROM standup_task_links WHERE entry_id = ?1"
    )?;
    let links: Vec<(i64, String)> = stmt.query_map(params![entry.id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?.collect::<Result<Vec<_>>>()?;

    for (task_id, link_type) in links {
        let items = match link_type.as_str() {
            "done" => &mut entry.done_items,
            "plan" => &mut entry.plan_items,
            "blocker" => &mut entry.blockers,
            _ => continue,
        };
        for item in items.iter_mut() {
            if item.task_id == Some(task_id) {
                break;
            }
        }
    }

    Ok(())
}

pub fn save_meeting(conn: &Connection, request: &SaveStandupRequest) -> Result<i64> {
    // Use a transaction
    let tx = conn.unchecked_transaction()?;

    // Upsert meeting
    tx.execute(
        "INSERT INTO standup_meetings (meeting_date, notes)
         VALUES (?1, ?2)
         ON CONFLICT(meeting_date) DO UPDATE SET notes = excluded.notes",
        params![request.meeting_date, request.notes],
    )?;

    let meeting_id: i64 = tx.query_row(
        "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
        params![request.meeting_date],
        |row| row.get(0),
    )?;

    // Delete old entries (cascade will delete task_links)
    tx.execute(
        "DELETE FROM standup_entries WHERE meeting_id = ?1",
        params![meeting_id],
    )?;

    // Insert new entries
    for entry_req in &request.entries {
        let done_json = serde_json::to_string(&entry_req.done_items).unwrap_or_else(|_| "[]".to_string());
        let plan_json = serde_json::to_string(&entry_req.plan_items).unwrap_or_else(|_| "[]".to_string());
        let blockers_json = serde_json::to_string(&entry_req.blockers).unwrap_or_else(|_| "[]".to_string());

        tx.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![meeting_id, entry_req.developer_id, done_json, plan_json, blockers_json],
        )?;

        let entry_id = tx.last_insert_rowid();

        // Insert task links for done_items
        for item in &entry_req.done_items {
            if let Some(task_id) = item.task_id {
                tx.execute(
                    "INSERT INTO standup_task_links (entry_id, task_id, link_type) VALUES (?1, ?2, ?3)",
                    params![entry_id, task_id, "done"],
                )?;
            }
        }

        // Insert task links for plan_items
        for item in &entry_req.plan_items {
            if let Some(task_id) = item.task_id {
                tx.execute(
                    "INSERT INTO standup_task_links (entry_id, task_id, link_type) VALUES (?1, ?2, ?3)",
                    params![entry_id, task_id, "plan"],
                )?;
            }
        }

        // Insert task links for blockers
        for item in &entry_req.blockers {
            if let Some(task_id) = item.task_id {
                tx.execute(
                    "INSERT INTO standup_task_links (entry_id, task_id, link_type) VALUES (?1, ?2, ?3)",
                    params![entry_id, task_id, "blocker"],
                )?;
            }
        }
    }

    tx.commit()?;
    Ok(meeting_id)
}

pub fn list_meetings(conn: &Connection, start_date: &str, end_date: &str) -> Result<Vec<StandupMeeting>> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_date, notes, created_at
         FROM standup_meetings
         WHERE meeting_date >= ?1 AND meeting_date <= ?2
         ORDER BY meeting_date DESC"
    )?;
    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok(StandupMeeting {
            id: row.get(0)?,
            meeting_date: row.get(1)?,
            notes: row.get(2)?,
            created_at: row.get(3)?,
            entries: vec![],
        })
    })?;
    rows.collect()
}

pub fn delete_meeting(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM standup_meetings WHERE id = ?1", params![id])?;
    Ok(())
}

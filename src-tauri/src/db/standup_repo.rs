use crate::models::standup::{SaveStandupRequest, StandupMeeting};
use rusqlite::{params, Connection, Result};

pub fn get_meeting_by_date(conn: &Connection, date: &str) -> Result<Option<StandupMeeting>> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_date, COALESCE(content, notes, ''), created_at
         FROM standup_meetings
         WHERE meeting_date = ?1",
    )?;
    let mut rows = stmt.query_map(params![date], |row| {
        Ok(StandupMeeting {
            id: row.get(0)?,
            meeting_date: row.get(1)?,
            notes: Some(row.get(2)?),
            created_at: row.get(3)?,
            entries: vec![],
        })
    })?;

    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn save_meeting(conn: &Connection, request: &SaveStandupRequest) -> Result<i64> {
    let content = request.notes.clone().unwrap_or_default();

    conn.execute(
        "INSERT INTO standup_meetings (meeting_date, notes, content)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(meeting_date) DO UPDATE SET
           notes = excluded.notes,
           content = excluded.content",
        params![request.meeting_date, &content, &content],
    )?;

    conn.query_row(
        "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
        params![request.meeting_date],
        |row| row.get(0),
    )
}

pub fn list_meetings(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<StandupMeeting>> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_date, COALESCE(content, notes, ''), created_at
         FROM standup_meetings
         WHERE meeting_date >= ?1 AND meeting_date <= ?2
         ORDER BY meeting_date DESC",
    )?;
    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok(StandupMeeting {
            id: row.get(0)?,
            meeting_date: row.get(1)?,
            notes: Some(row.get(2)?),
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

#[cfg(test)]
mod tests {
    use super::{get_meeting_by_date, list_meetings, save_meeting};
    use crate::db::init::{create_tables, run_migrations};
    use crate::models::standup::SaveStandupRequest;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create tables");
        run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn save_and_load_standup_preserves_exact_markdown() {
        let conn = setup_conn();
        let markdown = "# Daily Standup\n\n## Alice\n- done: API ✅\n- plan: tests\n- blockers: none\n\n```rust\nprintln!(\"hello\");\n```\n";

        let request = SaveStandupRequest {
            meeting_date: "2026-03-04".to_string(),
            notes: Some(markdown.to_string()),
            entries: vec![],
        };

        save_meeting(&conn, &request).expect("save standup");
        let loaded = get_meeting_by_date(&conn, "2026-03-04")
            .expect("load standup")
            .expect("meeting should exist");

        assert_eq!(loaded.notes.as_deref(), Some(markdown));
    }

    #[test]
    fn invalid_date_inputs_return_handled_results() {
        let conn = setup_conn();

        let loaded = get_meeting_by_date(&conn, "invalid-date").expect("query invalid date");
        assert!(loaded.is_none());

        let listed = list_meetings(&conn, "not-a-date", "still-not-a-date")
            .expect("list invalid date range");
        assert!(listed.is_empty());
    }

    #[test]
    fn save_empty_markdown_persists_empty_content() {
        let conn = setup_conn();

        let request = SaveStandupRequest {
            meeting_date: "2026-03-05".to_string(),
            notes: Some(String::new()),
            entries: vec![],
        };

        save_meeting(&conn, &request).expect("save empty markdown");
        let loaded = get_meeting_by_date(&conn, "2026-03-05")
            .expect("load standup")
            .expect("meeting should exist");

        assert_eq!(loaded.notes.as_deref(), Some(""));
    }
}

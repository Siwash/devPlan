use rusqlite::{params, Connection, Result};
use serde::Deserialize;

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS developers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            roles TEXT NOT NULL DEFAULT '[]',
            skills TEXT NOT NULL DEFAULT '[]',
            max_hours_per_day REAL NOT NULL DEFAULT 8.0,
            avatar_color TEXT NOT NULL DEFAULT '#1890ff',
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS sprints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            project_id INTEGER,
            start_date TEXT,
            end_date TEXT,
            phase TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            external_id TEXT,
            task_type TEXT,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER,
            sprint_id INTEGER,
            priority TEXT,
            planned_start TEXT,
            planned_end TEXT,
            planned_hours REAL,
            parent_task_id INTEGER,
            status TEXT DEFAULT '待开始',
            FOREIGN KEY (owner_id) REFERENCES developers(id),
            FOREIGN KEY (sprint_id) REFERENCES sprints(id),
            FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS task_co_owners (
            task_id INTEGER NOT NULL,
            developer_id INTEGER NOT NULL,
            PRIMARY KEY (task_id, developer_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (developer_id) REFERENCES developers(id)
        );

        CREATE TABLE IF NOT EXISTS import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            file_path TEXT,
            import_date TEXT NOT NULL,
            sheet_name TEXT,
            column_mapping TEXT,
            rows_imported INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS holiday_cache (
            date TEXT PRIMARY KEY,
            is_holiday INTEGER NOT NULL,
            is_workday INTEGER NOT NULL,
            name TEXT,
            year INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_holiday_year ON holiday_cache(year);

        CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(planned_start, planned_end);

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS standup_meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_date TEXT NOT NULL UNIQUE,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS standup_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER NOT NULL,
            developer_id INTEGER NOT NULL,
            done_items TEXT NOT NULL DEFAULT '[]',
            plan_items TEXT NOT NULL DEFAULT '[]',
            blockers TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (meeting_id) REFERENCES standup_meetings(id) ON DELETE CASCADE,
            FOREIGN KEY (developer_id) REFERENCES developers(id)
        );

        CREATE TABLE IF NOT EXISTS standup_task_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            link_type TEXT NOT NULL,
            FOREIGN KEY (entry_id) REFERENCES standup_entries(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        );

        CREATE INDEX IF NOT EXISTS idx_standup_date ON standup_meetings(meeting_date);
        CREATE INDEX IF NOT EXISTS idx_standup_entry_meeting ON standup_entries(meeting_id);
        ",
    )?;
    Ok(())
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let has_col: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='parent_number'")
        .and_then(|mut s| s.query_row([], |r| r.get::<_, i64>(0)))
        .map(|c| c > 0)
        .unwrap_or(false);
    if !has_col {
        conn.execute_batch(
            "ALTER TABLE tasks ADD COLUMN parent_number TEXT;
             ALTER TABLE tasks ADD COLUMN parent_name TEXT;",
        )?;
    }

    migrate_standup_schema(conn)?;

    Ok(())
}

fn migrate_standup_schema(conn: &Connection) -> Result<()> {
    let has_content_col: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('standup_meetings') WHERE name='content'")
        .and_then(|mut s| s.query_row([], |r| r.get::<_, i64>(0)))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_content_col {
        conn.execute_batch("ALTER TABLE standup_meetings ADD COLUMN content TEXT;")?;
    }

    backfill_legacy_standup_content(conn)?;

    Ok(())
}

#[derive(Debug)]
struct LegacyStandupEntryRow {
    developer_name: String,
    done_items: String,
    plan_items: String,
    blockers: String,
}

#[derive(Debug, Deserialize)]
struct LegacyStandupItem {
    text: String,
}

fn backfill_legacy_standup_content(conn: &Connection) -> Result<()> {
    let mut meeting_stmt = conn.prepare(
        "SELECT id, COALESCE(notes, '')
         FROM standup_meetings
         WHERE content IS NULL OR TRIM(content) = ''
         ORDER BY meeting_date ASC, id ASC",
    )?;

    let meetings = meeting_stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>>>()?;

    for (meeting_id, notes) in meetings {
        let legacy_entries = load_legacy_standup_entries(conn, meeting_id)?;
        let markdown = build_legacy_markdown_content(&legacy_entries);

        let final_content = merge_legacy_meeting_content(&notes, &markdown);

        if final_content.trim().is_empty() {
            continue;
        }

        conn.execute(
            "UPDATE standup_meetings
             SET content = ?1
             WHERE id = ?2 AND (content IS NULL OR TRIM(content) = '')",
            params![final_content, meeting_id],
        )?;
    }

    Ok(())
}

fn merge_legacy_meeting_content(notes: &str, markdown: &str) -> String {
    let notes = notes.trim();
    let markdown = markdown.trim();

    match (notes.is_empty(), markdown.is_empty()) {
        (true, true) => String::new(),
        (false, true) => notes.to_string(),
        (true, false) => markdown.to_string(),
        (false, false) => format!("{}\n\n{}", notes, markdown),
    }
}

fn load_legacy_standup_entries(
    conn: &Connection,
    meeting_id: i64,
) -> Result<Vec<LegacyStandupEntryRow>> {
    let mut entry_stmt = conn.prepare(
        "SELECT COALESCE(d.name, 'Unknown Developer'), e.done_items, e.plan_items, e.blockers
         FROM standup_entries e
         LEFT JOIN developers d ON d.id = e.developer_id
         WHERE e.meeting_id = ?1
         ORDER BY e.id ASC",
    )?;

    let rows = entry_stmt.query_map(params![meeting_id], |row| {
        Ok(LegacyStandupEntryRow {
            developer_name: row.get(0)?,
            done_items: row.get(1)?,
            plan_items: row.get(2)?,
            blockers: row.get(3)?,
        })
    })?;

    rows.collect()
}

fn build_legacy_markdown_content(entries: &[LegacyStandupEntryRow]) -> String {
    let mut markdown_blocks = Vec::with_capacity(entries.len());

    for entry in entries {
        let done_items = parse_legacy_items(&entry.done_items);
        let plan_items = parse_legacy_items(&entry.plan_items);
        let blocker_items = parse_legacy_items(&entry.blockers);

        let mut block = String::new();
        block.push_str(&format!("## {}\n\n", entry.developer_name));
        append_markdown_section(&mut block, "Done", &done_items);
        append_markdown_section(&mut block, "Plan", &plan_items);
        append_markdown_section(&mut block, "Blockers", &blocker_items);

        markdown_blocks.push(block.trim_end().to_string());
    }

    markdown_blocks.join("\n\n")
}

fn append_markdown_section(buffer: &mut String, title: &str, items: &[String]) {
    buffer.push_str(&format!("### {}\n", title));

    if items.is_empty() {
        buffer.push_str("- (none)\n\n");
        return;
    }

    for item in items {
        buffer.push_str(&format!("- {}\n", item));
    }
    buffer.push('\n');
}

fn parse_legacy_items(raw: &str) -> Vec<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw == "[]" {
        return vec![];
    }

    if let Ok(items) = serde_json::from_str::<Vec<LegacyStandupItem>>(raw) {
        let extracted = items
            .into_iter()
            .filter_map(|item| {
                let text = item.text.trim().to_string();
                (!text.is_empty()).then_some(text)
            })
            .collect::<Vec<_>>();
        if !extracted.is_empty() {
            return extracted;
        }
    }

    if let Ok(items) = serde_json::from_str::<Vec<String>>(raw) {
        let extracted = items
            .into_iter()
            .filter_map(|item| {
                let text = item.trim().to_string();
                (!text.is_empty()).then_some(text)
            })
            .collect::<Vec<_>>();
        if !extracted.is_empty() {
            return extracted;
        }
    }

    vec![raw.to_string()]
}

#[cfg(test)]
mod tests {
    use super::{create_tables, run_migrations};
    use rusqlite::{params, Connection};

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create tables");
        conn
    }

    #[test]
    fn standup_migration_backfills_legacy_entries_to_markdown() {
        let conn = setup_conn();

        conn.execute("INSERT INTO developers(name) VALUES (?1)", params!["Alice"])
            .expect("insert developer");
        conn.execute("INSERT INTO developers(name) VALUES (?1)", params!["Bob"])
            .expect("insert developer");

        conn.execute(
            "INSERT INTO standup_meetings(meeting_date, notes) VALUES (?1, ?2)",
            params!["2026-03-01", "legacy note"],
        )
        .expect("insert meeting");

        let meeting_id: i64 = conn
            .query_row(
                "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
                params!["2026-03-01"],
                |row| row.get(0),
            )
            .expect("query meeting id");

        conn.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                meeting_id,
                1,
                r#"[{"text":"Finished API endpoint","task_id":1}]"#,
                r#"[{"text":"Write integration test","task_id":null}]"#,
                r#"[{"text":"Waiting on QA environment","task_id":null}]"#,
            ],
        )
        .expect("insert entry");

        conn.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![meeting_id, 2, r#"[]"#, r#"["Refactor parser"]"#, r#"[]"#],
        )
        .expect("insert second entry");

        run_migrations(&conn).expect("run migrations");

        let content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query content");

        assert!(content.contains("## Alice"));
        assert!(content.contains("### Done"));
        assert!(content.contains("- Finished API endpoint"));
        assert!(content.contains("### Plan"));
        assert!(content.contains("- Write integration test"));
        assert!(content.contains("### Blockers"));
        assert!(content.contains("- Waiting on QA environment"));
        assert!(content.contains("## Bob"));
        assert!(content.contains("- Refactor parser"));
    }

    #[test]
    fn standup_migration_is_idempotent_on_rerun() {
        let conn = setup_conn();

        conn.execute("INSERT INTO developers(name) VALUES (?1)", params!["Alice"])
            .expect("insert developer");
        conn.execute(
            "INSERT INTO standup_meetings(meeting_date, notes) VALUES (?1, ?2)",
            params!["2026-03-02", "legacy note"],
        )
        .expect("insert meeting");

        let meeting_id: i64 = conn
            .query_row(
                "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
                params!["2026-03-02"],
                |row| row.get(0),
            )
            .expect("query meeting id");

        conn.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                meeting_id,
                1,
                r#"[{"text":"Fix flaky test","task_id":null}]"#,
                r#"[]"#,
                r#"[]"#,
            ],
        )
        .expect("insert entry");

        run_migrations(&conn).expect("first migration");
        let first_content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query first content");

        run_migrations(&conn).expect("second migration");
        let second_content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query second content");

        assert_eq!(first_content, second_content);
        assert_eq!(first_content.matches("## Alice").count(), 1);
    }

    #[test]
    fn standup_migration_preserves_notes_and_legacy_entries_when_both_exist() {
        let conn = setup_conn();

        conn.execute("INSERT INTO developers(name) VALUES (?1)", params!["Alice"])
            .expect("insert developer");
        conn.execute(
            "INSERT INTO standup_meetings(meeting_date, notes) VALUES (?1, ?2)",
            params!["2026-03-04", "Meeting recap note"],
        )
        .expect("insert meeting");

        let meeting_id: i64 = conn
            .query_row(
                "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
                params!["2026-03-04"],
                |row| row.get(0),
            )
            .expect("query meeting id");

        conn.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                meeting_id,
                1,
                r#"[{"text":"Finished migration"}]"#,
                r#"[]"#,
                r#"[]"#,
            ],
        )
        .expect("insert entry");

        run_migrations(&conn).expect("run migrations");

        let content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query content");

        let notes_pos = content.find("Meeting recap note").expect("notes preserved");
        let markdown_pos = content.find("## Alice").expect("markdown preserved");

        assert!(notes_pos < markdown_pos, "notes should be before markdown");
        assert!(content.contains("- Finished migration"));
    }

    #[test]
    fn standup_migration_merged_content_is_idempotent_on_rerun() {
        let conn = setup_conn();

        conn.execute("INSERT INTO developers(name) VALUES (?1)", params!["Alice"])
            .expect("insert developer");
        conn.execute(
            "INSERT INTO standup_meetings(meeting_date, notes) VALUES (?1, ?2)",
            params!["2026-03-05", "Keep this note"],
        )
        .expect("insert meeting");

        let meeting_id: i64 = conn
            .query_row(
                "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
                params!["2026-03-05"],
                |row| row.get(0),
            )
            .expect("query meeting id");

        conn.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                meeting_id,
                1,
                r#"[{"text":"Keep this entry"}]"#,
                r#"[]"#,
                r#"[]"#,
            ],
        )
        .expect("insert entry");

        run_migrations(&conn).expect("first migration");
        let first_content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query first content");

        run_migrations(&conn).expect("second migration");
        let second_content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query second content");

        assert_eq!(first_content, second_content);
        assert!(first_content.contains("Keep this note"));
        assert!(first_content.contains("## Alice"));
        assert!(first_content.contains("- Keep this entry"));
    }

    #[test]
    fn standup_migration_does_not_overwrite_non_empty_content() {
        let conn = setup_conn();

        run_migrations(&conn).expect("add content column");

        conn.execute("INSERT INTO developers(name) VALUES (?1)", params!["Alice"])
            .expect("insert developer");
        conn.execute(
            "INSERT INTO standup_meetings(meeting_date, notes, content) VALUES (?1, ?2, ?3)",
            params!["2026-03-03", "legacy note", "# Manual content"],
        )
        .expect("insert meeting");

        let meeting_id: i64 = conn
            .query_row(
                "SELECT id FROM standup_meetings WHERE meeting_date = ?1",
                params!["2026-03-03"],
                |row| row.get(0),
            )
            .expect("query meeting id");

        conn.execute(
            "INSERT INTO standup_entries (meeting_id, developer_id, done_items, plan_items, blockers)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![meeting_id, 1, r#"[{"text":"Should not overwrite"}]"#, r#"[]"#, r#"[]"#],
        )
        .expect("insert entry");

        run_migrations(&conn).expect("rerun migration");

        let content: String = conn
            .query_row(
                "SELECT content FROM standup_meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .expect("query content");

        assert_eq!(content, "# Manual content");
    }
}

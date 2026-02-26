use rusqlite::{Connection, Result};

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
        "
    )?;
    Ok(())
}

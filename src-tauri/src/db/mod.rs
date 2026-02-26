pub mod init;
pub mod task_repo;
pub mod developer_repo;
pub mod sprint_repo;

use rusqlite::Connection;
use std::sync::Mutex;
use once_cell::sync::OnceCell;
use std::path::PathBuf;

static DB_PATH: OnceCell<PathBuf> = OnceCell::new();

pub struct AppDatabase {
    pub conn: Mutex<Connection>,
}

impl AppDatabase {
    pub fn new(db_path: &std::path::Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn initialize(app_dir: &std::path::Path) -> Result<Self, Box<dyn std::error::Error>> {
        std::fs::create_dir_all(app_dir)?;
        let db_path = app_dir.join("devplan.db");
        DB_PATH.set(db_path.clone()).ok();
        let db = Self::new(&db_path)?;
        {
            let conn = db.conn.lock().unwrap();
            init::create_tables(&conn)?;
        }
        Ok(db)
    }
}

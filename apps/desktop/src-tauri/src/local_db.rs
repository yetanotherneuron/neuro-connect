use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct LocalDb {
    conn: Arc<Mutex<Connection>>,
}

impl LocalDb {
    pub fn open(path: &str) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS session (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                token TEXT NOT NULL,
                user_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message_cache (
                id TEXT PRIMARY KEY,
                channel_or_dm TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;
        Ok(())
    }

    pub fn save_session(&self, token: &str, user_json: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO session (id, token, user_json) VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET token=excluded.token, user_json=excluded.user_json",
            params![token, user_json],
        )?;
        Ok(())
    }

    pub fn get_session(&self) -> anyhow::Result<Option<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let row = conn.query_row(
            "SELECT token, user_json FROM session WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        );
        match row {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn clear_session(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM session", [])?;
        Ok(())
    }

    pub fn cache_message(&self, id: &str, scope: &str, payload: &str, created_at: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO message_cache (id, channel_or_dm, payload, created_at) VALUES (?1,?2,?3,?4)",
            params![id, scope, payload, created_at],
        )?;
        Ok(())
    }

    pub fn load_cached(&self, scope: &str, limit: i64) -> anyhow::Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT payload FROM message_cache WHERE channel_or_dm=?1 ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![scope, limit], |r| r.get::<_, String>(0))?;
        let mut out: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        out.reverse();
        Ok(out)
    }
}

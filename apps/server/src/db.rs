use crate::config::ServerConfig;
use chrono::Utc;
use neuro_shared::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open(path: &str) -> anyhow::Result<Self> {
        if let Some(parent) = Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
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
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                avatar_url TEXT,
                banner_url TEXT,
                created_at TEXT NOT NULL,
                is_global_admin INTEGER NOT NULL DEFAULT 0,
                is_banned INTEGER NOT NULL DEFAULT 0,
                banned_reason TEXT
            );

            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon_url TEXT,
                owner_id TEXT NOT NULL,
                invite_code TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS members (
                server_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rank TEXT NOT NULL,
                joined_at TEXT NOT NULL,
                PRIMARY KEY(server_id, user_id),
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                channel_id TEXT,
                dm_id TEXT,
                author_id TEXT NOT NULL,
                content TEXT NOT NULL,
                attachment_url TEXT,
                attachment_name TEXT,
                created_at TEXT NOT NULL,
                edited_at TEXT,
                FOREIGN KEY(author_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS dms (
                id TEXT PRIMARY KEY,
                user_a TEXT NOT NULL,
                user_b TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_a, user_b),
                FOREIGN KEY(user_a) REFERENCES users(id),
                FOREIGN KEY(user_b) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS game_hosts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                game_name TEXT NOT NULL,
                address TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                server_id TEXT,
                room_code TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'direct',
                app_id TEXT,
                connect_command TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friendships (
                id TEXT PRIMARY KEY,
                requester_id TEXT NOT NULL,
                addressee_id TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(requester_id, addressee_id),
                FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(addressee_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_blocks (
                blocker_id TEXT NOT NULL,
                blocked_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(blocker_id, blocked_id),
                FOREIGN KEY(blocker_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(blocked_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_ignores (
                user_id TEXT NOT NULL,
                ignored_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(user_id, ignored_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(ignored_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(dm_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_game_hosts_expires ON game_hosts(expires_at);
            CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
            CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
            "#,
        )?;
        // Upgrade older DBs that predate admin/ban columns.
        let _ = conn.execute(
            "ALTER TABLE users ADD COLUMN is_global_admin INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = conn.execute("ALTER TABLE users ADD COLUMN banned_reason TEXT", []);

        // Ensure friends tables exist even if an older binary created the DB first.
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS friendships (
                id TEXT PRIMARY KEY,
                requester_id TEXT NOT NULL,
                addressee_id TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(requester_id, addressee_id)
            );
            CREATE TABLE IF NOT EXISTS user_blocks (
                blocker_id TEXT NOT NULL,
                blocked_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(blocker_id, blocked_id)
            );
            CREATE TABLE IF NOT EXISTS user_ignores (
                user_id TEXT NOT NULL,
                ignored_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(user_id, ignored_id)
            );
            CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
            CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

            CREATE TABLE IF NOT EXISTS dm_members (
                dm_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                PRIMARY KEY(dm_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS message_reactions (
                message_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(message_id, user_id, emoji)
            );
            "#,
        )?;
        let _ = conn.execute(
            "ALTER TABLE dms ADD COLUMN kind TEXT NOT NULL DEFAULT 'direct'",
            [],
        );
        let _ = conn.execute("ALTER TABLE dms ADD COLUMN name TEXT", []);
        let _ = conn.execute("ALTER TABLE dms ADD COLUMN owner_id TEXT", []);
        let _ = conn.execute(
            "ALTER TABLE game_hosts ADD COLUMN room_code TEXT NOT NULL DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE game_hosts ADD COLUMN kind TEXT NOT NULL DEFAULT 'direct'",
            [],
        );
        let _ = conn.execute("ALTER TABLE game_hosts ADD COLUMN app_id TEXT", []);
        let _ = conn.execute("ALTER TABLE game_hosts ADD COLUMN connect_command TEXT", []);
        let _ = conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_game_hosts_room_code ON game_hosts(room_code) WHERE room_code != ''",
            [],
        );
        // Backfill room codes for hosts created before 0.2.0.
        if let Ok(mut stmt) =
            conn.prepare("SELECT id FROM game_hosts WHERE room_code IS NULL OR room_code = ''")
        {
            let missing_ids: Vec<String> = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .into_iter()
                .flatten()
                .filter_map(|r| r.ok())
                .collect();
            drop(stmt);
            for id in missing_ids {
                let code = generate_room_code();
                let _ = conn.execute(
                    "UPDATE game_hosts SET room_code=?1 WHERE id=?2",
                    params![code, id],
                );
            }
        }

        // Backfill dm_members for legacy 1:1 threads.
        let _ = conn.execute_batch(
            r#"
            INSERT OR IGNORE INTO dm_members (dm_id, user_id)
            SELECT id, user_a FROM dms;
            INSERT OR IGNORE INTO dm_members (dm_id, user_id)
            SELECT id, user_b FROM dms;
            "#,
        );
        Ok(())
    }

    pub fn create_user(
        &self,
        username: &str,
        password_hash: &str,
        display_name: &str,
    ) -> anyhow::Result<UserPublic> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?1,?2,?3,?4,?5)",
            params![
                id.to_string(),
                username,
                password_hash,
                display_name,
                created_at.to_rfc3339()
            ],
        )?;
        Ok(UserPublic {
            id,
            username: username.to_string(),
            display_name: display_name.to_string(),
            avatar_url: None,
            banner_url: None,
            created_at,
            is_global_admin: false,
        })
    }

    pub fn find_user_by_username(
        &self,
        username: &str,
    ) -> anyhow::Result<Option<(UserPublic, String)>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, username, password_hash, display_name, avatar_url, banner_url, created_at, is_global_admin
                 FROM users WHERE username = ?1 COLLATE NOCASE",
                params![username],
                |r| {
                    Ok((
                        UserPublic {
                            id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                            username: r.get(1)?,
                            display_name: r.get(3)?,
                            avatar_url: r.get(4)?,
                            banner_url: r.get(5)?,
                            created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(6)?)
                                .unwrap()
                                .with_timezone(&Utc),
                            is_global_admin: r.get::<_, i64>(7)? != 0,
                        },
                        r.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn get_user(&self, id: Uuid) -> anyhow::Result<Option<UserPublic>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, username, display_name, avatar_url, banner_url, created_at, is_global_admin
                 FROM users WHERE id = ?1",
                params![id.to_string()],
                |r| {
                    Ok(UserPublic {
                        id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                        username: r.get(1)?,
                        display_name: r.get(2)?,
                        avatar_url: r.get(3)?,
                        banner_url: r.get(4)?,
                        created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(5)?)
                            .unwrap()
                            .with_timezone(&Utc),
                        is_global_admin: r.get::<_, i64>(6)? != 0,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn update_profile(
        &self,
        id: Uuid,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
        banner_url: Option<&str>,
    ) -> anyhow::Result<UserPublic> {
        let mut user = self
            .get_user(id)?
            .ok_or_else(|| anyhow::anyhow!("user not found"))?;
        if let Some(n) = display_name {
            user.display_name = n.to_string();
        }
        if let Some(a) = avatar_url {
            user.avatar_url = if a.is_empty() {
                None
            } else {
                Some(a.to_string())
            };
        }
        if let Some(b) = banner_url {
            user.banner_url = if b.is_empty() {
                None
            } else {
                Some(b.to_string())
            };
        }
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE users SET display_name=?1, avatar_url=?2, banner_url=?3 WHERE id=?4",
            params![
                user.display_name,
                user.avatar_url,
                user.banner_url,
                id.to_string()
            ],
        )?;
        Ok(user)
    }

    pub fn create_server(
        &self,
        owner_id: Uuid,
        name: &str,
        description: Option<&str>,
        icon_url: Option<&str>,
    ) -> anyhow::Result<ServerInfo> {
        let id = Uuid::new_v4();
        let invite = generate_invite();
        let created_at = Utc::now();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO servers (id, name, description, icon_url, owner_id, invite_code, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                id.to_string(),
                name,
                description,
                icon_url,
                owner_id.to_string(),
                invite,
                created_at.to_rfc3339()
            ],
        )?;
        conn.execute(
            "INSERT INTO members (server_id, user_id, rank, joined_at) VALUES (?1,?2,?3,?4)",
            params![
                id.to_string(),
                owner_id.to_string(),
                Rank::Owner.as_str(),
                created_at.to_rfc3339()
            ],
        )?;
        let general_id = Uuid::new_v4();
        conn.execute(
            "INSERT INTO channels (id, server_id, name, kind, position) VALUES (?1,?2,?3,?4,0)",
            params![general_id.to_string(), id.to_string(), "general", "text"],
        )?;
        let voice_id = Uuid::new_v4();
        conn.execute(
            "INSERT INTO channels (id, server_id, name, kind, position) VALUES (?1,?2,?3,?4,1)",
            params![voice_id.to_string(), id.to_string(), "Voice", "voice"],
        )?;
        Ok(ServerInfo {
            id,
            name: name.to_string(),
            description: description.map(|s| s.to_string()),
            icon_url: icon_url.map(|s| s.to_string()),
            owner_id,
            invite_code: invite,
            created_at,
        })
    }

    pub fn join_server(&self, user_id: Uuid, invite_code: &str) -> anyhow::Result<ServerInfo> {
        let conn = self.conn.lock().unwrap();
        let server = conn.query_row(
            "SELECT id, name, description, icon_url, owner_id, invite_code, created_at FROM servers WHERE invite_code = ?1",
            params![invite_code],
            |r| {
                Ok(ServerInfo {
                    id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                    name: r.get(1)?,
                    description: r.get(2)?,
                    icon_url: r.get(3)?,
                    owner_id: Uuid::parse_str(&r.get::<_, String>(4)?).unwrap(),
                    invite_code: r.get(5)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(6)?)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            },
        )?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO members (server_id, user_id, rank, joined_at) VALUES (?1,?2,?3,?4)",
            params![
                server.id.to_string(),
                user_id.to_string(),
                Rank::Member.as_str(),
                now
            ],
        )?;
        Ok(server)
    }

    pub fn list_servers_for_user(&self, user_id: Uuid) -> anyhow::Result<Vec<ServerInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.description, s.icon_url, s.owner_id, s.invite_code, s.created_at
             FROM servers s
             JOIN members m ON m.server_id = s.id
             WHERE m.user_id = ?1
             ORDER BY s.name",
        )?;
        let rows = stmt.query_map(params![user_id.to_string()], |r| {
            Ok(ServerInfo {
                id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                name: r.get(1)?,
                description: r.get(2)?,
                icon_url: r.get(3)?,
                owner_id: Uuid::parse_str(&r.get::<_, String>(4)?).unwrap(),
                invite_code: r.get(5)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(6)?)
                    .unwrap()
                    .with_timezone(&Utc),
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_server(&self, id: Uuid) -> anyhow::Result<Option<ServerInfo>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, name, description, icon_url, owner_id, invite_code, created_at FROM servers WHERE id = ?1",
                params![id.to_string()],
                |r| {
                    Ok(ServerInfo {
                        id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                        name: r.get(1)?,
                        description: r.get(2)?,
                        icon_url: r.get(3)?,
                        owner_id: Uuid::parse_str(&r.get::<_, String>(4)?).unwrap(),
                        invite_code: r.get(5)?,
                        created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(6)?)
                            .unwrap()
                            .with_timezone(&Utc),
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn member_rank(&self, server_id: Uuid, user_id: Uuid) -> anyhow::Result<Option<Rank>> {
        let conn = self.conn.lock().unwrap();
        let rank: Option<String> = conn
            .query_row(
                "SELECT rank FROM members WHERE server_id=?1 AND user_id=?2",
                params![server_id.to_string(), user_id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        Ok(rank.and_then(|r| Rank::from_str_rank(&r)))
    }

    pub fn list_channels(&self, server_id: Uuid) -> anyhow::Result<Vec<ChannelInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, server_id, name, kind, position FROM channels WHERE server_id=?1 ORDER BY position, name",
        )?;
        let rows = stmt.query_map(params![server_id.to_string()], |r| {
            Ok(ChannelInfo {
                id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                server_id: Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                name: r.get(2)?,
                kind: ChannelKind::from_str_kind(&r.get::<_, String>(3)?)
                    .unwrap_or(ChannelKind::Text),
                position: r.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn create_channel(
        &self,
        server_id: Uuid,
        name: &str,
        kind: ChannelKind,
    ) -> anyhow::Result<ChannelInfo> {
        let id = Uuid::new_v4();
        let conn = self.conn.lock().unwrap();
        let position: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM channels WHERE server_id=?1",
                params![server_id.to_string()],
                |r| r.get(0),
            )
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO channels (id, server_id, name, kind, position) VALUES (?1,?2,?3,?4,?5)",
            params![
                id.to_string(),
                server_id.to_string(),
                name,
                kind.as_str(),
                position
            ],
        )?;
        Ok(ChannelInfo {
            id,
            server_id,
            name: name.to_string(),
            kind,
            position,
        })
    }

    pub fn get_channel(&self, id: Uuid) -> anyhow::Result<Option<ChannelInfo>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, server_id, name, kind, position FROM channels WHERE id=?1",
                params![id.to_string()],
                |r| {
                    Ok(ChannelInfo {
                        id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                        server_id: Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                        name: r.get(2)?,
                        kind: ChannelKind::from_str_kind(&r.get::<_, String>(3)?)
                            .unwrap_or(ChannelKind::Text),
                        position: r.get(4)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn list_members(&self, server_id: Uuid) -> anyhow::Result<Vec<MemberInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.created_at, u.is_global_admin, m.rank, m.joined_at
             FROM members m JOIN users u ON u.id = m.user_id
             WHERE m.server_id=?1 ORDER BY m.rank DESC, u.display_name",
        )?;
        let rows = stmt.query_map(params![server_id.to_string()], |r| {
            Ok(MemberInfo {
                user: UserPublic {
                    id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                    username: r.get(1)?,
                    display_name: r.get(2)?,
                    avatar_url: r.get(3)?,
                    banner_url: r.get(4)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(5)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    is_global_admin: r.get::<_, i64>(6)? != 0,
                },
                rank: Rank::from_str_rank(&r.get::<_, String>(7)?).unwrap_or(Rank::Member),
                joined_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(8)?)
                    .unwrap()
                    .with_timezone(&Utc),
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn set_rank(&self, server_id: Uuid, user_id: Uuid, rank: Rank) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE members SET rank=?1 WHERE server_id=?2 AND user_id=?3",
            params![rank.as_str(), server_id.to_string(), user_id.to_string()],
        )?;
        Ok(())
    }

    pub fn delete_channel(&self, id: Uuid) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM messages WHERE channel_id=?1",
            params![id.to_string()],
        )?;
        conn.execute("DELETE FROM channels WHERE id=?1", params![id.to_string()])?;
        Ok(())
    }

    pub fn rename_channel(&self, id: Uuid, name: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE channels SET name=?1 WHERE id=?2",
            params![name, id.to_string()],
        )?;
        Ok(())
    }

    pub fn insert_message(
        &self,
        channel_id: Option<Uuid>,
        dm_id: Option<Uuid>,
        author_id: Uuid,
        content: &str,
        attachment_url: Option<&str>,
        attachment_name: Option<&str>,
    ) -> anyhow::Result<MessageInfo> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO messages (id, channel_id, dm_id, author_id, content, attachment_url, attachment_name, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    id.to_string(),
                    channel_id.map(|u| u.to_string()),
                    dm_id.map(|u| u.to_string()),
                    author_id.to_string(),
                    content,
                    attachment_url,
                    attachment_name,
                    created_at.to_rfc3339()
                ],
            )?;
            if let Some(dm) = dm_id {
                conn.execute(
                    "UPDATE dms SET updated_at=?1 WHERE id=?2",
                    params![created_at.to_rfc3339(), dm.to_string()],
                )?;
            }
        }
        let author = self
            .get_user(author_id)?
            .ok_or_else(|| anyhow::anyhow!("author missing"))?;
        Ok(MessageInfo {
            id,
            channel_id,
            dm_id,
            author,
            content: content.to_string(),
            attachment_url: attachment_url.map(|s| s.to_string()),
            attachment_name: attachment_name.map(|s| s.to_string()),
            created_at,
            edited_at: None,
            reactions: vec![],
        })
    }

    pub fn edit_message(
        &self,
        id: Uuid,
        author_id: Uuid,
        content: &str,
    ) -> anyhow::Result<MessageInfo> {
        let edited_at = Utc::now();
        {
            let conn = self.conn.lock().unwrap();
            let n = conn.execute(
                "UPDATE messages SET content=?1, edited_at=?2 WHERE id=?3 AND author_id=?4",
                params![
                    content,
                    edited_at.to_rfc3339(),
                    id.to_string(),
                    author_id.to_string()
                ],
            )?;
            if n == 0 {
                anyhow::bail!("message not found or not author");
            }
        }
        let (msg, _, _, _) = self
            .get_message(id)?
            .ok_or_else(|| anyhow::anyhow!("message not found"))?;
        let reactions = self.list_reactions(id, author_id)?;
        Ok(MessageInfo { reactions, ..msg })
    }

    pub fn toggle_reaction(
        &self,
        message_id: Uuid,
        user_id: Uuid,
        emoji: &str,
    ) -> anyhow::Result<MessageInfo> {
        let emoji = emoji.trim();
        if emoji.is_empty() || emoji.chars().count() > 16 {
            anyhow::bail!("invalid emoji");
        }
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock().unwrap();
            let existing: i64 = conn.query_row(
                "SELECT COUNT(*) FROM message_reactions WHERE message_id=?1 AND user_id=?2 AND emoji=?3",
                params![message_id.to_string(), user_id.to_string(), emoji],
                |r| r.get(0),
            )?;
            if existing > 0 {
                conn.execute(
                    "DELETE FROM message_reactions WHERE message_id=?1 AND user_id=?2 AND emoji=?3",
                    params![message_id.to_string(), user_id.to_string(), emoji],
                )?;
            } else {
                conn.execute(
                    "INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?1,?2,?3,?4)",
                    params![message_id.to_string(), user_id.to_string(), emoji, now],
                )?;
            }
        }
        let (msg, _, _, _) = self
            .get_message(message_id)?
            .ok_or_else(|| anyhow::anyhow!("message not found"))?;
        let reactions = self.list_reactions(message_id, user_id)?;
        Ok(MessageInfo { reactions, ..msg })
    }

    pub fn list_reactions(
        &self,
        message_id: Uuid,
        viewer_id: Uuid,
    ) -> anyhow::Result<Vec<ReactionInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT emoji, COUNT(*) as c,
                    SUM(CASE WHEN user_id=?2 THEN 1 ELSE 0 END) as me
             FROM message_reactions WHERE message_id=?1
             GROUP BY emoji ORDER BY c DESC, emoji ASC",
        )?;
        let rows = stmt.query_map(
            params![message_id.to_string(), viewer_id.to_string()],
            |r| {
                Ok(ReactionInfo {
                    emoji: r.get(0)?,
                    count: r.get(1)?,
                    reacted_by_me: r.get::<_, i64>(2)? > 0,
                })
            },
        )?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn list_channel_messages(
        &self,
        channel_id: Uuid,
        limit: i64,
    ) -> anyhow::Result<Vec<MessageInfo>> {
        self.list_messages_inner("channel_id", channel_id, limit)
    }

    pub fn list_dm_messages(&self, dm_id: Uuid, limit: i64) -> anyhow::Result<Vec<MessageInfo>> {
        self.list_messages_inner("dm_id", dm_id, limit)
    }

    fn list_messages_inner(
        &self,
        col: &str,
        id: Uuid,
        limit: i64,
    ) -> anyhow::Result<Vec<MessageInfo>> {
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT m.id, m.channel_id, m.dm_id, m.content, m.attachment_url, m.attachment_name, m.created_at, m.edited_at,
                    u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.created_at, u.is_global_admin
             FROM messages m JOIN users u ON u.id = m.author_id
             WHERE m.{col}=?1 ORDER BY m.created_at DESC LIMIT ?2"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![id.to_string(), limit], |r| {
            Ok(MessageInfo {
                id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                channel_id: r
                    .get::<_, Option<String>>(1)?
                    .map(|s| Uuid::parse_str(&s).unwrap()),
                dm_id: r
                    .get::<_, Option<String>>(2)?
                    .map(|s| Uuid::parse_str(&s).unwrap()),
                content: r.get(3)?,
                attachment_url: r.get(4)?,
                attachment_name: r.get(5)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(6)?)
                    .unwrap()
                    .with_timezone(&Utc),
                edited_at: r.get::<_, Option<String>>(7)?.map(|s| {
                    chrono::DateTime::parse_from_rfc3339(&s)
                        .unwrap()
                        .with_timezone(&Utc)
                }),
                author: UserPublic {
                    id: Uuid::parse_str(&r.get::<_, String>(8)?).unwrap(),
                    username: r.get(9)?,
                    display_name: r.get(10)?,
                    avatar_url: r.get(11)?,
                    banner_url: r.get(12)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(13)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    is_global_admin: r.get::<_, i64>(14)? != 0,
                },
                reactions: vec![],
            })
        })?;
        let mut msgs: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        msgs.reverse();
        Ok(msgs)
    }

    #[allow(clippy::type_complexity)]
    pub fn get_message(
        &self,
        id: Uuid,
    ) -> anyhow::Result<Option<(MessageInfo, Uuid, Option<Uuid>, Option<Uuid>)>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT m.id, m.channel_id, m.dm_id, m.author_id, m.content, m.attachment_url, m.attachment_name, m.created_at, m.edited_at,
                        u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.created_at, u.is_global_admin
                 FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id=?1",
                params![id.to_string()],
                |r| {
                    let author_id = Uuid::parse_str(&r.get::<_, String>(3)?).unwrap();
                    let channel_id = r
                        .get::<_, Option<String>>(1)?
                        .map(|s| Uuid::parse_str(&s).unwrap());
                    let dm_id = r
                        .get::<_, Option<String>>(2)?
                        .map(|s| Uuid::parse_str(&s).unwrap());
                    Ok((
                        MessageInfo {
                            id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                            channel_id,
                            dm_id,
                            author: UserPublic {
                                id: Uuid::parse_str(&r.get::<_, String>(9)?).unwrap(),
                                username: r.get(10)?,
                                display_name: r.get(11)?,
                                avatar_url: r.get(12)?,
                                banner_url: r.get(13)?,
                                created_at: chrono::DateTime::parse_from_rfc3339(
                                    &r.get::<_, String>(14)?,
                                )
                                .unwrap()
                                .with_timezone(&Utc),
                                is_global_admin: r.get::<_, i64>(15)? != 0,
                            },
                            content: r.get(4)?,
                            attachment_url: r.get(5)?,
                            attachment_name: r.get(6)?,
                            created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(7)?)
                                .unwrap()
                                .with_timezone(&Utc),
                            edited_at: r.get::<_, Option<String>>(8)?.map(|s| {
                                chrono::DateTime::parse_from_rfc3339(&s)
                                    .unwrap()
                                    .with_timezone(&Utc)
                            }),
                            reactions: vec![],
                        },
                        author_id,
                        channel_id,
                        dm_id,
                    ))
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn delete_message(&self, id: Uuid) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages WHERE id=?1", params![id.to_string()])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn dm_participants(&self, dm_id: Uuid) -> anyhow::Result<Option<(Uuid, Uuid)>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT user_a, user_b FROM dms WHERE id=?1",
                params![dm_id.to_string()],
                |r| {
                    Ok((
                        Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                        Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                    ))
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn open_or_get_dm(&self, user_a: Uuid, user_b: Uuid) -> anyhow::Result<Uuid> {
        let (a, b) = if user_a < user_b {
            (user_a, user_b)
        } else {
            (user_b, user_a)
        };
        let conn = self.conn.lock().unwrap();
        if let Some(id) = conn
            .query_row(
                "SELECT id FROM dms WHERE kind='direct' AND user_a=?1 AND user_b=?2",
                params![a.to_string(), b.to_string()],
                |r| r.get::<_, String>(0),
            )
            .optional()?
        {
            return Ok(Uuid::parse_str(&id).unwrap());
        }
        let id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO dms (id, user_a, user_b, updated_at, kind) VALUES (?1,?2,?3,?4,'direct')",
            params![id.to_string(), a.to_string(), b.to_string(), now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO dm_members (dm_id, user_id) VALUES (?1,?2)",
            params![id.to_string(), a.to_string()],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO dm_members (dm_id, user_id) VALUES (?1,?2)",
            params![id.to_string(), b.to_string()],
        )?;
        Ok(id)
    }

    pub fn create_group_dm(
        &self,
        owner_id: Uuid,
        name: &str,
        member_ids: &[Uuid],
    ) -> anyhow::Result<DmThread> {
        let name = name.trim();
        if name.is_empty() || name.len() > 80 {
            anyhow::bail!("group name required (max 80 chars)");
        }
        let mut members: Vec<Uuid> = member_ids
            .iter()
            .copied()
            .filter(|id| *id != owner_id)
            .collect();
        members.sort();
        members.dedup();
        if members.is_empty() {
            anyhow::bail!("add at least one other member");
        }
        if members.len() > 24 {
            anyhow::bail!("too many members");
        }
        let id = Uuid::new_v4();
        let now = Utc::now();
        {
            let conn = self.conn.lock().unwrap();
            // user_b = group id keeps UNIQUE(user_a,user_b) satisfied for groups.
            conn.execute(
                "INSERT INTO dms (id, user_a, user_b, updated_at, kind, name, owner_id)
                 VALUES (?1,?2,?3,?4,'group',?5,?2)",
                params![
                    id.to_string(),
                    owner_id.to_string(),
                    id.to_string(),
                    now.to_rfc3339(),
                    name
                ],
            )?;
            conn.execute(
                "INSERT INTO dm_members (dm_id, user_id) VALUES (?1,?2)",
                params![id.to_string(), owner_id.to_string()],
            )?;
            for mid in &members {
                conn.execute(
                    "INSERT INTO dm_members (dm_id, user_id) VALUES (?1,?2)",
                    params![id.to_string(), mid.to_string()],
                )?;
            }
        }
        self.get_dm_thread(id, owner_id)?
            .ok_or_else(|| anyhow::anyhow!("failed to load group dm"))
    }

    pub fn is_dm_member(&self, dm_id: Uuid, user_id: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dm_members WHERE dm_id=?1 AND user_id=?2",
            params![dm_id.to_string(), user_id.to_string()],
            |r| r.get(0),
        )?;
        if n > 0 {
            return Ok(true);
        }
        // Legacy fallback
        let row = conn
            .query_row(
                "SELECT user_a, user_b FROM dms WHERE id=?1",
                params![dm_id.to_string()],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?;
        Ok(row.is_some_and(|(a, b)| a == user_id.to_string() || b == user_id.to_string()))
    }

    pub fn get_dm_thread(&self, dm_id: Uuid, viewer_id: Uuid) -> anyhow::Result<Option<DmThread>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, updated_at, COALESCE(kind,'direct'), name, user_a, user_b FROM dms WHERE id=?1",
                params![dm_id.to_string()],
                |r| {
                    Ok((
                        Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        Uuid::parse_str(&r.get::<_, String>(4)?).unwrap(),
                        Uuid::parse_str(&r.get::<_, String>(5)?).unwrap(),
                    ))
                },
            )
            .optional()?;
        let Some((id, updated, kind, name, user_a, user_b)) = row else {
            return Ok(None);
        };
        let member_ids: Vec<Uuid> = {
            let mut stmt = conn.prepare("SELECT user_id FROM dm_members WHERE dm_id=?1")?;
            let ids: Vec<Uuid> = stmt
                .query_map(params![id.to_string()], |r| {
                    Ok(Uuid::parse_str(&r.get::<_, String>(0)?).unwrap())
                })?
                .filter_map(|r| r.ok())
                .collect();
            if ids.is_empty() {
                vec![user_a, user_b]
            } else {
                ids
            }
        };
        drop(conn);
        if !member_ids.contains(&viewer_id) {
            return Ok(None);
        }
        let mut members = Vec::new();
        for mid in &member_ids {
            if let Some(u) = self.get_user(*mid)? {
                members.push(u);
            }
        }
        let peer = if kind == "direct" {
            let other = if user_a == viewer_id { user_b } else { user_a };
            self.get_user(other)?
        } else {
            None
        };
        Ok(Some(DmThread {
            id,
            peer,
            name,
            kind,
            members,
            updated_at: chrono::DateTime::parse_from_rfc3339(&updated)
                .unwrap()
                .with_timezone(&Utc),
        }))
    }

    pub fn list_dms(&self, user_id: Uuid) -> anyhow::Result<Vec<DmThread>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT d.id FROM dms d
             LEFT JOIN dm_members m ON m.dm_id = d.id
             WHERE m.user_id=?1 OR d.user_a=?1 OR d.user_b=?1
             ORDER BY d.updated_at DESC",
        )?;
        let ids: Vec<Uuid> = stmt
            .query_map(params![user_id.to_string()], |r| {
                Ok(Uuid::parse_str(&r.get::<_, String>(0)?).unwrap())
            })?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        drop(conn);
        let mut out = Vec::new();
        for id in ids {
            if let Some(thread) = self.get_dm_thread(id, user_id)? {
                out.push(thread);
            }
        }
        out.sort_by_key(|b| std::cmp::Reverse(b.updated_at));
        Ok(out)
    }

    pub fn attach_reactions(
        &self,
        msgs: Vec<MessageInfo>,
        viewer_id: Uuid,
    ) -> anyhow::Result<Vec<MessageInfo>> {
        let mut out = Vec::with_capacity(msgs.len());
        for mut m in msgs {
            m.reactions = self.list_reactions(m.id, viewer_id)?;
            out.push(m);
        }
        Ok(out)
    }

    pub fn user_count(&self) -> anyhow::Result<i64> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
        Ok(n)
    }

    pub fn is_user_banned(&self, id: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let banned: i64 = conn.query_row(
            "SELECT is_banned FROM users WHERE id=?1",
            params![id.to_string()],
            |r| r.get(0),
        )?;
        Ok(banned != 0)
    }

    pub fn is_global_admin(&self, id: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let flag: i64 = conn.query_row(
            "SELECT is_global_admin FROM users WHERE id=?1",
            params![id.to_string()],
            |r| r.get(0),
        )?;
        Ok(flag != 0)
    }

    pub fn set_global_admin(&self, id: Uuid, enabled: bool) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE users SET is_global_admin=?1 WHERE id=?2",
            params![if enabled { 1 } else { 0 }, id.to_string()],
        )?;
        Ok(())
    }

    pub fn try_auto_elevate_global_admin(
        &self,
        username: &str,
        configured: &str,
        bootstrap_required: bool,
    ) -> anyhow::Result<Option<UserPublic>> {
        if configured.is_empty() {
            return Ok(None);
        }
        if !username.eq_ignore_ascii_case(configured) {
            return Ok(None);
        }
        if bootstrap_required {
            return Ok(None);
        }
        let Some((user, _)) = self.find_user_by_username(username)? else {
            return Ok(None);
        };
        if !user.is_global_admin {
            self.set_global_admin(user.id, true)?;
        }
        self.get_user(user.id)
    }

    pub fn ban_user(&self, id: Uuid, reason: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE users SET is_banned=1, banned_reason=?1 WHERE id=?2",
            params![reason, id.to_string()],
        )?;
        Ok(())
    }

    pub fn unban_user(&self, id: Uuid) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE users SET is_banned=0, banned_reason=NULL WHERE id=?1",
            params![id.to_string()],
        )?;
        Ok(())
    }

    pub fn list_all_users_admin(&self) -> anyhow::Result<Vec<AdminUserInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, display_name, avatar_url, banner_url, created_at, is_global_admin, is_banned, banned_reason
             FROM users ORDER BY username",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(AdminUserInfo {
                user: UserPublic {
                    id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                    username: r.get(1)?,
                    display_name: r.get(2)?,
                    avatar_url: r.get(3)?,
                    banner_url: r.get(4)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(5)?)
                        .unwrap()
                        .with_timezone(&Utc),
                    is_global_admin: r.get::<_, i64>(6)? != 0,
                },
                is_banned: r.get::<_, i64>(7)? != 0,
                banned_reason: r.get(8)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn list_all_servers(&self) -> anyhow::Result<Vec<ServerInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, icon_url, owner_id, invite_code, created_at FROM servers ORDER BY name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(ServerInfo {
                id: Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                name: r.get(1)?,
                description: r.get(2)?,
                icon_url: r.get(3)?,
                owner_id: Uuid::parse_str(&r.get::<_, String>(4)?).unwrap(),
                invite_code: r.get(5)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&r.get::<_, String>(6)?)
                    .unwrap()
                    .with_timezone(&Utc),
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn delete_server(&self, id: Uuid) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id=?1)",
            params![id.to_string()],
        )?;
        conn.execute(
            "DELETE FROM channels WHERE server_id=?1",
            params![id.to_string()],
        )?;
        conn.execute(
            "DELETE FROM members WHERE server_id=?1",
            params![id.to_string()],
        )?;
        conn.execute("DELETE FROM servers WHERE id=?1", params![id.to_string()])?;
        Ok(())
    }

    pub fn purge_expired_game_hosts(&self) -> anyhow::Result<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM game_hosts WHERE expires_at < ?1", params![now])?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_game_host(
        &self,
        user_id: Uuid,
        game_name: &str,
        address: &str,
        note: &str,
        kind: GameHostKind,
        app_id: Option<&str>,
        connect_command: Option<&str>,
        server_id: Option<Uuid>,
        ttl_minutes: i64,
    ) -> anyhow::Result<GameHostInfo> {
        self.purge_expired_game_hosts()?;
        let id = Uuid::new_v4();
        let room_code = self.alloc_room_code()?;
        let created_at = Utc::now();
        let expires_at = created_at + chrono::Duration::minutes(ttl_minutes);
        let kind_s = match kind {
            GameHostKind::Direct => "direct",
            GameHostKind::Goldberg => "goldberg",
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO game_hosts (id, user_id, game_name, address, note, server_id, room_code, kind, app_id, connect_command, created_at, expires_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                id.to_string(),
                user_id.to_string(),
                game_name,
                address,
                note,
                server_id.map(|s| s.to_string()),
                room_code,
                kind_s,
                app_id,
                connect_command,
                created_at.to_rfc3339(),
                expires_at.to_rfc3339(),
            ],
        )?;
        drop(conn);
        self.get_game_host(id)?
            .ok_or_else(|| anyhow::anyhow!("game host missing after insert"))
    }

    fn alloc_room_code(&self) -> anyhow::Result<String> {
        for _ in 0..32 {
            let code = generate_room_code();
            let conn = self.conn.lock().unwrap();
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM game_hosts WHERE room_code=?1 AND expires_at >= ?2",
                params![code, Utc::now().to_rfc3339()],
                |r| r.get(0),
            )?;
            if exists == 0 {
                return Ok(code);
            }
        }
        Err(anyhow::anyhow!("could not allocate room code"))
    }

    pub fn get_game_host(&self, id: Uuid) -> anyhow::Result<Option<GameHostInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, game_name, address, note, server_id, room_code, kind, app_id, connect_command, created_at, expires_at
             FROM game_hosts WHERE id=?1",
        )?;
        let row = stmt.query_row(params![id.to_string()], |r| {
            Ok((
                Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, Option<String>>(8)?,
                r.get::<_, Option<String>>(9)?,
                r.get::<_, String>(10)?,
                r.get::<_, String>(11)?,
            ))
        });
        let Ok((
            id,
            uid,
            game_name,
            address,
            note,
            server_id,
            room_code,
            kind,
            app_id,
            connect_command,
            created_at,
            expires_at,
        )) = row
        else {
            return Ok(None);
        };
        drop(stmt);
        drop(conn);
        let user = self
            .get_user(uid)?
            .ok_or_else(|| anyhow::anyhow!("user missing"))?;
        Ok(Some(row_to_game_host(
            id,
            user,
            game_name,
            address,
            note,
            server_id,
            room_code,
            kind,
            app_id,
            connect_command,
            created_at,
            expires_at,
        )))
    }

    pub fn get_game_host_by_code(&self, code: &str) -> anyhow::Result<Option<GameHostInfo>> {
        self.purge_expired_game_hosts()?;
        let code = code.trim().to_uppercase();
        if code.is_empty() {
            return Ok(None);
        }
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, game_name, address, note, server_id, room_code, kind, app_id, connect_command, created_at, expires_at
             FROM game_hosts WHERE upper(room_code)=?1 AND expires_at >= ?2",
        )?;
        let row = stmt.query_row(params![code, Utc::now().to_rfc3339()], |r| {
            Ok((
                Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, Option<String>>(8)?,
                r.get::<_, Option<String>>(9)?,
                r.get::<_, String>(10)?,
                r.get::<_, String>(11)?,
            ))
        });
        let Ok((
            id,
            uid,
            game_name,
            address,
            note,
            server_id,
            room_code,
            kind,
            app_id,
            connect_command,
            created_at,
            expires_at,
        )) = row
        else {
            return Ok(None);
        };
        drop(stmt);
        drop(conn);
        let user = self
            .get_user(uid)?
            .ok_or_else(|| anyhow::anyhow!("user missing"))?;
        Ok(Some(row_to_game_host(
            id,
            user,
            game_name,
            address,
            note,
            server_id,
            room_code,
            kind,
            app_id,
            connect_command,
            created_at,
            expires_at,
        )))
    }

    pub fn list_game_hosts(&self, server_id: Option<Uuid>) -> anyhow::Result<Vec<GameHostInfo>> {
        self.purge_expired_game_hosts()?;
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        #[allow(clippy::type_complexity)]
        let mut rows_data: Vec<(
            Uuid,
            Uuid,
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            String,
        )> = Vec::new();
        if let Some(sid) = server_id {
            let mut stmt = conn.prepare(
                "SELECT id, user_id, game_name, address, note, server_id, room_code, kind, app_id, connect_command, created_at, expires_at
                 FROM game_hosts WHERE expires_at >= ?1 AND (server_id IS NULL OR server_id=?2)
                 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map(params![now, sid.to_string()], |r| {
                Ok((
                    Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                    Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                ))
            })?;
            for row in rows.flatten() {
                rows_data.push(row);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, user_id, game_name, address, note, server_id, room_code, kind, app_id, connect_command, created_at, expires_at
                 FROM game_hosts WHERE expires_at >= ?1 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map(params![now], |r| {
                Ok((
                    Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                    Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                ))
            })?;
            for row in rows.flatten() {
                rows_data.push(row);
            }
        }
        drop(conn);
        let mut out = Vec::new();
        for (
            id,
            uid,
            game_name,
            address,
            note,
            server_id,
            room_code,
            kind,
            app_id,
            connect_command,
            created_at,
            expires_at,
        ) in rows_data
        {
            let Some(user) = self.get_user(uid)? else {
                continue;
            };
            out.push(row_to_game_host(
                id,
                user,
                game_name,
                address,
                note,
                server_id,
                room_code,
                kind,
                app_id,
                connect_command,
                created_at,
                expires_at,
            ));
        }
        Ok(out)
    }

    pub fn delete_game_host(&self, id: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "DELETE FROM game_hosts WHERE id=?1",
            params![id.to_string()],
        )?;
        Ok(n > 0)
    }

    pub fn is_blocked_either(&self, a: Uuid, b: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM user_blocks
             WHERE (blocker_id=?1 AND blocked_id=?2) OR (blocker_id=?2 AND blocked_id=?1)",
            params![a.to_string(), b.to_string()],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    #[allow(dead_code)]
    pub fn is_blocked_by(&self, blocker: Uuid, blocked: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM user_blocks WHERE blocker_id=?1 AND blocked_id=?2",
            params![blocker.to_string(), blocked.to_string()],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    pub fn find_friendship_between(
        &self,
        a: Uuid,
        b: Uuid,
    ) -> anyhow::Result<Option<(Uuid, String, Uuid, Uuid)>> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, status, requester_id, addressee_id FROM friendships
                 WHERE (requester_id=?1 AND addressee_id=?2)
                    OR (requester_id=?2 AND addressee_id=?1)",
                params![a.to_string(), b.to_string()],
                |r| {
                    Ok((
                        Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                        r.get::<_, String>(1)?,
                        Uuid::parse_str(&r.get::<_, String>(2)?).unwrap(),
                        Uuid::parse_str(&r.get::<_, String>(3)?).unwrap(),
                    ))
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn create_friend_request(
        &self,
        requester: Uuid,
        addressee: Uuid,
    ) -> anyhow::Result<FriendRequestInfo> {
        if requester == addressee {
            anyhow::bail!("cannot friend yourself");
        }
        if self.is_blocked_either(requester, addressee)? {
            anyhow::bail!("cannot send friend request (blocked)");
        }
        if let Some((_, status, _, _)) = self.find_friendship_between(requester, addressee)? {
            if status == "accepted" {
                anyhow::bail!("already friends");
            }
            anyhow::bail!("friend request already pending");
        }
        let id = Uuid::new_v4();
        let now = Utc::now();
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
                 VALUES (?1,?2,?3,'pending',?4,?4)",
                params![
                    id.to_string(),
                    requester.to_string(),
                    addressee.to_string(),
                    now.to_rfc3339()
                ],
            )?;
        }
        let from = self
            .get_user(requester)?
            .ok_or_else(|| anyhow::anyhow!("user not found"))?;
        let to = self
            .get_user(addressee)?
            .ok_or_else(|| anyhow::anyhow!("user not found"))?;
        Ok(FriendRequestInfo {
            id,
            from,
            to,
            created_at: now,
        })
    }

    pub fn accept_friend_request(
        &self,
        request_id: Uuid,
        addressee: Uuid,
    ) -> anyhow::Result<UserPublic> {
        let conn = self.conn.lock().unwrap();
        let row: (String, String, String) = conn.query_row(
            "SELECT requester_id, addressee_id, status FROM friendships WHERE id=?1",
            params![request_id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let requester = Uuid::parse_str(&row.0)?;
        let addr = Uuid::parse_str(&row.1)?;
        if addr != addressee {
            anyhow::bail!("only the addressee can accept");
        }
        if row.2 != "pending" {
            anyhow::bail!("request is not pending");
        }
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE friendships SET status='accepted', updated_at=?1 WHERE id=?2",
            params![now, request_id.to_string()],
        )?;
        drop(conn);
        self.get_user(requester)?
            .ok_or_else(|| anyhow::anyhow!("user not found"))
    }

    pub fn decline_or_cancel_friend_request(
        &self,
        request_id: Uuid,
        actor: Uuid,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let row: (String, String, String) = conn.query_row(
            "SELECT requester_id, addressee_id, status FROM friendships WHERE id=?1",
            params![request_id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let requester = Uuid::parse_str(&row.0)?;
        let addressee = Uuid::parse_str(&row.1)?;
        if actor != requester && actor != addressee {
            anyhow::bail!("not a party to this request");
        }
        if row.2 != "pending" {
            anyhow::bail!("request is not pending");
        }
        conn.execute(
            "DELETE FROM friendships WHERE id=?1",
            params![request_id.to_string()],
        )?;
        Ok(())
    }

    pub fn remove_friendship(&self, actor: Uuid, other: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "DELETE FROM friendships
             WHERE status='accepted'
               AND ((requester_id=?1 AND addressee_id=?2)
                 OR (requester_id=?2 AND addressee_id=?1))",
            params![actor.to_string(), other.to_string()],
        )?;
        Ok(n > 0)
    }

    pub fn list_accepted_friends(
        &self,
        user_id: Uuid,
    ) -> anyhow::Result<Vec<(UserPublic, chrono::DateTime<Utc>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT requester_id, addressee_id, updated_at FROM friendships
             WHERE status='accepted' AND (requester_id=?1 OR addressee_id=?1)",
        )?;
        let rows = stmt.query_map(params![user_id.to_string()], |r| {
            Ok((
                Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                r.get::<_, String>(2)?,
            ))
        })?;
        let mut pairs = Vec::new();
        for row in rows.flatten() {
            pairs.push(row);
        }
        drop(stmt);
        drop(conn);
        let mut out = Vec::new();
        for (a, b, updated) in pairs {
            let other = if a == user_id { b } else { a };
            let Some(user) = self.get_user(other)? else {
                continue;
            };
            let since = chrono::DateTime::parse_from_rfc3339(&updated)
                .unwrap()
                .with_timezone(&Utc);
            out.push((user, since));
        }
        out.sort_by(|x, y| x.0.display_name.cmp(&y.0.display_name));
        Ok(out)
    }

    pub fn list_pending_requests(
        &self,
        user_id: Uuid,
        incoming: bool,
    ) -> anyhow::Result<Vec<FriendRequestInfo>> {
        let conn = self.conn.lock().unwrap();
        let sql = if incoming {
            "SELECT id, requester_id, addressee_id, created_at FROM friendships
             WHERE status='pending' AND addressee_id=?1 ORDER BY created_at DESC"
        } else {
            "SELECT id, requester_id, addressee_id, created_at FROM friendships
             WHERE status='pending' AND requester_id=?1 ORDER BY created_at DESC"
        };
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![user_id.to_string()], |r| {
            Ok((
                Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                Uuid::parse_str(&r.get::<_, String>(1)?).unwrap(),
                Uuid::parse_str(&r.get::<_, String>(2)?).unwrap(),
                r.get::<_, String>(3)?,
            ))
        })?;
        let mut raw = Vec::new();
        for row in rows.flatten() {
            raw.push(row);
        }
        drop(stmt);
        drop(conn);
        let mut out = Vec::new();
        for (id, from_id, to_id, created) in raw {
            let Some(from) = self.get_user(from_id)? else {
                continue;
            };
            let Some(to) = self.get_user(to_id)? else {
                continue;
            };
            out.push(FriendRequestInfo {
                id,
                from,
                to,
                created_at: chrono::DateTime::parse_from_rfc3339(&created)
                    .unwrap()
                    .with_timezone(&Utc),
            });
        }
        Ok(out)
    }

    pub fn block_user(&self, blocker: Uuid, blocked: Uuid) -> anyhow::Result<()> {
        if blocker == blocked {
            anyhow::bail!("cannot block yourself");
        }
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM friendships
             WHERE (requester_id=?1 AND addressee_id=?2)
                OR (requester_id=?2 AND addressee_id=?1)",
            params![blocker.to_string(), blocked.to_string()],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?1,?2,?3)",
            params![blocker.to_string(), blocked.to_string(), now],
        )?;
        conn.execute(
            "DELETE FROM user_ignores WHERE (user_id=?1 AND ignored_id=?2) OR (user_id=?2 AND ignored_id=?1)",
            params![blocker.to_string(), blocked.to_string()],
        )?;
        Ok(())
    }

    pub fn unblock_user(&self, blocker: Uuid, blocked: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "DELETE FROM user_blocks WHERE blocker_id=?1 AND blocked_id=?2",
            params![blocker.to_string(), blocked.to_string()],
        )?;
        Ok(n > 0)
    }

    pub fn list_blocked(&self, blocker: Uuid) -> anyhow::Result<Vec<UserPublic>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT blocked_id FROM user_blocks WHERE blocker_id=?1 ORDER BY created_at DESC",
        )?;
        let ids: Vec<Uuid> = stmt
            .query_map(params![blocker.to_string()], |r| {
                Ok(Uuid::parse_str(&r.get::<_, String>(0)?).unwrap())
            })?
            .flatten()
            .collect();
        drop(stmt);
        drop(conn);
        let mut out = Vec::new();
        for id in ids {
            if let Some(u) = self.get_user(id)? {
                out.push(u);
            }
        }
        Ok(out)
    }

    pub fn ignore_user(&self, user_id: Uuid, ignored: Uuid) -> anyhow::Result<()> {
        if user_id == ignored {
            anyhow::bail!("cannot ignore yourself");
        }
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO user_ignores (user_id, ignored_id, created_at) VALUES (?1,?2,?3)",
            params![user_id.to_string(), ignored.to_string(), now],
        )?;
        Ok(())
    }

    pub fn unignore_user(&self, user_id: Uuid, ignored: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "DELETE FROM user_ignores WHERE user_id=?1 AND ignored_id=?2",
            params![user_id.to_string(), ignored.to_string()],
        )?;
        Ok(n > 0)
    }

    pub fn list_ignored(&self, user_id: Uuid) -> anyhow::Result<Vec<UserPublic>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ignored_id FROM user_ignores WHERE user_id=?1 ORDER BY created_at DESC",
        )?;
        let ids: Vec<Uuid> = stmt
            .query_map(params![user_id.to_string()], |r| {
                Ok(Uuid::parse_str(&r.get::<_, String>(0)?).unwrap())
            })?
            .flatten()
            .collect();
        drop(stmt);
        drop(conn);
        let mut out = Vec::new();
        for id in ids {
            if let Some(u) = self.get_user(id)? {
                out.push(u);
            }
        }
        Ok(out)
    }

    #[allow(dead_code)]
    pub fn is_ignored(&self, user_id: Uuid, ignored: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM user_ignores WHERE user_id=?1 AND ignored_id=?2",
            params![user_id.to_string(), ignored.to_string()],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }
}

fn generate_invite() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect()
}

fn generate_room_code() -> String {
    use rand::Rng;
    // Easy to read aloud / type — no 0/O/1/I.
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect()
}

fn parse_host_kind(s: &str) -> GameHostKind {
    match s {
        "goldberg" => GameHostKind::Goldberg,
        _ => GameHostKind::Direct,
    }
}

#[allow(clippy::too_many_arguments)]
fn row_to_game_host(
    id: Uuid,
    user: UserPublic,
    game_name: String,
    address: String,
    note: String,
    server_id: Option<String>,
    room_code: String,
    kind: String,
    app_id: Option<String>,
    connect_command: Option<String>,
    created_at: String,
    expires_at: String,
) -> GameHostInfo {
    let room_code = if room_code.is_empty() {
        id.as_simple().to_string()[..6].to_uppercase()
    } else {
        room_code
    };
    GameHostInfo {
        id,
        room_code,
        user,
        game_name,
        address,
        note,
        kind: parse_host_kind(&kind),
        app_id,
        connect_command,
        server_id: server_id.and_then(|s| Uuid::parse_str(&s).ok()),
        created_at: chrono::DateTime::parse_from_rfc3339(&created_at)
            .unwrap()
            .with_timezone(&Utc),
        expires_at: chrono::DateTime::parse_from_rfc3339(&expires_at)
            .unwrap()
            .with_timezone(&Utc),
    }
}

#[allow(dead_code)]
pub fn max_upload_bytes(cfg: &ServerConfig) -> u64 {
    cfg.max_upload_mb * 1024 * 1024
}

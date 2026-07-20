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
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(dm_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_game_hosts_expires ON game_hosts(expires_at);
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

    pub fn find_user_by_username(&self, username: &str) -> anyhow::Result<Option<(UserPublic, String)>> {
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
            user.avatar_url = if a.is_empty() { None } else { Some(a.to_string()) };
        }
        if let Some(b) = banner_url {
            user.banner_url = if b.is_empty() { None } else { Some(b.to_string()) };
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
                kind: ChannelKind::from_str_kind(&r.get::<_, String>(3)?).unwrap_or(ChannelKind::Text),
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
        })
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
            })
        })?;
        let mut msgs: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        msgs.reverse();
        Ok(msgs)
    }

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
                "SELECT id FROM dms WHERE user_a=?1 AND user_b=?2",
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
            "INSERT INTO dms (id, user_a, user_b, updated_at) VALUES (?1,?2,?3,?4)",
            params![id.to_string(), a.to_string(), b.to_string(), now],
        )?;
        Ok(id)
    }

    pub fn list_dms(&self, user_id: Uuid) -> anyhow::Result<Vec<DmThread>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT d.id, d.updated_at,
                    CASE WHEN d.user_a = ?1 THEN d.user_b ELSE d.user_a END AS peer_id
             FROM dms d
             WHERE d.user_a=?1 OR d.user_b=?1
             ORDER BY d.updated_at DESC",
        )?;
        let peer_ids: Vec<(Uuid, Uuid, String)> = stmt
            .query_map(params![user_id.to_string()], |r| {
                Ok((
                    Uuid::parse_str(&r.get::<_, String>(0)?).unwrap(),
                    Uuid::parse_str(&r.get::<_, String>(2)?).unwrap(),
                    r.get(1)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        drop(conn);
        let mut out = Vec::new();
        for (dm_id, peer_id, updated) in peer_ids {
            if let Some(peer) = self.get_user(peer_id)? {
                out.push(DmThread {
                    id: dm_id,
                    peer,
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated)
                        .unwrap()
                        .with_timezone(&Utc),
                });
            }
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
        conn.execute("DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id=?1)", params![id.to_string()])?;
        conn.execute("DELETE FROM channels WHERE server_id=?1", params![id.to_string()])?;
        conn.execute("DELETE FROM members WHERE server_id=?1", params![id.to_string()])?;
        conn.execute("DELETE FROM servers WHERE id=?1", params![id.to_string()])?;
        Ok(())
    }

    pub fn purge_expired_game_hosts(&self) -> anyhow::Result<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM game_hosts WHERE expires_at < ?1", params![now])?;
        Ok(())
    }

    pub fn create_game_host(
        &self,
        user_id: Uuid,
        game_name: &str,
        address: &str,
        note: &str,
        server_id: Option<Uuid>,
        ttl_minutes: i64,
    ) -> anyhow::Result<GameHostInfo> {
        self.purge_expired_game_hosts()?;
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let expires_at = created_at + chrono::Duration::minutes(ttl_minutes);
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO game_hosts (id, user_id, game_name, address, note, server_id, created_at, expires_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                id.to_string(),
                user_id.to_string(),
                game_name,
                address,
                note,
                server_id.map(|s| s.to_string()),
                created_at.to_rfc3339(),
                expires_at.to_rfc3339(),
            ],
        )?;
        drop(conn);
        self.get_game_host(id)?
            .ok_or_else(|| anyhow::anyhow!("game host missing after insert"))
    }

    pub fn get_game_host(&self, id: Uuid) -> anyhow::Result<Option<GameHostInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, user_id, game_name, address, note, server_id, created_at, expires_at
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
            ))
        });
        let Ok((id, uid, game_name, address, note, server_id, created_at, expires_at)) = row else {
            return Ok(None);
        };
        drop(stmt);
        drop(conn);
        let user = self
            .get_user(uid)?
            .ok_or_else(|| anyhow::anyhow!("user missing"))?;
        Ok(Some(GameHostInfo {
            id,
            user,
            game_name,
            address,
            note,
            server_id: server_id.and_then(|s| Uuid::parse_str(&s).ok()),
            created_at: chrono::DateTime::parse_from_rfc3339(&created_at)
                .unwrap()
                .with_timezone(&Utc),
            expires_at: chrono::DateTime::parse_from_rfc3339(&expires_at)
                .unwrap()
                .with_timezone(&Utc),
        }))
    }

    pub fn list_game_hosts(&self, server_id: Option<Uuid>) -> anyhow::Result<Vec<GameHostInfo>> {
        self.purge_expired_game_hosts()?;
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let mut rows_data: Vec<(Uuid, Uuid, String, String, String, Option<String>, String, String)> =
            Vec::new();
        if let Some(sid) = server_id {
            let mut stmt = conn.prepare(
                "SELECT id, user_id, game_name, address, note, server_id, created_at, expires_at
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
                ))
            })?;
            for row in rows.flatten() {
                rows_data.push(row);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, user_id, game_name, address, note, server_id, created_at, expires_at
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
                ))
            })?;
            for row in rows.flatten() {
                rows_data.push(row);
            }
        }
        drop(conn);
        let mut out = Vec::new();
        for (id, uid, game_name, address, note, server_id, created_at, expires_at) in rows_data {
            let Some(user) = self.get_user(uid)? else {
                continue;
            };
            out.push(GameHostInfo {
                id,
                user,
                game_name,
                address,
                note,
                server_id: server_id.and_then(|s| Uuid::parse_str(&s).ok()),
                created_at: chrono::DateTime::parse_from_rfc3339(&created_at)
                    .unwrap()
                    .with_timezone(&Utc),
                expires_at: chrono::DateTime::parse_from_rfc3339(&expires_at)
                    .unwrap()
                    .with_timezone(&Utc),
            });
        }
        Ok(out)
    }

    pub fn delete_game_host(&self, id: Uuid) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute("DELETE FROM game_hosts WHERE id=?1", params![id.to_string()])?;
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

#[allow(dead_code)]
pub fn max_upload_bytes(cfg: &ServerConfig) -> u64 {
    cfg.max_upload_mb * 1024 * 1024
}

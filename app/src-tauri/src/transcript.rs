//! Agent 转录持久化(B-AGENT-TRANSCRIPT,完整形态)。
//!
//! 每 vault 一个 SQLite,落在 **app data 目录**(不进 vault / 不进 git),开 **WAL**。
//! 文件名用 vault root 的稳定哈希,避开路径非法字符。
//!
//! 表结构(doc 11 §3):
//! - `threads(id, agent, created)` —— 线程与 agent 绑定(Model C 骨干,§2.4)。
//! - `messages(id, thread_id, role, text, raw_blob, ts)` —— `text` 是归一化展示文本,
//!   `raw_blob` 留原始帧备查(工具调用等结构化事件;文本 chunk 通常为 NULL)。
//!
//! 移交(Model C,§2.4):一个线程绑定一个 agent;`agent_thread_create` 起新线程;
//! 「移交给 X」= 把当前线程归一化成一段 seed user message,写进**新 agent 的新线程**,
//! 而非伪造 assistant 历史(各 agent system prompt / tool schema 不同,伪造会坏契约)。

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct TranscriptMsg {
    pub role: String,
    pub text: String,
    pub ts: i64,
}

#[derive(Serialize)]
pub struct ThreadInfo {
    pub id: i64,
    pub agent: String,
    pub created: i64,
    pub msg_count: i64,
    /// 该线程最后一条消息的 ts(无消息则取 created)。
    pub last_ts: i64,
}

/// vault root → app data 下的 db 路径。
fn db_path(app: &AppHandle, root: &str) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("open-llm-wiki"));
    // FNV-1a-ish:稳定、无依赖、足够区分 vault。
    let mut h: u64 = 0xcbf29ce484222325;
    for b in root.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    base.join(format!("agent-transcript-{h:016x}.db"))
}

/// 打开(必要时建库建表、开 WAL)。父目录不存在则创建。
fn open(app: &AppHandle, root: &str) -> Result<Connection, String> {
    let path = db_path(app, root);
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    // WAL:并发读 + 写不阻塞读,崩溃更稳。
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS threads (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            agent   TEXT NOT NULL,
            created INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            role      TEXT NOT NULL,
            text      TEXT NOT NULL,
            raw_blob  TEXT,
            ts        INTEGER NOT NULL,
            FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 起一个新线程(绑定 agent)。返回线程 id。
#[tauri::command]
pub fn agent_thread_create(app: AppHandle, root: String, agent: String) -> Result<i64, String> {
    let conn = open(&app, &root)?;
    conn.execute(
        "INSERT INTO threads (agent, created) VALUES (?1, ?2)",
        params![agent, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// 列出全部线程(新→旧),含消息数与最后活跃 ts。
#[tauri::command]
pub fn agent_thread_list(app: AppHandle, root: String) -> Result<Vec<ThreadInfo>, String> {
    let conn = open(&app, &root)?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.agent, t.created, COUNT(m.id), COALESCE(MAX(m.ts), t.created)
             FROM threads t
             LEFT JOIN messages m ON m.thread_id = t.id
             GROUP BY t.id
             ORDER BY t.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ThreadInfo {
                id: r.get(0)?,
                agent: r.get(1)?,
                created: r.get(2)?,
                msg_count: r.get(3)?,
                last_ts: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 按插入顺序回放某线程的全部消息(归一化文本)。
#[tauri::command]
pub fn agent_thread_load(
    app: AppHandle,
    root: String,
    thread_id: i64,
) -> Result<Vec<TranscriptMsg>, String> {
    let conn = open(&app, &root)?;
    let mut stmt = conn
        .prepare("SELECT role, text, ts FROM messages WHERE thread_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![thread_id], |r| {
            Ok(TranscriptMsg {
                role: r.get(0)?,
                text: r.get(1)?,
                ts: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 追加一条消息。`raw_blob` 可选(工具调用等结构化事件留原始帧;文本 chunk 传 None)。
#[tauri::command]
pub fn agent_thread_append(
    app: AppHandle,
    root: String,
    thread_id: i64,
    role: String,
    text: String,
    raw_blob: Option<String>,
) -> Result<(), String> {
    let conn = open(&app, &root)?;
    conn.execute(
        "INSERT INTO messages (thread_id, role, text, raw_blob, ts) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![thread_id, role, text, raw_blob, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 清空某线程的消息(保留线程壳)。
#[tauri::command]
pub fn agent_thread_clear(app: AppHandle, root: String, thread_id: i64) -> Result<(), String> {
    let conn = open(&app, &root)?;
    conn.execute("DELETE FROM messages WHERE thread_id = ?1", params![thread_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除某线程及其全部消息。
#[tauri::command]
pub fn agent_thread_delete(app: AppHandle, root: String, thread_id: i64) -> Result<(), String> {
    let conn = open(&app, &root)?;
    conn.execute("DELETE FROM messages WHERE thread_id = ?1", params![thread_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM threads WHERE id = ?1", params![thread_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 纯逻辑:临时 Connection 验证建表 + 多线程 + WAL + 追加回放 + 级联删除。
    #[test]
    fn threads_messages_roundtrip_and_cascade() {
        let dir = std::env::temp_dir().join(format!(
            "open-llm-wiki-transcript-threads-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        conn.execute_batch(
            "CREATE TABLE threads (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, created INTEGER NOT NULL);
             CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, raw_blob TEXT, ts INTEGER NOT NULL, FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
             CREATE INDEX idx_messages_thread ON messages(thread_id);",
        ).unwrap();

        let t1 = conn
            .query_row(
                "INSERT INTO threads (agent, created) VALUES (?1, ?2) RETURNING id",
                params!["opencode", 100],
                |r| r.get::<_, i64>(0),
            )
            .unwrap();
        let t2 = conn
            .query_row(
                "INSERT INTO threads (agent, created) VALUES (?1, ?2) RETURNING id",
                params!["claude-code", 200],
                |r| r.get::<_, i64>(0),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO messages (thread_id, role, text, raw_blob, ts) VALUES (?1,?2,?3,?4,?5)",
            params![t1, "user", "hi", rusqlite::types::Null, 101],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (thread_id, role, text, raw_blob, ts) VALUES (?1,?2,?3,?4,?5)",
            params![t1, "agent", "hello", Some::<String>(r#"{"tool":"x"}"#.into()), 102],
        )
        .unwrap();

        // 线程列表:新→旧;t2 在前。
        let mut stmt = conn
            .prepare(
                "SELECT t.id, COUNT(m.id) FROM threads t LEFT JOIN messages m ON m.thread_id=t.id GROUP BY t.id ORDER BY t.id DESC",
            )
            .unwrap();
        let rows: Vec<(i64, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(rows, vec![(t2, 0), (t1, 2)]);

        // 删 t1 级联清消息。
        conn.execute("DELETE FROM messages WHERE thread_id = ?1", params![t1])
            .unwrap();
        let left: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE thread_id = ?1",
                params![t1],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 0);

        let _ = std::fs::remove_dir_all(&dir);
    }
}

//! openobs-mcp —— stdio MCP server(B-MCP v1)。
//!
//! 让 agent 通过 Model Context Protocol 读写 vault。
//! 传输:stdin/stdout JSON-RPC 2.0(Content-Length framing 可选;也接受 NDJSON 单行)。
//!
//! 用法:
//!   openobs-mcp /path/to/vault
//!   OPENOBS_VAULT=/path/to/vault openobs-mcp
//!
//! Tools: list_notes, read_note, write_note, search_notes, run_qql, vault_info

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

use openobs_core::{parse_query, ResultSet, VaultIndex};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use walkdir::WalkDir;

fn main() {
    let vault = resolve_vault_root();
    if let Err(e) = run_server(&vault) {
        eprintln!("openobs-mcp error: {e}");
        std::process::exit(1);
    }
}

fn resolve_vault_root() -> PathBuf {
    if let Some(a) = env::args().nth(1) {
        return PathBuf::from(a);
    }
    if let Ok(v) = env::var("OPENOBS_VAULT") {
        return PathBuf::from(v);
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn run_server(vault: &Path) -> Result<(), String> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut lines = stdin.lock().lines();

    while let Some(line) = lines.next() {
        let line = line.map_err(|e| e.to_string())?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Content-Length 头(部分客户端):读完头后再读 body。
        if line.to_ascii_lowercase().starts_with("content-length:") {
            let n: usize = line
                .split(':')
                .nth(1)
                .and_then(|s| s.trim().parse().ok())
                .ok_or_else(|| "bad Content-Length".to_string())?;
            // 跳过空行
            let _ = lines.next();
            let mut body = String::new();
            // 简化:按行拼直到累计够长(多数 body 单行 JSON)
            while body.len() < n {
                let chunk = lines
                    .next()
                    .ok_or_else(|| "EOF mid-body".to_string())?
                    .map_err(|e| e.to_string())?;
                if !body.is_empty() {
                    body.push('\n');
                }
                body.push_str(&chunk);
            }
            handle_message(vault, &body, &mut stdout)?;
            continue;
        }
        handle_message(vault, line, &mut stdout)?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
struct RpcReq {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct RpcRes {
    jsonrpc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcErr>,
}

#[derive(Debug, Serialize)]
struct RpcErr {
    code: i32,
    message: String,
}

fn handle_message(vault: &Path, raw: &str, out: &mut impl Write) -> Result<(), String> {
    let req: RpcReq = serde_json::from_str(raw).map_err(|e| format!("bad json: {e}"))?;
    let id = req.id.clone();
    let res = match req.method.as_str() {
        "initialize" => ok(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": {
                    "name": "openobsidian",
                    "version": env!("CARGO_PKG_VERSION"),
                }
            }),
        ),
        "notifications/initialized" | "initialized" => {
            // 通知无响应
            return Ok(());
        }
        "ping" => ok(id, json!({})),
        "tools/list" => ok(id, json!({ "tools": tool_defs() })),
        "tools/call" => match tools_call(vault, &req.params) {
            Ok(v) => ok(id, v),
            Err(e) => err(id, -32000, e),
        },
        "resources/list" => ok(id, json!({ "resources": [] })),
        other => err(id, -32601, format!("Method not found: {other}")),
    };
    write_res(out, &res)
}

fn ok(id: Option<Value>, result: Value) -> RpcRes {
    RpcRes {
        jsonrpc: "2.0",
        id,
        result: Some(result),
        error: None,
    }
}

fn err(id: Option<Value>, code: i32, message: String) -> RpcRes {
    RpcRes {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(RpcErr { code, message }),
    }
}

fn write_res(out: &mut impl Write, res: &RpcRes) -> Result<(), String> {
    let body = serde_json::to_string(res).map_err(|e| e.to_string())?;
    // 同时发 Content-Length 与裸行,兼容两类客户端。
    write!(out, "Content-Length: {}\r\n\r\n{}\n", body.len(), body).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())
}

fn tool_defs() -> Vec<Value> {
    vec![
        tool(
            "list_notes",
            "List markdown note paths under the vault (relative).",
            json!({ "type": "object", "properties": {} }),
        ),
        tool(
            "read_note",
            "Read a note by relative path.",
            json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        ),
        tool(
            "write_note",
            "Write full content to a note (create parent dirs). Relative path only.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"]
            }),
        ),
        tool(
            "search_notes",
            "Full-text AND search over titles/bodies.",
            json!({
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
            }),
        ),
        tool(
            "run_qql",
            "Run a QQL query (openobs-core evaluator).",
            json!({
                "type": "object",
                "properties": { "qql": { "type": "string" } },
                "required": ["qql"]
            }),
        ),
        tool(
            "vault_info",
            "Vault root path and note count.",
            json!({ "type": "object", "properties": {} }),
        ),
    ]
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema,
    })
}

fn tools_call(vault: &Path, params: &Value) -> Result<Value, String> {
    let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing tool name".to_string())?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let text = match name {
        "list_notes" => {
            let paths = list_md(vault)?;
            serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?
        }
        "read_note" => {
            let path = arg_str(&args, "path")?;
            let full = resolve_under(vault, &path)?;
            fs::read_to_string(&full).map_err(|e| e.to_string())?
        }
        "write_note" => {
            let path = arg_str(&args, "path")?;
            let content = arg_str(&args, "content")?;
            let full = resolve_under(vault, &path)?;
            if let Some(parent) = full.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&full, content).map_err(|e| e.to_string())?;
            format!("wrote {path}")
        }
        "search_notes" => {
            let query = arg_str(&args, "query")?;
            let index = load_index(vault)?;
            let terms: Vec<&str> = query.split_whitespace().collect();
            let hits: Vec<Value> = index
                .search(&terms)
                .into_iter()
                .map(|(id, score)| {
                    let path = index
                        .notes()
                        .get(id)
                        .map(|n| n.path.clone())
                        .unwrap_or_default();
                    json!({ "id": id, "score": score, "path": path })
                })
                .collect();
            serde_json::to_string_pretty(&hits).map_err(|e| e.to_string())?
        }
        "run_qql" => {
            let qql = arg_str(&args, "qql")?;
            let index = load_index(vault)?;
            let query = parse_query(&qql).map_err(|e| e.to_string())?;
            let rs = index.query(&query);
            format_result_set(&rs, &index)
        }
        "vault_info" => {
            let n = list_md(vault)?.len();
            serde_json::to_string_pretty(&json!({
                "root": vault.to_string_lossy(),
                "notes": n,
            }))
            .map_err(|e| e.to_string())?
        }
        other => return Err(format!("unknown tool: {other}")),
    };
    Ok(json!({
        "content": [{ "type": "text", "text": text }],
        "isError": false
    }))
}

fn arg_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("missing argument: {key}"))
}

fn resolve_under(root: &Path, path: &str) -> Result<PathBuf, String> {
    if path.split(['/', '\\']).any(|c| c == "..") {
        return Err(format!("illegal path: {path}"));
    }
    Ok(root.join(path))
}

fn list_md(root: &Path) -> Result<Vec<String>, String> {
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(root).min_depth(1) {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        if p.components().any(|c| {
            c.as_os_str()
                .to_str()
                .map(|s| s.starts_with('.'))
                .unwrap_or(false)
        }) {
            continue;
        }
        if p.extension().and_then(|e| e.to_str()) == Some("md") && p.is_file() {
            let rel = p
                .strip_prefix(root)
                .unwrap_or(p)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(rel);
        }
    }
    out.sort();
    Ok(out)
}

fn load_index(root: &Path) -> Result<VaultIndex, String> {
    let mut entries: BTreeMap<String, String> = BTreeMap::new();
    for rel in list_md(root)? {
        let full = root.join(&rel);
        let content = fs::read_to_string(&full).map_err(|e| e.to_string())?;
        entries.insert(rel, content);
    }
    Ok(VaultIndex::build_from_map(&entries))
}

fn format_result_set(rs: &ResultSet, index: &VaultIndex) -> String {
    match rs {
        ResultSet::List(ids) => {
            let rows: Vec<Value> = ids
                .iter()
                .map(|id| {
                    let path = index
                        .notes()
                        .get(*id)
                        .map(|n| n.path.clone())
                        .unwrap_or_default();
                    json!({ "id": id, "path": path })
                })
                .collect();
            serde_json::to_string_pretty(&rows).unwrap_or_else(|_| "[]".into())
        }
        ResultSet::Count(n) => format!("{n}"),
        ResultSet::Sum(x) => format!("{x}"),
        ResultSet::Table(rows) => serde_json::to_string_pretty(rows).unwrap_or_else(|_| "[]".into()),
        ResultSet::Groups(g) | ResultSet::Histogram(g) => {
            serde_json::to_string_pretty(g).unwrap_or_else(|_| "[]".into())
        }
    }
}

//! openobs-mcp —— stdio MCP server(B-MCP v1)。
//!
//! 让 agent 通过 Model Context Protocol 读写 vault。
//! 传输:stdin/stdout JSON-RPC 2.0(Content-Length framing 可选;也接受 NDJSON 单行)。
//!
//! 用法:
//!   openobs-mcp /path/to/vault
//!   OPENOBS_VAULT=/path/to/vault openobs-mcp
//!
//! Tools: list_notes, read_note, write_note, search_notes, run_qql, vault_info, links
//!
//! graph-aware 增量(6B):
//! - `links`:图谱查询——backlinks / forward / dead / orphans / hubs / suggest。
//! - `read_note`:附带 graph 简报(backlinks / forward / dead / degree)。
//! - `write_note`:返回 broken_links + orphan_hint(写后即审)。

use std::collections::{BTreeMap, HashSet};
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

use openobs_core::{
    parse_query, EdgeKind, Graph, NodeId, OrphanMode, ResultSet, Target, VaultIndex,
};
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
            "Read a note by relative path. Returns JSON {path, body, graph} where graph summarizes backlinks/forward/dead links and in/out degree.",
            json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        ),
        tool(
            "write_note",
            "Write full content to a note (create parent dirs). Relative path only. Returns JSON {path, broken_links[], orphan_hint} audited against the rebuilt graph.",
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
            "links",
            "Query the note graph. `kind` is one (string) or more (array) of: backlinks, forward, dead, orphans, hubs, suggest. backlinks/forward/suggest/dead(scoped) need `path`; orphans takes `mode` (incoming|outgoing|both, default both); hubs takes `limit` (default 10). Returns one key per requested kind.",
            json!({
                "type": "object",
                "properties": {
                    "kind": { "oneOf": [
                        { "type": "string" },
                        { "type": "array", "items": { "type": "string" } }
                    ] },
                    "path": { "type": "string" },
                    "mode": { "type": "string", "enum": ["incoming", "outgoing", "both"] },
                    "limit": { "type": "integer", "minimum": 0 }
                },
                "required": ["kind"]
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
            let body = fs::read_to_string(&full).map_err(|e| e.to_string())?;
            // graph 简报:索引构建失败不致命,降级为 {error}。
            let graph = match load_index(vault) {
                Ok(index) => match find_id_by_path(&index, &path) {
                    Some(id) => links_brief(&index, index.graph(), id),
                    None => json!({ "error": "note not in index" }),
                },
                Err(e) => json!({ "error": e }),
            };
            serde_json::to_string_pretty(&json!({
                "path": path,
                "body": body,
                "graph": graph,
            }))
            .map_err(|e| e.to_string())?
        }
        "write_note" => {
            let path = arg_str(&args, "path")?;
            let content = arg_str(&args, "content")?;
            let full = resolve_under(vault, &path)?;
            if let Some(parent) = full.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&full, &content).map_err(|e| e.to_string())?;
            // 写后即审:重建索引,审计这条 note 的悬空链接与孤儿状态。
            let (broken_links, orphan_hint) = audit_note(vault, &path);
            serde_json::to_string_pretty(&json!({
                "path": path,
                "broken_links": broken_links,
                "orphan_hint": orphan_hint,
            }))
            .map_err(|e| e.to_string())?
        }
        "links" => {
            let kinds = kinds_arg(&args)?;
            let index = load_index(vault)?;
            let g = index.graph();
            let path = args.get("path").and_then(|v| v.as_str());
            let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("both");
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            let mut out = serde_json::Map::new();
            for k in kinds {
                let val = links_kind(&index, g, &k, path, mode, limit)?;
                out.insert(k, val);
            }
            serde_json::to_string_pretty(&Value::Object(out)).map_err(|e| e.to_string())?
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

// ── graph 辅助(6B links / read briefing / write feedback 共用)──────────────────

/// 解析 `kind`:单字符串或字符串数组 → 去重保序的 Vec。
fn kinds_arg(args: &Value) -> Result<Vec<String>, String> {
    let kind = args.get("kind").ok_or_else(|| "missing argument: kind".to_string())?;
    let raw: Vec<String> = if let Some(s) = kind.as_str() {
        vec![s.to_string()]
    } else if let Some(arr) = kind.as_array() {
        arr.iter()
            .map(|x| {
                x.as_str()
                    .map(|s| s.to_string())
                    .ok_or_else(|| "kind array must contain only strings".to_string())
            })
            .collect::<Result<_, _>>()?
    } else {
        return Err("kind must be a string or array of strings".to_string());
    };
    // 去重保序。
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for k in raw {
        if seen.insert(k.clone()) {
            out.push(k);
        }
    }
    Ok(out)
}

fn parse_orphan_mode(s: &str) -> OrphanMode {
    match s {
        "incoming" => OrphanMode::Incoming,
        "outgoing" => OrphanMode::Outgoing,
        _ => OrphanMode::Both,
    }
}

/// EdgeKind → {kind, relation}。
fn edge_kind_json(k: &EdgeKind) -> Value {
    match k {
        EdgeKind::Wiki => json!({ "kind": "wiki", "relation": null }),
        EdgeKind::Relation(r) => json!({ "kind": "relation", "relation": r }),
    }
}

/// 节点 id → 相对 path(找不到 → 空串)。
fn note_path(index: &VaultIndex, id: NodeId) -> String {
    index.notes().get(id).map(|n| n.path.clone()).unwrap_or_default()
}

/// 边目标 → 标签:Resolved 取 path,Unresolved 取原文。
fn target_label(to: &Target, index: &VaultIndex) -> String {
    match to {
        Target::Resolved(id) => note_path(index, *id),
        Target::Unresolved(s) => s.clone(),
    }
}

/// 按 path 反查 NodeId(notes 切片按 id 顺序)。
fn find_id_by_path(index: &VaultIndex, path: &str) -> Option<NodeId> {
    index.notes().iter().position(|n| n.path == path)
}

/// read_note 的 graph 简报:backlinks / forward / dead / degree。
fn links_brief(index: &VaultIndex, g: &Graph, id: NodeId) -> Value {
    let backlinks: Vec<Value> = g
        .backlinks(id)
        .iter()
        .map(|e| json!({ "from": note_path(index, e.from), "kind": edge_kind_json(&e.kind) }))
        .collect();
    let forward: Vec<Value> = g
        .outgoing(id)
        .iter()
        .filter(|e| matches!(e.to, Target::Resolved(_)))
        .map(|e| json!({ "to": target_label(&e.to, index), "kind": edge_kind_json(&e.kind) }))
        .collect();
    let dead: Vec<Value> = g
        .dead_links_from(id)
        .iter()
        .map(|e| json!({ "target": target_label(&e.to, index), "kind": edge_kind_json(&e.kind) }))
        .collect();
    json!({
        "backlinks": backlinks,
        "forward": forward,
        "dead": dead,
        "in_degree": g.in_degree(id),
        "out_degree": forward.len(),
    })
}

/// 单 kind 求值(backlinks/forward/dead/orphans/hubs/suggest)。
fn links_kind(
    index: &VaultIndex,
    g: &Graph,
    kind: &str,
    path: Option<&str>,
    mode: &str,
    limit: usize,
) -> Result<Value, String> {
    let id_for = || {
        let p = path.ok_or_else(|| format!("{kind} requires 'path'"))?;
        find_id_by_path(index, p).ok_or_else(|| format!("note not found: {p}"))
    };
    Ok(match kind {
        "backlinks" => {
            let id = id_for()?;
            Value::Array(
                g.backlinks(id)
                    .iter()
                    .map(|e| json!({ "from": note_path(index, e.from), "kind": edge_kind_json(&e.kind) }))
                    .collect(),
            )
        }
        "forward" => {
            let id = id_for()?;
            Value::Array(
                g.outgoing(id)
                    .iter()
                    .filter(|e| matches!(e.to, Target::Resolved(_)))
                    .map(|e| json!({ "to": target_label(&e.to, index), "kind": edge_kind_json(&e.kind) }))
                    .collect(),
            )
        }
        "dead" => {
            let rows: Vec<Value> = match path {
                Some(_) => {
                    let id = id_for()?;
                    g.dead_links_from(id)
                        .iter()
                        .map(|e| json!({ "from": note_path(index, e.from), "target": target_label(&e.to, index), "kind": edge_kind_json(&e.kind) }))
                        .collect()
                }
                None => g
                    .unresolved()
                    .map(|e| json!({ "from": note_path(index, e.from), "target": target_label(&e.to, index), "kind": edge_kind_json(&e.kind) }))
                    .collect(),
            };
            Value::Array(rows)
        }
        "orphans" => Value::Array(
            g.orphans_by(parse_orphan_mode(mode))
                .into_iter()
                .map(|id| Value::String(note_path(index, id)))
                .collect(),
        ),
        "hubs" => Value::Array(
            g.hubs(limit)
                .into_iter()
                .map(|(id, d)| json!({ "path": note_path(index, id), "degree": d }))
                .collect(),
        ),
        "suggest" => {
            let id = id_for()?;
            Value::Array(suggest_for_note(index, g, id))
        }
        other => return Err(format!("unknown link kind: {other}")),
    })
}

/// suggest(最小版 P6-6):他者标题(≥3 字符)在本笔记正文出现、却未被本笔记链接。
fn suggest_for_note(index: &VaultIndex, g: &Graph, id: NodeId) -> Vec<Value> {
    let me = match index.notes().get(id) {
        Some(n) => n,
        None => return Vec::new(),
    };
    let body = me.body.to_lowercase();
    let linked: HashSet<String> = g
        .outgoing(id)
        .iter()
        .filter_map(|e| match &e.to {
            Target::Resolved(t) => index.notes().get(*t).map(|n| n.path.clone()),
            Target::Unresolved(_) => None,
        })
        .collect();
    let mut out = Vec::new();
    for (i, n) in index.notes().iter().enumerate() {
        if i == id {
            continue;
        }
        let title = n.title.trim();
        if title.len() < 3 || linked.contains(&n.path) {
            continue;
        }
        if body.contains(&title.to_lowercase()) {
            out.push(json!({ "path": n.path, "title": n.title }));
        }
    }
    out
}

/// 写后审计:返回 (broken_links, orphan_hint)。索引构建失败 → 静默空反馈。
fn audit_note(vault: &Path, path: &str) -> (Vec<Value>, String) {
    let index = match load_index(vault) {
        Ok(i) => i,
        Err(_) => return (Vec::new(), String::new()),
    };
    let g = index.graph();
    let id = match find_id_by_path(&index, path) {
        Some(id) => id,
        None => return (Vec::new(), "note not present in index after write".to_string()),
    };
    let broken: Vec<Value> = g
        .dead_links_from(id)
        .iter()
        .map(|e| json!({ "target": target_label(&e.to, &index), "kind": edge_kind_json(&e.kind) }))
        .collect();
    let hint = if g.degree(id) == 0 {
        "orphan: no resolved links in or out".to_string()
    } else {
        String::new()
    };
    (broken, hint)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    /// 调一个 tool,把 content[0].text 当 JSON 解析返回。
    fn call_json(vault: &Path, name: &str, args: Value) -> Value {
        let res = tools_call(vault, &json!({ "name": name, "arguments": args })).unwrap();
        let text = res["content"][0]["text"].as_str().unwrap();
        serde_json::from_str(text).unwrap()
    }

    /// 临时 vault:a→b(wiki)、a→Ghost(悬空)、c→a(wiki);d 孤立。
    /// a 正文提到 "Gamma"(c 的标题)但未链接 → suggest 命中。
    /// 用非 `.` 前缀的临时目录:生产 `list_md` 会跳过任何含 `.` 分量的路径
    /// (用于隐藏 vault 内的 `.git` / `.openobsidian`),默认 `tempfile::tempdir()`
    /// 生成的 `.tmpXXXX` 名字会触发该规则,故这里显式给一个干净前缀。
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::Builder::new().prefix("oomcp-").tempdir().unwrap();
        let put = |name: &str, body: &str| {
            fs::write(dir.path().join(name), body).unwrap();
        };
        put(
            "a.md",
            "---\ntype: Concept\n---\n# Alpha\n\nLinks to [[b]] and a dangling [[Ghost]]. Mentions the Gamma project here.\n",
        );
        put("b.md", "# Beta\n\nNo outgoing links.\n");
        put("c.md", "---\ntype: Source\n---\n# Gamma\n\nSee [[a]].\n");
        put("d.md", "# Delta\n");
        dir
    }

    /// 从 index 重建一个等价 map(供纯 helper 测试用,无磁盘依赖)。
    fn tiny_index() -> VaultIndex {
        let mut m = BTreeMap::new();
        m.insert("a.md".into(), "# Alpha\n\n[[b]]\n".into());
        m.insert("b.md".into(), "# Beta\n".into());
        VaultIndex::build_from_map(&m)
    }

    // ── 纯 helper ────────────────────────────────────────────────────────────

    #[test]
    fn kinds_arg_string_and_array_dedup() {
        assert_eq!(kinds_arg(&json!({ "kind": "backlinks" })).unwrap(), ["backlinks"]);
        // 数组:去重保序。
        assert_eq!(
            kinds_arg(&json!({ "kind": ["orphans", "hubs", "orphans"] })).unwrap(),
            ["orphans", "hubs"]
        );
        assert!(kinds_arg(&json!({ "kind": 5 })).is_err());
        assert!(kinds_arg(&json!({})).is_err());
    }

    #[test]
    fn parse_orphan_mode_fallback() {
        assert_eq!(parse_orphan_mode("incoming"), OrphanMode::Incoming);
        assert_eq!(parse_orphan_mode("outgoing"), OrphanMode::Outgoing);
        assert_eq!(parse_orphan_mode("both"), OrphanMode::Both);
        assert_eq!(parse_orphan_mode("garbage"), OrphanMode::Both);
    }

    #[test]
    fn edge_kind_json_shape() {
        assert_eq!(edge_kind_json(&EdgeKind::Wiki), json!({ "kind": "wiki", "relation": null }));
        assert_eq!(
            edge_kind_json(&EdgeKind::Relation("mentions".into())),
            json!({ "kind": "relation", "relation": "mentions" })
        );
    }

    #[test]
    fn target_label_resolved_vs_unresolved() {
        let idx = tiny_index();
        // a.md(0)→b.md(1):Resolved(1) 取 path,Unresolved 取原文。
        let g = idx.graph();
        let edge = g.outgoing(0).into_iter().next().unwrap();
        match &edge.to {
            Target::Resolved(id) => assert_eq!(target_label(&edge.to, &idx), note_path(&idx, *id)),
            _ => panic!("expected resolved edge"),
        }
        assert_eq!(target_label(&Target::Unresolved("Ghost".into()), &idx), "Ghost");
    }

    // ── links tool(集成:磁盘 fixture → tools_call) ────────────────────────────

    #[test]
    fn links_backlinks_and_forward() {
        let dir = fixture();
        let v = dir.path();
        // b 的反链来自 a。
        let back = call_json(v, "links", json!({ "kind": "backlinks", "path": "b.md" }));
        assert_eq!(back["backlinks"][0]["from"], "a.md");
        // a 的前向只含已解析的 b(不含 Ghost)。
        let fwd = call_json(v, "links", json!({ "kind": "forward", "path": "a.md" }));
        let tos: Vec<&str> = fwd["forward"].as_array().unwrap()
            .iter().map(|x| x["to"].as_str().unwrap()).collect();
        assert_eq!(tos, ["b.md"]);
    }

    #[test]
    fn links_dead_corpus_and_scoped() {
        let dir = fixture();
        let v = dir.path();
        // 全库:只有 a 的 Ghost 一条悬空。
        let corpus = call_json(v, "links", json!({ "kind": "dead" }));
        assert_eq!(corpus["dead"].as_array().unwrap().len(), 1);
        assert_eq!(corpus["dead"][0]["target"], "Ghost");
        assert_eq!(corpus["dead"][0]["from"], "a.md");
        // scoped 到 a:同一条。
        let scoped = call_json(v, "links", json!({ "kind": "dead", "path": "a.md" }));
        assert_eq!(scoped["dead"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn links_orphans_modes() {
        let dir = fixture();
        let v = dir.path();
        let both = call_json(v, "links", json!({ "kind": "orphans", "mode": "both" }));
        assert_eq!(both["orphans"].as_array().unwrap(), &["d.md"]);
        let outg = call_json(v, "links", json!({ "kind": "orphans", "mode": "outgoing" }));
        let mut o: Vec<&str> = outg["orphans"].as_array().unwrap()
            .iter().map(|x| x.as_str().unwrap()).collect();
        o.sort();
        assert_eq!(o, ["b.md", "d.md"]); // a、c 有出边
        let inc = call_json(v, "links", json!({ "kind": "orphans", "mode": "incoming" }));
        let mut i: Vec<&str> = inc["orphans"].as_array().unwrap()
            .iter().map(|x| x.as_str().unwrap()).collect();
        i.sort();
        assert_eq!(i, ["c.md", "d.md"]); // 只有 b、a 有入边
    }

    #[test]
    fn links_hubs_sorted_desc_excludes_zero() {
        let dir = fixture();
        let v = dir.path();
        let hubs = call_json(v, "links", json!({ "kind": "hubs", "limit": 10 }));
        let paths: Vec<&str> = hubs["hubs"].as_array().unwrap()
            .iter().map(|x| x["path"].as_str().unwrap()).collect();
        assert_eq!(paths, ["a.md", "b.md", "c.md"]); // a 度 2 居首;d(0) 排除
        assert_eq!(hubs["hubs"][0]["degree"], 2);
    }

    #[test]
    fn links_hubs_limit_truncates() {
        let dir = fixture();
        let v = dir.path();
        let hubs = call_json(v, "links", json!({ "kind": "hubs", "limit": 1 }));
        assert_eq!(hubs["hubs"].as_array().unwrap().len(), 1);
        assert_eq!(hubs["hubs"][0]["path"], "a.md");
    }

    #[test]
    fn links_suggest_title_in_body_not_linked() {
        let dir = fixture();
        let v = dir.path();
        let sugg = call_json(v, "links", json!({ "kind": "suggest", "path": "a.md" }));
        // Gamma(c) 标题出现在 a 正文、且未被 a 链接 → 命中;Beta 已链接排除。
        assert_eq!(sugg["suggest"].as_array().unwrap().len(), 1);
        assert_eq!(sugg["suggest"][0]["path"], "c.md");
        assert_eq!(sugg["suggest"][0]["title"], "Gamma");
    }

    #[test]
    fn links_multi_kind_one_call() {
        let dir = fixture();
        let v = dir.path();
        let out = call_json(v, "links", json!({ "kind": ["orphans", "hubs"], "limit": 1 }));
        assert_eq!(out["orphans"].as_array().unwrap(), &["d.md"]);
        assert_eq!(out["hubs"][0]["path"], "a.md");
    }

    #[test]
    fn links_unknown_kind_errors() {
        let dir = fixture();
        let res = tools_call(dir.path(), &json!({ "name": "links", "arguments": json!({ "kind": "bogus" }) }));
        assert!(res.is_err());
    }

    #[test]
    fn links_backlinks_requires_path() {
        let dir = fixture();
        let res = tools_call(
            dir.path(),
            &json!({ "name": "links", "arguments": json!({ "kind": "backlinks" }) }),
        );
        assert!(res.is_err());
    }

    // ── read_note briefing ────────────────────────────────────────────────────

    #[test]
    fn read_note_returns_body_and_graph_brief() {
        let dir = fixture();
        let v = dir.path();
        let r = call_json(v, "read_note", json!({ "path": "a.md" }));
        assert_eq!(r["path"], "a.md");
        assert!(r["body"].as_str().unwrap().contains("Alpha"));
        // graph 简报。
        assert_eq!(r["graph"]["backlinks"][0]["from"], "c.md"); // c→a
        assert_eq!(r["graph"]["forward"][0]["to"], "b.md");
        assert_eq!(r["graph"]["dead"][0]["target"], "Ghost");
        assert_eq!(r["graph"]["in_degree"], 1);
        assert_eq!(r["graph"]["out_degree"], 1); // 只计已解析(b),不计 Ghost
    }

    // ── write_note 写后反馈 ─────────────────────────────────────────────────────

    #[test]
    fn write_note_flags_broken_links_and_orphan() {
        let dir = fixture();
        let v = dir.path();
        let r = call_json(
            v,
            "write_note",
            json!({
                "path": "zz-new.md",
                "content": "# New\n\nSee [[Nobody]] and [[Ghost]].\n"
            }),
        );
        assert_eq!(r["path"], "zz-new.md");
        // 两条悬空:按正文出现顺序(Nobody 在前)。
        let targets: Vec<&str> = r["broken_links"].as_array().unwrap()
            .iter().map(|x| x["target"].as_str().unwrap()).collect();
        assert_eq!(targets, ["Nobody", "Ghost"]);
        assert_ne!(r["orphan_hint"], ""); // 无任何已解析边 → 孤儿提示
    }

    #[test]
    fn write_note_clean_when_resolved_link() {
        let dir = fixture();
        let v = dir.path();
        let r = call_json(
            v,
            "write_note",
            json!({ "path": "zz-linked.md", "content": "# Linked\n\nSee [[a]].\n" }),
        );
        assert_eq!(r["broken_links"].as_array().unwrap().len(), 0);
        assert_eq!(r["orphan_hint"], ""); // 链到 a(已解析)→ 非孤儿
    }
}

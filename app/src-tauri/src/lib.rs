//! openobs-app —— Tauri 桌面壳。
//!
//! 薄薄的 IO 层:把文件系统读写 + 目录选择暴露成 Tauri 命令,真正的逻辑(解析/图谱/查询/检索)
//! 全部委托给 `openobs-core`。前端通过 `@tauri-apps/api` 的 invoke 调用这些命令。
//!
//! 设计原则:命令函数只做 IO 与 core 之间的胶水,不写业务逻辑。

use std::fs;
use std::path::{Path, PathBuf};

use openobs_core::{
    parse_query, tags as note_tags, type_of, EdgeKind, ResultSet, Target, VaultIndex,
};
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

// ─────────────────────── 传给前端的 DTO ────────────────────────

#[derive(Serialize)]
pub struct VaultEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct NodeOut {
    pub id: usize,
    pub path: String,
    pub title: String,
    /// 软类型(frontmatter `type:`)。serde 把 `r#type` 序列化成 "type"。
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
pub struct EdgeOut {
    pub from: usize,
    /// 解析到的目标节点 id(悬空则为 None)。
    pub to: Option<usize>,
    /// 悬空目标文本。
    pub unresolved: Option<String>,
    /// "wiki" | "relation"。
    pub kind: String,
    /// 关系键(仅 Relation)。
    pub relation: Option<String>,
    pub anchor: Option<String>,
}

#[derive(Serialize)]
pub struct VaultSnapshot {
    pub root: String,
    pub nodes: Vec<NodeOut>,
    pub edges: Vec<EdgeOut>,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub id: usize,
    pub score: f64,
}

// ───────────────────────── 内部工具 ──────────────────────────

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// 解析 vault 内相对路径,拒绝 `..` 穿越。
fn resolve_under(root: &str, path: &str) -> Result<PathBuf, String> {
    if path.split('/').any(|c| c == "..") {
        return Err(format!("非法路径(含 ..):{path}"));
    }
    Ok(Path::new(root).join(path))
}

/// 扫描 vault 下所有 .md,构建 core 索引。
fn build_index(root: &str) -> Result<VaultIndex, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("不是目录:{root}"));
    }
    let mut entries: Vec<(String, String)> = Vec::new();
    for entry in WalkDir::new(root_path).min_depth(1) {
        let e = entry.map_err(err)?;
        let p = e.path();
        if p.is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if p.extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }
        let rel = p
            .strip_prefix(root_path)
            .unwrap_or(p)
            .to_string_lossy()
            .to_string();
        let content = fs::read_to_string(p).map_err(err)?;
        entries.push((rel, content));
    }
    Ok(VaultIndex::build(entries))
}

// ───────────────────────── Tauri 命令 ─────────────────────────

/// 列出 vault 树(目录 + .md 文件,扁平 + 相对路径)。前端据此建树。
#[tauri::command]
fn list_vault(root: String) -> Result<Vec<VaultEntry>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("不是目录:{root}"));
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(root_path).min_depth(1) {
        let e = entry.map_err(err)?;
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let p = e.path();
        let is_dir = p.is_dir();
        if !is_dir && p.extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }
        let rel = p
            .strip_prefix(root_path)
            .unwrap_or(p)
            .to_string_lossy()
            .to_string();
        out.push(VaultEntry {
            path: rel,
            name,
            is_dir,
        });
    }
    Ok(out)
}

#[tauri::command]
fn read_note(root: String, path: String) -> Result<String, String> {
    let full = resolve_under(&root, &path)?;
    fs::read_to_string(&full).map_err(err)
}

#[tauri::command]
fn write_note(root: String, path: String, content: String) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(&full, content).map_err(err)
}

#[tauri::command]
fn create_note(root: String, path: String, content: String) -> Result<(), String> {
    write_note(root, path, content)
}

#[tauri::command]
fn delete_note(root: String, path: String) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    fs::remove_file(&full).map_err(err)
}

#[tauri::command]
fn rename_note(root: String, from: String, to: String) -> Result<(), String> {
    let src = resolve_under(&root, &from)?;
    let dst = resolve_under(&root, &to)?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(&src, &dst).map_err(err)
}

/// 全量索引快照(节点 + 统一边),供图谱/反向链接/类型标签面板。
#[tauri::command]
fn index_vault(root: String) -> Result<VaultSnapshot, String> {
    let idx = build_index(&root)?;
    let nodes = idx
        .notes()
        .iter()
        .enumerate()
        .map(|(i, n)| NodeOut {
            id: i,
            path: n.path.clone(),
            title: n.title.clone(),
            type_: type_of(n),
            tags: note_tags(n),
        })
        .collect();
    let edges = idx
        .graph()
        .edges
        .iter()
        .map(|e| EdgeOut {
            from: e.from,
            to: match &e.to {
                Target::Resolved(id) => Some(*id),
                _ => None,
            },
            unresolved: match &e.to {
                Target::Unresolved(s) => Some(s.clone()),
                _ => None,
            },
            kind: match &e.kind {
                EdgeKind::Wiki => "wiki".into(),
                EdgeKind::Relation(_) => "relation".into(),
            },
            relation: match &e.kind {
                EdgeKind::Relation(k) => Some(k.clone()),
                _ => None,
            },
            anchor: e.anchor.clone(),
        })
        .collect();
    Ok(VaultSnapshot { root, nodes, edges })
}

/// QQL 文本查询 → ResultSet(列表/表格/计数/分组/求和)。直接序列化 core 的 ResultSet。
#[tauri::command]
fn run_qql(root: String, qql: String) -> Result<ResultSet, String> {
    let idx = build_index(&root)?;
    let query = parse_query(&qql).map_err(|e| e.to_string())?;
    Ok(idx.query(&query))
}

/// 全文检索(AND)。返回按分降序的 (节点 id, 分数)。
#[tauri::command]
fn search_notes(root: String, query: String) -> Result<Vec<SearchHit>, String> {
    let idx = build_index(&root)?;
    let terms: Vec<&str> = query.split_whitespace().collect();
    Ok(idx
        .search(&terms)
        .into_iter()
        .map(|(id, score)| SearchHit { id, score })
        .collect())
}

/// 系统文件夹选择对话框。
#[tauri::command]
async fn pick_vault(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

// ───────────────────────── 应用入口 ──────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_vault,
            read_note,
            write_note,
            create_note,
            delete_note,
            rename_note,
            index_vault,
            run_qql,
            search_notes,
            pick_vault,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

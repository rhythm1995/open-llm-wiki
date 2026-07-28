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

/// 回收站目录(vault 根下的隐藏目录)。与前端 `lib/trash.ts` 的 TRASH_DIR 一致。
const TRASH_DIR: &str = ".trash";

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
    // 过滤掉任何点开头的文件/目录(含 .trash、.obsidian 等),使回收站与隐藏
    // 配置不出现在图谱/检索里。filter_entry 对目录会连同其子孙一并剪枝。
    for entry in WalkDir::new(root_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let e = entry.map_err(err)?;
        let p = e.path();
        if p.is_dir() {
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
    for entry in WalkDir::new(root_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let e = entry.map_err(err)?;
        let name = e.file_name().to_string_lossy().to_string();
        let p = e.path();
        let is_dir = p.is_dir();
        // 文件树里允许 .md(笔记)与 .canvas(tldraw 画布)。其余扩展名隐藏。
        // 索引(build_index)只取 .md —— 画布 JSON 不会被当作 markdown 解析。
        if !is_dir {
            let ext = p.extension().and_then(|x| x.to_str());
            if ext != Some("md") && ext != Some("canvas") {
                continue;
            }
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

/// 列出回收站(`.trash/`)内所有 .md;返回的相对路径**含 `.trash/` 前缀**,
/// 供前端还原/清空。回收站不存在时返回空。
#[tauri::command]
fn list_trash(root: String) -> Result<Vec<VaultEntry>, String> {
    let root_path = Path::new(&root);
    let trash_dir = root_path.join(TRASH_DIR);
    if !trash_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(&trash_dir).min_depth(1) {
        let e = entry.map_err(err)?;
        let p = e.path();
        if p.is_dir() {
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
        out.push(VaultEntry {
            path: rel,
            name: e.file_name().to_string_lossy().to_string(),
            is_dir: false,
        });
    }
    Ok(out)
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

// ───────────────────────── git(F-GIT)─────────────────────────
//
// 走系统 `git` 子进程(`std::process::Command`),`current_dir` 设到 vault 根。命令
// 只返回 git 的**原始 stdout**(status/log)或提交回执;解析是前端纯逻辑
// (`ui/src/lib/git-parse.ts`,已单测)。这是把"命令只做 IO"的惯例贯彻到底。
//
// 安全:`git` 的参数走 args 数组(非 shell 字符串),提交信息亦作为单个 arg 传入,
// 故无 shell 注入面。**仅在 Tauri 桌面 app 打开真正的 git 仓库时生效**;git 未安装
// 或目录非 git 仓库时,git 退出非零,stderr 作为 Err 回传给前端提示。

/// 在 vault 根下运行 `git <args...>`,成功返回 stdout,失败返回 stderr。
fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| format!("无法运行 git(可能未安装):{e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let trimmed = stderr.trim();
        return Err(if trimmed.is_empty() {
            format!("git 退出码 {}", out.status.code().unwrap_or(-1))
        } else {
            trimmed.to_string()
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `git status --porcelain=v1` 的原始输出(交前端解析)。空串 = 干净。
#[tauri::command]
fn git_status_raw(root: String) -> Result<String, String> {
    run_git(&root, &["status", "--porcelain=v1"])
}

/// `git log` 的原始输出:`hash<TAB>author<TAB>date<TAB>subject`,每行一条。
/// date 用 `--date=short` 即 `YYYY-MM-DD`。limit 默认 50。
#[tauri::command]
fn git_log_raw(root: String, limit: Option<usize>) -> Result<String, String> {
    let n = limit.unwrap_or(50);
    run_git(
        &root,
        &[
            "log",
            "--format=%H%x09%an%x09%ad%x09%s",
            "--date=short",
            &format!("-n{n}"),
        ],
    )
}

/// 提交全部改动:`git add -A` → `git commit -m <message>`。
/// 返回 commit 的回执(含本次提交摘要)。空信息拒绝提交。
#[tauri::command]
fn git_commit(root: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("提交信息不能为空".into());
    }
    run_git(&root, &["add", "-A"])?;
    run_git(&root, &["commit", "-m", &message])
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
            list_trash,
            index_vault,
            run_qql,
            search_notes,
            pick_vault,
            git_status_raw,
            git_log_raw,
            git_commit,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

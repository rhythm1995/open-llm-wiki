//! open-llm-wiki-app —— Tauri 桌面壳。
//!
//! 薄薄的 IO 层:把文件系统读写 + 目录选择暴露成 Tauri 命令,真正的逻辑(解析/图谱/查询/检索)
//! 全部委托给 `open-llm-wiki-core`。前端通过 `@tauri-apps/api` 的 invoke 调用这些命令。
//!
//! 设计原则:命令函数只做 IO 与 core 之间的胶水,不写业务逻辑。

mod acp;
mod git_attr;
mod logging;
mod onboarding;
mod transcript;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use open_llm_wiki_core::{
    apply_entry_deltas, frontmatter_str, lint_all, parse_query, tags as note_tags, type_of,
    EdgeKind, LintReport, ResultSet, Target, VaultIndex,
};
use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
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
    /// frontmatter `status`(软状态;可空)。
    pub status: Option<String>,
    /// frontmatter `created`(字符串,通常 YYYY-MM-DD;可空)。
    pub created: Option<String>,
    /// 文件 mtime,unix 毫秒。读取失败回退 0。
    pub modified: i64,
    /// 正文单行预览(已去 frontmatter 与开头 H1,≤200 字符)。
    pub preview: String,
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

/// 历史中存在、当前工作区已删除的笔记(git 即归档)。`commit` 是删除它的提交哈希,
/// `deleted_at` 为该提交日期(YYYY-MM-DD);`title` 由路径推得。供「归档」视图列出与还原。
#[derive(Serialize)]
pub struct DeletedNote {
    pub path: String,
    pub title: String,
    pub commit: String,
    pub deleted_at: String,
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

/// 文件 mtime → unix 毫秒。任一步失败(不支持 modified / 早于 epoch)回退 0,不阻塞索引。
fn mtime_millis(root: &str, rel: &str) -> i64 {
    let p = Path::new(root).join(rel);
    fs::metadata(&p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 正文单行预览:去掉开头与 title 重复的 H1 行,空白压成单空格,超过 200 字符则截断加 …。
fn preview_of(body: &str) -> String {
    let trimmed = body.trim_start();
    // 跳过开头的标题行(它就是 NodeOut.title,单独显示,不进预览)。
    let after_heading = match trimmed.lines().next() {
        Some(first) if first.trim_start().starts_with('#') => {
            trimmed[first.len()..].trim_start()
        }
        _ => trimmed,
    };
    let single: String = after_heading.split_whitespace().collect::<Vec<_>>().join(" ");
    const LIMIT: usize = 200;
    if single.chars().count() <= LIMIT {
        single
    } else {
        let cut: String = single.chars().take(LIMIT).collect();
        format!("{cut}…")
    }
}

// ───────────────────────── 内存 live 索引 ─────────────────────────
//
// 打开 vault = 全量 walk 一次 → LiveVault{entries,index}。
// 之后写/删/改名/watcher 路径 delta 只读受影响文件,改 entries map 再
// VaultIndex::build_from_map —— **不**再 WalkDir 全库。
// run_qql / search_notes 只读 live.index。
// index_vault(force=true) 或 root 切换时再全量 walk 自愈。

/// 内存中的 vault 索引(与磁盘 .md 集对应;canvas 不进 note index)。
/// `media` 与笔记索引平行:文件表 + 正文引用正排/倒排(core::MediaIndex)。
struct LiveVault {
    root: String,
    /// 相对 path → 正文(.md only)。
    entries: BTreeMap<String, String>,
    index: VaultIndex,
    media: open_llm_wiki_core::MediaIndex,
}

struct LiveVaultState(Mutex<Option<LiveVault>>);

fn is_md_rel(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

/// 规范化 vault 内相对路径(统一 `/`,去掉前导 `./`)。
fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/")
        .trim_start_matches("./")
        .to_string()
}

/// 磁盘图片 → MediaMeta(仅图片扩展名;点目录已由 walk filter 排除)。
fn media_meta_from_path(root: &Path, abs: &Path) -> Option<open_llm_wiki_core::MediaMeta> {
    let rel = normalize_rel(&abs.strip_prefix(root).unwrap_or(abs).to_string_lossy());
    if rel.is_empty() || !open_llm_wiki_core::is_image_path(&rel) {
        return None;
    }
    let meta = fs::metadata(abs).ok()?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some(open_llm_wiki_core::MediaMeta {
        path: rel.clone(),
        kind: open_llm_wiki_core::kind_from_path(&rel),
        bytes: meta.len(),
        mtime_ms,
    })
}

/// 全量 walk 读入全部 .md + 图片 → LiveVault(IO 仅此路径在 open/force 时发生)。
fn load_live_from_disk(root: &str) -> Result<LiveVault, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("不是目录:{root}"));
    }
    let mut entries: BTreeMap<String, String> = BTreeMap::new();
    let mut media_files: Vec<open_llm_wiki_core::MediaMeta> = Vec::new();
    // 过滤掉任何点开头的文件/目录(含 .trash、.obsidian、.open-llm-wiki 等)。
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
        let rel = normalize_rel(
            &p.strip_prefix(root_path)
                .unwrap_or(p)
                .to_string_lossy(),
        );
        if p.extension().and_then(|x| x.to_str()) == Some("md") {
            let content = fs::read_to_string(p).map_err(err)?;
            entries.insert(rel, content);
        } else if let Some(m) = media_meta_from_path(root_path, p) {
            media_files.push(m);
        }
    }
    let index = VaultIndex::build_from_map(&entries);
    let media = open_llm_wiki_core::MediaIndex::build(
        media_files,
        entries
            .iter()
            .map(|(p, c)| (p.clone(), c.clone()))
            .collect::<Vec<_>>(),
    );
    Ok(LiveVault {
        root: root.to_string(),
        entries,
        index,
        media,
    })
}

/// 确保 state 持有 `root` 的 live 索引;缺失或 root 不同则全量加载。
fn ensure_live(state: &LiveVaultState, root: &str) -> Result<(), String> {
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    let need = match g.as_ref() {
        None => true,
        Some(v) => v.root != root,
    };
    if need {
        *g = Some(load_live_from_disk(root)?);
    }
    Ok(())
}

/// 对 live 应用路径级 delta 并重建 note index + 媒体引用。
fn live_apply(
    live: &mut LiveVault,
    deltas: impl IntoIterator<Item = (String, Option<String>)>,
) {
    let deltas: Vec<(String, Option<String>)> = deltas.into_iter().collect();
    // 媒体引用:按笔记 delta 增量更新(不必全量 rebuild media files)。
    for (path, content) in &deltas {
        if is_md_rel(path) {
            live.media
                .apply_note_delta(path, content.as_deref());
        }
    }
    apply_entry_deltas(&mut live.entries, deltas);
    live.index = VaultIndex::build_from_map(&live.entries);
}

/// 登记/刷新单张磁盘图片进 media files 表。
fn live_media_upsert_file(live: &mut LiveVault, root: &str, rel: &str) {
    let rel = normalize_rel(rel);
    if !open_llm_wiki_core::is_image_path(&rel) {
        return;
    }
    let Ok(full) = resolve_under(root, &rel) else {
        return;
    };
    if let Some(m) = media_meta_from_path(Path::new(root), &full) {
        live.media.upsert_file(m);
    } else {
        live.media.remove_file(&rel);
    }
}

/// 把磁盘上若干相对路径读入/删除后打进 live(不存在 → remove)。
fn live_sync_paths(live: &mut LiveVault, root: &str, paths: &[String]) -> Result<(), String> {
    let mut deltas: Vec<(String, Option<String>)> = Vec::new();
    for raw in paths {
        let rel = normalize_rel(raw);
        if !is_md_rel(&rel) {
            continue;
        }
        // 点段路径不进索引(与 walk 过滤一致)。
        if rel.split('/').any(|s| s.starts_with('.')) {
            continue;
        }
        let full = resolve_under(root, &rel)?;
        if full.is_file() {
            let content = fs::read_to_string(&full).map_err(err)?;
            deltas.push((rel, Some(content)));
        } else {
            deltas.push((rel, None));
        }
    }
    if !deltas.is_empty() {
        live_apply(live, deltas);
    }
    Ok(())
}

/// 若 live 与 root 匹配,把一次 .md 写/删反映进内存(已持锁外的内容由调用方提供)。
fn live_note_upsert(state: &LiveVaultState, root: &str, path: &str, content: Option<String>) {
    let Ok(mut g) = state.0.lock() else {
        return;
    };
    let Some(live) = g.as_mut() else {
        return;
    };
    if live.root != root || !is_md_rel(path) {
        return;
    }
    let rel = normalize_rel(path);
    live_apply(live, vec![(rel, content)]);
}

/// 从 live 投影前端快照。
fn snapshot_from_live(live: &LiveVault) -> VaultSnapshot {
    let nodes = project_nodes(&live.root, &live.index);
    let edges = live
        .index
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
    VaultSnapshot {
        root: live.root.clone(),
        nodes,
        edges,
    }
}

/// 把 core 索引投影成前端 NodeOut(主索引与回收站索引共用此投影)。
fn project_nodes(root: &str, idx: &VaultIndex) -> Vec<NodeOut> {
    idx.notes()
        .iter()
        .enumerate()
        .map(|(i, n)| NodeOut {
            id: i,
            path: n.path.clone(),
            title: n.title.clone(),
            type_: type_of(n),
            tags: note_tags(n),
            status: frontmatter_str(n, "status"),
            created: frontmatter_str(n, "created"),
            modified: mtime_millis(root, &n.path),
            preview: preview_of(&n.body),
        })
        .collect()
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
        // 文件树里允许 .md(笔记)与 .canvas(Excalidraw 画布)。其余扩展名隐藏。
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
fn write_note(
    root: String,
    path: String,
    content: String,
    state: State<LiveVaultState>,
) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let nbytes = content.len();
    fs::write(&full, &content).map_err(|e| {
        logging::emit(
            logging::LogLevel::Error,
            "ipc.write_note",
            "write failed",
            Some(serde_json::json!({ "path": &path, "err": e.to_string() })),
        );
        err(e)
    })?;
    // 路径级 delta:更新 live entries,不 WalkDir。
    live_note_upsert(&state, &root, &path, Some(content));
    logging::emit(
        logging::LogLevel::Debug,
        "ipc.write_note",
        "ok",
        Some(serde_json::json!({ "path": path, "bytes": nbytes })),
    );
    Ok(())
}

/// 读取图谱布局快照(B-GRAPH-POS-PERSIST)。
/// 文件缺失 → `Ok(None)`(首次启动 / 未落盘)。其余 IO 错误透传。
/// 路径固定为 `<root>/.open-llm-wiki/graph-layout.json`(默认 gitignore,见 P6-7)。
#[tauri::command]
fn read_graph_layout(root: String) -> Result<Option<String>, String> {
    let full = resolve_under(&root, ".open-llm-wiki/graph-layout.json")?;
    match fs::read_to_string(&full) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 写入图谱布局快照(自动创建 `.open-llm-wiki/` 目录)。
#[tauri::command]
fn save_graph_layout(root: String, json: String) -> Result<(), String> {
    let full = resolve_under(&root, ".open-llm-wiki/graph-layout.json")?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(&full, &json).map_err(err)
}

/// 将 base64 字节写入 vault 内相对路径(附件,非笔记;进 media files 表,不进 note index)。
/// `bytes_base64` 可为纯 base64,或 `data:*;base64,...` data URL。
#[tauri::command]
fn save_attachment(
    root: String,
    path: String,
    bytes_base64: String,
    state: State<LiveVaultState>,
) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let raw = strip_data_url_base64(&bytes_base64);
    let bytes = decode_base64(raw)?;
    fs::write(&full, bytes).map_err(err)?;
    // 媒体索引:登记文件(引用仍等笔记保存后由 write_note 增量)。
    if let Ok(mut g) = state.0.lock() {
        if let Some(live) = g.as_mut() {
            if live.root == root {
                live_media_upsert_file(live, &root, &path);
            }
        }
    }
    Ok(())
}

/// 附件相对路径是否已在磁盘上(unique 路径分配;不进 live index)。
#[tauri::command]
fn attachment_exists(root: String, path: String) -> Result<bool, String> {
    let full = resolve_under(&root, &path)?;
    Ok(full.is_file())
}

/// 媒体索引对外 DTO(serde;camelCase 由前端读 path/bytes/…)。
#[derive(serde::Serialize)]
struct MediaMetaOut {
    path: String,
    kind: String,
    bytes: u64,
    mtime_ms: u64,
    /// 引用该文件的笔记数。
    refcount: usize,
}

#[derive(serde::Serialize)]
struct MediaStatsOut {
    files: usize,
    notes_with_media: usize,
    refs: usize,
    orphans: usize,
    missing: usize,
}

#[derive(serde::Serialize)]
struct MediaSnapshot {
    stats: MediaStatsOut,
    /// 全库已登记媒体路径(短名 resolve / 清单)。
    files: Vec<String>,
    /// 孤儿附件(refcount==0)。
    orphans: Vec<MediaMetaOut>,
    /// 正文引用但磁盘无文件。
    missing: Vec<String>,
}

fn media_meta_out(ix: &open_llm_wiki_core::MediaIndex, m: &open_llm_wiki_core::MediaMeta) -> MediaMetaOut {
    let kind = match m.kind {
        open_llm_wiki_core::MediaKind::Image => "image",
        open_llm_wiki_core::MediaKind::Other => "other",
    };
    MediaMetaOut {
        path: m.path.clone(),
        kind: kind.into(),
        bytes: m.bytes,
        mtime_ms: m.mtime_ms,
        refcount: ix.refcount(&m.path),
    }
}

fn ensure_live_media<'a>(
    state: &'a LiveVaultState,
    root: &str,
) -> Result<std::sync::MutexGuard<'a, Option<LiveVault>>, String> {
    ensure_live(state, root)?;
    state.0.lock().map_err(|e| e.to_string())
}

/// 全库媒体快照:stats + orphans + missing(只读 live;force 时先重载)。
#[tauri::command]
fn media_index(
    root: String,
    force: Option<bool>,
    state: State<LiveVaultState>,
) -> Result<MediaSnapshot, String> {
    let force = force.unwrap_or(false);
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    if force || g.as_ref().map(|v| v.root != root).unwrap_or(true) {
        *g = Some(load_live_from_disk(&root)?);
    }
    let live = g.as_ref().ok_or_else(|| "live index missing".to_string())?;
    let st = live.media.stats();
    Ok(MediaSnapshot {
        stats: MediaStatsOut {
            files: st.files,
            notes_with_media: st.notes_with_media,
            refs: st.refs,
            orphans: st.orphans,
            missing: st.missing,
        },
        files: live.media.files().keys().cloned().collect(),
        orphans: live
            .media
            .orphans()
            .into_iter()
            .map(|m| media_meta_out(&live.media, m))
            .collect(),
        missing: live.media.missing(),
    })
}

/// 当前笔记引用的媒体(含 missing 占位:bytes=0)。
#[tauri::command]
fn media_of_note(
    root: String,
    path: String,
    state: State<LiveVaultState>,
) -> Result<Vec<MediaMetaOut>, String> {
    let g = ensure_live_media(&state, &root)?;
    let live = g.as_ref().ok_or_else(|| "live index missing".to_string())?;
    if live.root != root {
        return Err("live root mismatch".into());
    }
    Ok(live
        .media
        .media_of(&path)
        .iter()
        .map(|m| media_meta_out(&live.media, m))
        .collect())
}

/// 将附件移入 `.open-llm-wiki/media-trash/`(可还原目录树),并更新 media files 表。
/// **不**在 delete_note 时自动调用——需 UI 确认后调用。
#[tauri::command]
fn trash_attachments(
    root: String,
    paths: Vec<String>,
    state: State<LiveVaultState>,
) -> Result<usize, String> {
    let mut moved = 0usize;
    for raw in &paths {
        let rel = normalize_rel(raw);
        if rel.is_empty() || rel.split('/').any(|s| s == ".." || s.starts_with('.')) {
            continue;
        }
        let src = resolve_under(&root, &rel)?;
        if !src.is_file() {
            // 仍从索引移除
            if let Ok(mut g) = state.0.lock() {
                if let Some(live) = g.as_mut() {
                    if live.root == root {
                        live.media.remove_file(&rel);
                    }
                }
            }
            continue;
        }
        let trash_rel = format!(".open-llm-wiki/media-trash/{rel}");
        let dst = resolve_under(&root, &trash_rel)?;
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        // 碰撞:加时间戳后缀
        let dst = if dst.exists() {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let alt = format!("{trash_rel}.{stamp}");
            resolve_under(&root, &alt)?
        } else {
            dst
        };
        fs::rename(&src, &dst).map_err(err)?;
        if let Ok(mut g) = state.0.lock() {
            if let Some(live) = g.as_mut() {
                if live.root == root {
                    live.media.remove_file(&rel);
                }
            }
        }
        moved += 1;
    }
    Ok(moved)
}

/// 去掉 `data:…;base64,` 前缀(若有)。
fn strip_data_url_base64(s: &str) -> &str {
    if let Some(i) = s.find("base64,") {
        &s[i + "base64,".len()..]
    } else {
        s.trim()
    }
}

/// 标准 base64 编码(无额外 crate)。
fn encode_base64(bytes: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = (u32::from(bytes[i]) << 16)
            | (u32::from(bytes[i + 1]) << 8)
            | u32::from(bytes[i + 2]);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push(T[(n & 63) as usize] as char);
        i += 3;
    }
    let rem = bytes.len() - i;
    if rem == 1 {
        let n = u32::from(bytes[i]) << 16;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = (u32::from(bytes[i]) << 16) | (u32::from(bytes[i + 1]) << 8);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push('=');
    }
    out
}

fn mime_from_rel_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else {
        "image/png"
    }
}

/// 读附件为 data URL,供 webview 可靠预览(不依赖 asset 协议路径权限)。
#[tauri::command]
fn read_attachment_data_url(root: String, path: String) -> Result<String, String> {
    let full = resolve_under(&root, &path)?;
    let bytes = fs::read(&full).map_err(err)?;
    let mime = mime_from_rel_path(&path);
    Ok(format!("data:{mime};base64,{}", encode_base64(&bytes)))
}

/// 标准 base64 解码(无额外 crate;允许缺省 padding)。
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(format!("非法 base64 字符:{}", c as char)),
        }
    }
    let s: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace() && *b != b'=')
        .collect();
    if s.is_empty() {
        return Ok(Vec::new());
    }
    if s.len() % 4 == 1 {
        return Err("非法 base64 长度".into());
    }
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut i = 0;
    while i + 4 <= s.len() {
        let n = (u32::from(val(s[i])?) << 18)
            | (u32::from(val(s[i + 1])?) << 12)
            | (u32::from(val(s[i + 2])?) << 6)
            | u32::from(val(s[i + 3])?);
        out.push(((n >> 16) & 0xff) as u8);
        out.push(((n >> 8) & 0xff) as u8);
        out.push((n & 0xff) as u8);
        i += 4;
    }
    let rem = s.len() - i;
    if rem == 2 {
        let n = (u32::from(val(s[i])?) << 18) | (u32::from(val(s[i + 1])?) << 12);
        out.push(((n >> 16) & 0xff) as u8);
    } else if rem == 3 {
        let n = (u32::from(val(s[i])?) << 18)
            | (u32::from(val(s[i + 1])?) << 12)
            | (u32::from(val(s[i + 2])?) << 6);
        out.push(((n >> 16) & 0xff) as u8);
        out.push(((n >> 8) & 0xff) as u8);
    }
    Ok(out)
}

#[tauri::command]
fn create_note(
    root: String,
    path: String,
    content: String,
    state: State<LiveVaultState>,
) -> Result<(), String> {
    write_note(root.clone(), path.clone(), content, state)?;
    // 结构操作自动提交(仅此路径);正文编辑不提交,保 commit 卫生。
    git_commit_paths(&root, &format!("Create {}", title_of(&path)), &[&path]);
    Ok(())
}

#[tauri::command]
fn delete_note(
    root: String,
    path: String,
    state: State<LiveVaultState>,
) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    fs::remove_file(&full).map_err(err)?;
    live_note_upsert(&state, &root, &path, None);
    // 删除即提交:该笔记自此进入 git 历史,可在「归档」还原(到上次提交的内容)。
    git_commit_paths(&root, &format!("Delete {}", title_of(&path)), &[&path]);
    Ok(())
}

#[tauri::command]
fn rename_note(
    root: String,
    from: String,
    to: String,
    state: State<LiveVaultState>,
) -> Result<(), String> {
    // 需要 live.media 做 refcount/搬图;缺失则先加载。
    let _ = ensure_live(&state, &root);
    let src = resolve_under(&root, &from)?;
    let dst = resolve_under(&root, &to)?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(&src, &dst).map_err(err)?;

    let from_n = normalize_rel(&from);
    let to_n = normalize_rel(&to);
    // 改名后正文 + 受限附件搬家(refcount==1 + 同目录/stem 桶)。
    let mut commit_paths: Vec<String> = vec![from_n.clone(), to_n.clone()];

    if let Ok(mut g) = state.0.lock() {
        if let Some(live) = g.as_mut() {
            if live.root == root {
                let mut deltas = Vec::new();
                if is_md_rel(&from_n) {
                    let mut content = live
                        .entries
                        .remove(&from_n)
                        .or_else(|| fs::read_to_string(&dst).ok());
                    deltas.push((from_n.clone(), None));

                    if is_md_rel(&to_n) {
                        if let Some(body) = content.take() {
                            // 计划搬家:仅本笔记引用且 refcount==1。
                            let media_list: Vec<String> = live
                                .media
                                .media_of(&from_n)
                                .into_iter()
                                .map(|m| m.path)
                                .collect();
                            // media_of 已因 entries 移除? by_note 仍 keyed by from_n until apply
                            let moves = open_llm_wiki_core::plan_media_moves_on_note_rename(
                                &from_n,
                                &to_n,
                                media_list,
                                |p| live.media.refcount(p),
                            );
                            let mut new_body = body;
                            if !moves.is_empty() {
                                new_body =
                                    open_llm_wiki_core::rewrite_media_paths_in_body(&new_body, &moves);
                                for m in &moves {
                                    let msrc = resolve_under(&root, &m.from)?;
                                    let mdst = resolve_under(&root, &m.to)?;
                                    if msrc.is_file() {
                                        if let Some(parent) = mdst.parent() {
                                            fs::create_dir_all(parent).map_err(err)?;
                                        }
                                        // 目标已存在则跳过搬文件(避免覆盖),仍改写正文
                                        if !mdst.exists() {
                                            fs::rename(&msrc, &mdst).map_err(err)?;
                                            live.media.rename_file_key(&m.from, &m.to);
                                            commit_paths.push(m.from.clone());
                                            commit_paths.push(m.to.clone());
                                        }
                                    }
                                }
                                fs::write(&dst, &new_body).map_err(err)?;
                            }
                            deltas.push((to_n.clone(), Some(new_body)));
                        }
                    }
                } else if is_md_rel(&to_n) {
                    if let Ok(c) = fs::read_to_string(&dst) {
                        deltas.push((to_n.clone(), Some(c)));
                    }
                }
                if !deltas.is_empty() {
                    live_apply(live, deltas);
                }
            }
        }
    }

    let refs: Vec<&str> = commit_paths.iter().map(|s| s.as_str()).collect();
    git_commit_paths(
        &root,
        &format!("Rename {} → {}", title_of(&from), title_of(&to)),
        &refs,
    );
    Ok(())
}

/// 索引快照(节点 + 统一边)。
/// `force=true` 或 live 未加载/root 不匹配 → 全量 WalkDir 自愈;
/// 否则直接投影内存 live.index(**无**磁盘全扫)。
#[tauri::command]
fn index_vault(
    root: String,
    force: Option<bool>,
    state: State<LiveVaultState>,
) -> Result<VaultSnapshot, String> {
    let force = force.unwrap_or(false);
    let t0 = std::time::Instant::now();
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    let reloaded = force || g.as_ref().map(|v| v.root != root).unwrap_or(true);
    if reloaded {
        *g = Some(load_live_from_disk(&root).map_err(|e| {
            logging::emit(
                logging::LogLevel::Error,
                "ipc.index_vault",
                "load failed",
                Some(serde_json::json!({ "err": e })),
            );
            e
        })?);
    }
    let live = g.as_ref().ok_or_else(|| "live index missing".to_string())?;
    let snap = snapshot_from_live(live);
    logging::emit(
        logging::LogLevel::Info,
        "ipc.index_vault",
        "ok",
        Some(serde_json::json!({
            "force": force,
            "reloaded": reloaded,
            "notes": snap.nodes.len(),
            "ms": t0.elapsed().as_millis() as u64,
        })),
    );
    Ok(snap)
}

/// 路径级刷新:对给定相对路径从磁盘读/删 → 打进 live → 返回快照。
/// watcher 与主动 refresh 的共用入口;非 .md 路径忽略。
#[tauri::command]
fn apply_vault_changes(
    root: String,
    paths: Vec<String>,
    state: State<LiveVaultState>,
) -> Result<VaultSnapshot, String> {
    ensure_live(&state, &root)?;
    let mut g = state.0.lock().map_err(|e| e.to_string())?;
    let live = g.as_mut().ok_or_else(|| "live index missing".to_string())?;
    live_sync_paths(live, &root, &paths)?;
    Ok(snapshot_from_live(live))
}

/// QQL 文本查询 → ResultSet。**只读 live.index**,不 WalkDir。
#[tauri::command]
fn run_qql(
    root: String,
    qql: String,
    state: State<LiveVaultState>,
) -> Result<ResultSet, String> {
    ensure_live(&state, &root)?;
    let g = state.0.lock().map_err(|e| e.to_string())?;
    let live = g.as_ref().ok_or_else(|| "live index missing".to_string())?;
    let query = parse_query(&qql).map_err(|e| e.to_string())?;
    Ok(live.index.query(&query))
}

/// 全文检索(AND)。**只读 live.index**,不 WalkDir。
#[tauri::command]
fn search_notes(
    root: String,
    query: String,
    state: State<LiveVaultState>,
) -> Result<Vec<SearchHit>, String> {
    ensure_live(&state, &root)?;
    let g = state.0.lock().map_err(|e| e.to_string())?;
    let live = g.as_ref().ok_or_else(|| "live index missing".to_string())?;
    let terms: Vec<&str> = query.split_whitespace().collect();
    Ok(live
        .index
        .search(&terms)
        .into_iter()
        .map(|(id, score)| SearchHit { id, score })
        .collect())
}

/// L1 结构 lint(B-WIKI-LINT-MCP 的人侧接通点)。**只读 live.index**,不 WalkDir;
/// 返回候选([`LintReport`]),永不改 vault——修不修由 UI/人显式决定。
#[tauri::command]
fn lint_vault(root: String, state: State<LiveVaultState>) -> Result<LintReport, String> {
    ensure_live(&state, &root)?;
    let g = state.0.lock().map_err(|e| e.to_string())?;
    let live = g.as_ref().ok_or_else(|| "live index missing".to_string())?;
    Ok(lint_all(live.index.graph()))
}

/// 结构化日志写入(L1 LogBus)。level: trace|debug|info|warn|error|fatal。
#[tauri::command]
fn log_write(
    level: String,
    target: String,
    msg: String,
    fields: Option<serde_json::Value>,
) {
    let lv = logging::LogLevel::parse(&level).unwrap_or(logging::LogLevel::Info);
    let tgt = if target.is_empty() {
        "ui"
    } else {
        target.as_str()
    };
    logging::emit(lv, tgt, &msg, fields);
}

/// 在系统文件管理器中打开日志目录。
#[tauri::command]
fn log_open_dir() -> Result<(), String> {
    let dir = logging::log_dir().ok_or_else(|| "log bus not initialized".to_string())?;
    logging::open_dir_in_os(&dir)
}

/// 热切换日志 profile:`dev` | `verbose` | `prod`(本进程,不写回环境变量)。
#[tauri::command]
fn log_set_profile(profile: String) -> Result<String, String> {
    let p = logging::LogProfile::parse(&profile)
        .ok_or_else(|| format!("unknown profile: {profile}"))?;
    logging::set_profile(p);
    Ok(p.as_str().to_string())
}

/// 当前 profile + 目录 + session_id(设置页展示)。
#[tauri::command]
fn log_get_status() -> Result<serde_json::Value, String> {
    let dir = logging::log_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let profile = logging::current_profile()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| "unknown".into());
    let session_id = logging::session_id().unwrap_or_default();
    Ok(serde_json::json!({
        "dir": dir,
        "profile": profile,
        "sessionId": session_id,
    }))
}

/// 打包近期日志为单个 `.txt`,返回绝对路径(落在日志目录内)。
#[tauri::command]
fn log_export_bundle() -> Result<String, String> {
    let path = logging::export_bundle(7)?;
    logging::emit(
        logging::LogLevel::Info,
        "app",
        "log export written",
        Some(serde_json::json!({ "path": path.to_string_lossy() })),
    );
    Ok(path.to_string_lossy().to_string())
}

/// 系统文件夹选择对话框。
#[tauri::command]
async fn pick_vault(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    let path = folder
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string());
    logging::emit(
        logging::LogLevel::Info,
        "ipc.pick_vault",
        if path.is_some() {
            "selected"
        } else {
            "cancelled"
        },
        path.as_ref()
            .map(|p| serde_json::json!({ "path": p })),
    );
    Ok(path)
}

/// 用户 Documents 目录(无 crate 依赖;HOME/USERPROFILE + Documents)。
fn documents_dir() -> Result<std::path::PathBuf, String> {
    if let Ok(d) = std::env::var("OPEN_LLM_WIKI_DOCUMENTS") {
        // 测试 / 可控环境可覆盖落盘位置。
        return Ok(std::path::PathBuf::from(d));
    }
    #[cfg(windows)]
    {
        if let Ok(p) = std::env::var("USERPROFILE") {
            return Ok(std::path::PathBuf::from(p).join("Documents"));
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Ok(std::path::PathBuf::from(home).join("Documents"));
        }
    }
    Err("cannot resolve Documents directory".into())
}

/// 首次启动示例库种子文件(与 ui `sample-vault.ts` 对齐,双语欢迎向)。
fn sample_vault_seed_files() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "Welcome.md",
            r#"---
type: Note
tags: [meta]
---

# Welcome

这是 **Open LLM Wiki** 的示例知识库。

- 本地优先:文件即真相,目录就是 Vault
- 用 `[[wikilink]]` 连接笔记,打开 **图谱** 看网络
- 从左侧列表选笔记,或新建一篇开始

从这里开始:

- 概念 [[Local First]]
- 概念 [[Knowledge Graph]]
- 来源 [[Example Source]]
"#,
        ),
        (
            "concepts/local-first.md",
            r#"---
type: Concept
status: Active
tags: [method]
---

# Local First

数据留在你自己的磁盘上,而不是关进别人的云。

Open LLM Wiki 把任意 Markdown 文件夹当作 Vault——可同步、可 git、可备份。

相关:[[Knowledge Graph]] · [[Welcome]]
"#,
        ),
        (
            "concepts/knowledge-graph.md",
            r#"---
type: Concept
status: Active
tags: [method]
---

# Knowledge Graph

笔记之间的链接构成一张图:节点是页面,边是 wikilink 与 frontmatter 关系。

试试顶栏 **图谱**,双击节点打开笔记。

相关:[[Local First]] · [[Example Source]] · [[Welcome]]
"#,
        ),
        (
            "sources/example-source.md",
            r#"---
type: Source
evidence_tier: analysis
tags: [example]
---

# Example Source

示例「来源」页:记录你读过的文章、论文或对话,再蒸馏进 Concept / Entity。

被 [[Knowledge Graph]] 与 [[Welcome]] 引用。
"#,
        ),
    ]
}

/// 在 Documents 下创建「Open LLM Wiki Demo」示例 vault(重名则加序号),返回绝对路径。
#[tauri::command]
fn create_sample_vault() -> Result<String, String> {
    let docs = documents_dir()?;
    fs::create_dir_all(&docs).map_err(err)?;
    let base = "Open LLM Wiki Demo";
    let mut root = docs.join(base);
    let mut n = 2u32;
    while root.exists() {
        root = docs.join(format!("{base} {n}"));
        n += 1;
        if n > 100 {
            return Err("too many sample vaults already exist".into());
        }
    }
    fs::create_dir_all(&root).map_err(err)?;
    for (rel, content) in sample_vault_seed_files() {
        let full = root.join(rel);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        fs::write(&full, content).map_err(err)?;
    }
    let path = root.to_string_lossy().to_string();
    logging::emit(
        logging::LogLevel::Info,
        "ipc.create_sample_vault",
        "created",
        Some(serde_json::json!({ "path": &path })),
    );
    Ok(path)
}

/// 在系统文件管理器中显示笔记文件(macOS Finder / Windows 资源管理器 / Linux 文件管理器)。
/// 供列表行右键「在 Finder 中显示」。走系统子进程,与 git 命令同一风格,不引入 opener 插件。
#[tauri::command]
fn reveal_in_finder(root: String, path: String) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    // 平台分支:macOS `open -R <file>`、Windows `explorer /select,<file>`、
    // Linux `xdg-open <parent>`(xdg-open 不能定位到具体文件,只能开父目录)。
    #[cfg(target_os = "macos")]
    let (program, args): (&str, Vec<String>) =
        ("open", vec!["-R".into(), full.to_string_lossy().to_string()]);
    #[cfg(target_os = "windows")]
    let (program, args): (&str, Vec<String>) =
        ("explorer", vec![format!("/select,{}", full.to_string_lossy().to_string())]);
    #[cfg(all(unix, not(target_os = "macos")))]
    let (program, args): (&str, Vec<String>) = {
        let parent = full
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| full.to_string_lossy().to_string());
        ("xdg-open", vec![parent])
    };
    std::process::Command::new(program)
        .args(&args)
        .spawn()
        .map_err(err)?;
    Ok(())
}

const GITHUB_REPO_URL: &str = "https://github.com/rhythm1995/open-llm-wiki";
const GITHUB_PAGES_URL: &str = "https://rhythm1995.github.io/open-llm-wiki";
const PROJECT_ISSUES_URL: &str = "https://github.com/rhythm1995/open-llm-wiki/issues";
const USER_DOCS_URL: &str = "https://rhythm1995.github.io/open-llm-wiki/docs/start";

fn url_under_prefix(url: &str, prefix: &str) -> bool {
    url == prefix || url.starts_with(&format!("{prefix}/"))
}

fn is_allowed_external_url(url: &str) -> bool {
    url_under_prefix(url, GITHUB_REPO_URL) || url_under_prefix(url, GITHUB_PAGES_URL)
}

fn should_open_external_now(
    prev: Option<(&str, Duration)>,
    url: &str,
    window: Duration,
) -> bool {
    match prev {
        Some((prev_url, elapsed)) if prev_url == url && elapsed < window => false,
        _ => true,
    }
}

struct LastExternalOpen {
    url: String,
    at: Instant,
}

static LAST_EXTERNAL_OPEN: Mutex<Option<LastExternalOpen>> = Mutex::new(None);
const EXTERNAL_OPEN_WINDOW: Duration = Duration::from_millis(800);

fn open_url_in_browser(url: &str) -> Result<(), String> {
    if !is_allowed_external_url(url) {
        return Err("blocked url".into());
    }
    {
        let mut guard = LAST_EXTERNAL_OPEN
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(prev) = guard.as_ref() {
            if !should_open_external_now(
                Some((prev.url.as_str(), prev.at.elapsed())),
                url,
                EXTERNAL_OPEN_WINDOW,
            ) {
                return Ok(());
            }
        }
        *guard = Some(LastExternalOpen {
            url: url.to_string(),
            at: Instant::now(),
        });
    }
    #[cfg(target_os = "macos")]
    let (program, args): (&str, Vec<String>) = ("open", vec![url.to_string()]);
    #[cfg(target_os = "windows")]
    let (program, args): (&str, Vec<String>) =
        ("cmd", vec!["/C".into(), "start".into(), url.to_string()]);
    #[cfg(all(unix, not(target_os = "macos")))]
    let (program, args): (&str, Vec<String>) = ("xdg-open", vec![url.to_string()]);
    std::process::Command::new(program)
        .args(&args)
        .spawn()
        .map_err(err)?;
    Ok(())
}

/// 用系统浏览器打开白名单 https 地址(Issues / 用户文档)。
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open_url_in_browser(&url)
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
///
/// 集中结构化打点(B-LOG-IPC-SPANS):所有 git 子进程都经此,一处覆盖
/// status/log/commit/pull/push/init/restore/自动提交。成功记 debug(命令名;
/// prod=error+ 自动过滤,避免 create/delete 的自动提交刷屏),失败记 error
/// (命令 + 退出码 + 截断 stderr),供用户导出日志后排查。
fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let cmd = args.first().copied().unwrap_or("git");
    let out = std::process::Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| {
            let msg = format!("无法运行 git(可能未安装):{e}");
            logging::emit(
                logging::LogLevel::Error,
                "git",
                "spawn failed",
                Some(serde_json::json!({ "cmd": cmd, "err": e.to_string() })),
            );
            msg
        })?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let trimmed = stderr.trim();
        logging::emit(
            logging::LogLevel::Error,
            "git",
            "command failed",
            Some(serde_json::json!({
                "cmd": cmd,
                "code": out.status.code(),
                "stderr": trimmed.chars().take(500).collect::<String>(),
            })),
        );
        return Err(if trimmed.is_empty() {
            format!("git 退出码 {}", out.status.code().unwrap_or(-1))
        } else {
            trimmed.to_string()
        });
    }
    logging::emit(logging::LogLevel::Debug, "git", cmd, None);
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// vault 是否为 git 工作区(`git rev-parse --is-inside-work-tree` 退出码判定)。
fn git_is_repo_inner(root: &str) -> bool {
    std::process::Command::new("git")
        .current_dir(root)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 笔记相对路径 → 显示标题:取末段,去 `.md` 扩展名。
fn title_of(path: &str) -> String {
    let last = path.rsplit('/').next().unwrap_or(path);
    match last.strip_suffix(".md") {
        Some(s) => s.to_string(),
        None => last.to_string(),
    }
}

/// 结构操作(创建/删除/重命名)的自动提交:**只暂存并提交给定路径**,不动其它
/// 已暂存内容(正文编辑从未 `git add`,故不会被卷入),以保 commit 卫生。
/// 非 git 仓库或无可提交时静默跳过(降级,不阻塞文件操作)。
fn git_commit_paths(root: &str, message: &str, paths: &[&str]) {
    if !git_is_repo_inner(root) {
        return;
    }
    let mut add_args: Vec<&str> = Vec::with_capacity(2 + paths.len());
    add_args.push("add");
    add_args.push("-A");
    add_args.extend_from_slice(paths);
    if run_git(root, &add_args).is_err() {
        return;
    }
    let mut commit_args: Vec<&str> = Vec::with_capacity(4 + paths.len());
    commit_args.push("commit");
    commit_args.push("-m");
    commit_args.push(message);
    commit_args.push("--");
    commit_args.extend_from_slice(paths);
    let _ = run_git(root, &commit_args);
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

/// `git pull --no-rebase`。成功返回 stdout;冲突时 git 非零退出,stderr 回传前端。
/// 前端可再刷 `git status` 看 UU 冲突路径。
#[tauri::command]
fn git_pull(root: String) -> Result<String, String> {
    run_git(&root, &["pull", "--no-rebase"])
}

/// `git push` 当前分支。成功返回 stdout。
#[tauri::command]
fn git_push(root: String) -> Result<String, String> {
    run_git(&root, &["push"])
}

/// vault 是否为 git 仓库。前端据此决定「归档」展示历史还是「初始化 git」空态。
#[tauri::command]
fn git_is_repo(root: String) -> Result<bool, String> {
    Ok(git_is_repo_inner(&root))
}

/// 列出历史中存在、当前工作区已删除的 `.md` 笔记(git 即归档)。
/// 走 `git log --all --diff-filter=D --name-only`,按删除提交倒序;同名路径多次删除
/// 只取最近一次。每条带删除提交哈希 + 日期(YYYY-MM-DD),供前端列出与还原。
#[tauri::command]
fn git_deleted_notes(root: String) -> Result<Vec<DeletedNote>, String> {
    // 每个提交头一行 `__C__<hash> <date>`,其后跟随该提交删除的文件路径。
    let out = run_git(
        &root,
        &[
            "log",
            "--all",
            "--diff-filter=D",
            "--name-only",
            "--date=short",
            "--format=__C__%H %ad",
            "--",
            "*.md",
        ],
    )?;
    let mut notes: Vec<DeletedNote> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut commit = String::new();
    let mut date = String::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("__C__") {
            // 提交头:`<hash> <date>`
            let mut it = rest.split_whitespace();
            commit = it.next().unwrap_or("").to_string();
            date = it.next().unwrap_or("").to_string();
        } else {
            let path = line.trim();
            if path.is_empty() || seen.contains(path) {
                continue;
            }
            seen.insert(path.to_string());
            notes.push(DeletedNote {
                path: path.to_string(),
                title: title_of(path),
                commit: commit.clone(),
                deleted_at: date.clone(),
            });
        }
    }
    Ok(notes)
}

/// 从 git 历史还原一篇已删除笔记:取其最近删除提交,`git checkout <hash>^ -- <path>`
/// 把删除前的版本检回工作区并暂存。返回还原路径。
/// git 还原核心(无 Tauri State,供集成测试直接调用)。
fn git_restore_note_inner(root: &str, path: &str) -> Result<String, String> {
    let hash_out = run_git(
        root,
        &["log", "--all", "--diff-filter=D", "--format=%H", "--", path],
    )?;
    let hash = hash_out
        .lines()
        .next()
        .ok_or_else(|| format!("git 历史中未找到已删除的 {path}"))?
        .trim()
        .to_string();
    // `<hash>^` = 删除提交的父提交,即删除前的最后版本。
    let parent = format!("{hash}^");
    run_git(root, &["checkout", &parent, "--", path])?;
    run_git(root, &["add", "--", path])?;
    Ok(path.to_string())
}

#[tauri::command]
fn git_restore_note(
    root: String,
    path: String,
    state: State<LiveVaultState>,
) -> Result<String, String> {
    let path = git_restore_note_inner(&root, &path)?;
    // 还原后把该路径同步进 live(与 watcher 同路径级入口)。
    if let Ok(mut g) = state.0.lock() {
        if let Some(live) = g.as_mut() {
            if live.root == root {
                let _ = live_sync_paths(live, &root, &[path.clone()]);
            }
        }
    }
    Ok(path)
}

/// 把 vault 初始化为 git 仓库(`git init`),并尝试一个初始提交(无 user 配置 /
/// 空仓库时静默跳过)。供「归档」非 git 空态的「初始化 git」按钮。
#[tauri::command]
fn git_init(root: String) -> Result<(), String> {
    run_git(&root, &["init"])?;
    let _ = run_git(&root, &["add", "-A"]);
    let _ = run_git(&root, &["commit", "-m", "Initial commit"]);
    Ok(())
}

// ───────────────────────── 文件监听(路径级增量)─────────────────────────
//
// notify 监听 vault 目录树(递归)。变化 debounce 350ms 后 emit "vault-changed"
// **payload = 相对路径列表**;前端调 apply_vault_changes 把这些路径读入/删除 live
// entries 再 build_from_map —— 不再 WalkDir 全库。漏事件时 UI 可 force index_vault
// 全量自愈。过滤:只对 .md/.canvas 且无点段路径 emit。

struct WatcherState(Mutex<Option<RecommendedWatcher>>);

/// 一条变化路径是否值得通知前端:.md/.canvas,且路径里没有点开头的段
/// (与 build_index/list_vault 的 filter_entry 对齐,排除 .git/.obsidian/.trash 等)。
/// 抽成纯函数便于单测(无需构造 notify::Event)。
fn path_should_emit(p: &std::path::Path) -> bool {
    let has_dot_segment = p.components().any(|c| match c {
        std::path::Component::Normal(s) => s.to_string_lossy().starts_with('.'),
        _ => false,
    });
    if has_dot_segment {
        return false;
    }
    matches!(
        p.extension().and_then(|e| e.to_str()),
        Some("md") | Some("canvas")
    )
}

/// 事件中命中过滤的相对路径(相对 vault root;统一 `/`)。
fn event_rel_paths(root: &Path, ev: &notify::Event) -> Vec<String> {
    let mut out = Vec::new();
    for p in &ev.paths {
        if !path_should_emit(p) {
            continue;
        }
        if let Ok(rel) = p.strip_prefix(root) {
            out.push(normalize_rel(&rel.to_string_lossy()));
        }
    }
    out
}

/// 启动对 vault 的递归监听(切换 vault 时先停旧的)。
/// debounce 后 emit `vault-changed` + 变更相对路径列表 → 前端 apply_vault_changes。
#[tauri::command]
fn watch_vault(app: AppHandle, state: State<WatcherState>, root: String) -> Result<(), String> {
    // 先停旧 watcher(drop → channel 断开 → debounce 线程退出)。
    *state.0.lock().unwrap() = None;
    if root.is_empty() {
        return Ok(());
    }

    let (tx, rx) = mpsc::channel::<notify::Event>();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(ev) = res {
                let _ = tx.send(ev);
            }
        },
        notify::Config::default(),
    )
    .map_err(|e| e.to_string())?;
    let root_path = PathBuf::from(&root);
    watcher
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // debounce 线程:合并静默窗口内路径,emit 去重后的相对路径列表。
    let app_handle = app.clone();
    let root_for_thread = root_path;
    thread::spawn(move || {
        let mut pending: BTreeSet<String> = BTreeSet::new();
        loop {
            match rx.recv_timeout(Duration::from_millis(350)) {
                Ok(ev) => {
                    for rel in event_rel_paths(&root_for_thread, &ev) {
                        pending.insert(rel);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if !pending.is_empty() {
                        let paths: Vec<String> = pending.iter().cloned().collect();
                        pending.clear();
                        let _ = app_handle.emit("vault-changed", paths);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

// ───────────────────────── 应用入口 ──────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState(Mutex::new(None)))
        .manage(LiveVaultState(Mutex::new(None)))
        .manage(acp::AcpState::default())
        // 菜单栏 app 模式:主窗口点 × 只隐藏,app 与状态栏图标常驻 → 左键状态栏图标可重开。
        // 不在此停 agent:app 继续运行、会话保留;真正退出(Cmd+Q / tray Quit)走 PredefinedMenuItem::quit
        // → app.exit(0)(不触发 prevent_close),进程结束时 kill_on_drop / drop 清理 agent 子进程。
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            // B-AGENT-PATHFIX:GUI 启动 PATH 极简,先并回用户登录 PATH + 常见目录,
            // 否则 agent_list 检测 / AcpAgent spawn 都会失败。
            acp::augment_path();
            // L1 客户端日志:AppLog 目录 + profile(env OPEN_LLM_WIKI_LOG_PROFILE / debug→dev / release→prod)。
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("open-llm-wiki-logs"));
            let profile = logging::resolve_profile_from_env();
            logging::init(log_dir, profile);
            logging::install_panic_hook();
            // acp(agent 子进程)的握手/流式/错误始终记到 debug——即使全局 prod(error+),
            // 便于排查「agent 连不上 / 握手卡住 / 流式不动」等问题。
            logging::set_target_min("acp", logging::LogLevel::Debug);

            // 原生菜单:id 与 ui/src/lib/commands 注册表对齐(docs/10)。
            let file_new = MenuItemBuilder::with_id("new-note", "New Note")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let _file_canvas = MenuItemBuilder::with_id("new-canvas", "New Canvas").build(app)?; // 入口暂隐(孤立白板);builder 保留以便恢复
            let file_sheet = MenuItemBuilder::with_id("new-sheet", "New Spreadsheet").build(app)?;
            let file_open = MenuItemBuilder::with_id("open-vault", "Open Vault…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let file_save = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let file_reveal =
                MenuItemBuilder::with_id("reveal", "Reveal in Finder").build(app)?;
            let file_archive =
                MenuItemBuilder::with_id("archive", "Archive Note").build(app)?;
            let file_close = MenuItemBuilder::with_id("close-tab", "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;
            let file_settings = MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            let help_docs =
                MenuItemBuilder::with_id("user-docs", "User Guide").build(app)?;
            let help_issue =
                MenuItemBuilder::with_id("report-issue", "Report Issue…").build(app)?;
            let edit_find = MenuItemBuilder::with_id("find", "Find in Note")
                .accelerator("CmdOrCtrl+F")
                .build(app)?;
            let edit_find_vault =
                MenuItemBuilder::with_id("find-vault", "Search in Vault…")
                    .accelerator("CmdOrCtrl+Shift+F")
                    .build(app)?;
            let mode_src = MenuItemBuilder::with_id("mode-source", "Source Mode").build(app)?;
            let mode_wy = MenuItemBuilder::with_id("mode-wysiwyg", "Wysiwyg Mode").build(app)?;
            let edit_split =
                MenuItemBuilder::with_id("toggle-split", "Toggle Split Preview").build(app)?;
            let view_ed = MenuItemBuilder::with_id("view-editor", "Editor").build(app)?;
            let view_gr = MenuItemBuilder::with_id("view-graph", "Graph").build(app)?;
            let view_health = MenuItemBuilder::with_id("view-health", "Health").build(app)?;
            let view_git = MenuItemBuilder::with_id("view-git", "Git").build(app)?;
            let view_theme =
                MenuItemBuilder::with_id("toggle-theme", "Toggle Theme").build(app)?;
            let view_refresh = MenuItemBuilder::with_id("refresh-index", "Refresh Index")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&file_new)
                // 画布「新建」入口暂隐:孤立白板,与图谱/QQL 解耦(file_canvas builder 保留)
                .item(&file_sheet)
                .separator()
                .item(&file_open)
                .item(&file_save)
                .separator()
                .item(&file_reveal)
                .item(&file_archive)
                .item(&file_close)
                .separator()
                .item(&file_settings)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                // macOS 键等效(⌘A)由原生菜单路由:缺这一项,textarea 里全选会失效。
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .separator()
                .item(&edit_find)
                .item(&edit_find_vault)
                .separator()
                .item(&mode_src)
                .item(&mode_wy)
                .item(&edit_split)
                .build()?;
            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&view_ed)
                .item(&view_gr)
                .item(&view_health)
                .item(&view_git)
                .separator()
                .item(&view_theme)
                .item(&view_refresh)
                .build()?;
            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&help_docs)
                .separator()
                .item(&help_issue)
                .build()?;
            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&help_menu)
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref().to_string();
                // URL 项在壳里直接打开,不再 emit:前端曾因异步 listen 泄漏把同一
                // 事件派发多次,Report Issue 会连开多个浏览器窗口。
                match id.as_str() {
                    "report-issue" => {
                        let _ = open_url_in_browser(PROJECT_ISSUES_URL);
                    }
                    "user-docs" => {
                        let _ = open_url_in_browser(USER_DOCS_URL);
                    }
                    _ => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("menu-action", id);
                        }
                    }
                }
            });

            // ── 状态栏(menubar)图标:左键打开主窗口,右键 Show/Quit 菜单 ──
            // 图标为 macOS template image(纯黑 + alpha),icon_as_template(true) → 系统
            // 自动按菜单栏明暗反色(浅色栏 → 白),与主 app icon 的灯泡意象一致。
            // 用 @2x(44px):Retina 原生、非 Retina 向下采样,两种屏都清晰。
            let tray_show = MenuItemBuilder::with_id("tray-show", "Show Open LLM Wiki").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&tray_show)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;
            TrayIconBuilder::with_id("main-tray")
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray-icon-light@2x.png"
                ))?)
                .icon_as_template(true)
                .menu(&tray_menu)
                // 左键不弹菜单,改由 on_tray_icon_event 直接显示窗口。
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    // tray 菜单事件独立于 app.on_menu_event(window menu);此处只处理自定义 show。
                    if event.id().as_ref() == "tray-show" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_vault,
            read_note,
            write_note,
            create_note,
            delete_note,
            rename_note,
            save_attachment,
            attachment_exists,
            media_index,
            media_of_note,
            trash_attachments,
            read_attachment_data_url,
            read_graph_layout,
            save_graph_layout,
            index_vault,
            apply_vault_changes,
            run_qql,
            search_notes,
            lint_vault,
            pick_vault,
            create_sample_vault,
            reveal_in_finder,
            open_external_url,
            log_write,
            log_open_dir,
            log_set_profile,
            log_get_status,
            log_export_bundle,
            git_status_raw,
            git_log_raw,
            git_commit,
            git_pull,
            git_push,
            git_is_repo,
            git_deleted_notes,
            git_restore_note,
            git_init,
            watch_vault,
            acp::agent_list,
            acp::agent_start,
            acp::agent_prompt,
            acp::agent_stop,
            acp::agent_cancel,
            acp::agent_alive,
            acp::agent_runtime,
            acp::agent_permission_respond,
            acp::agent_set_instant_commit,
            acp::agent_set_mode,
            acp::agent_set_config_option,
            acp::agent_set_model,
            acp::agent_session_info,
            transcript::agent_thread_create,
            transcript::agent_thread_list,
            transcript::agent_thread_load,
            transcript::agent_thread_append,
            transcript::agent_thread_delete,
            git_attr::agent_activity,
            git_attr::agent_diff,
            git_attr::agent_revert,
            git_attr::agent_adopt,
            onboarding::onboard_scan,
            onboarding::onboard_apply,
            onboarding::onboard_remove,
            onboarding::onboard_doctor,
            onboarding::onboard_init,
            onboarding::onboard_install_skill,
            onboarding::onboard_guidance,
            onboarding::onboard_resolve_binary,
            onboarding::onboard_pick_binary,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

#[cfg(test)]
mod tests {
    use super::{
        create_sample_vault, decode_base64, is_allowed_external_url, is_md_rel, live_apply,
        load_live_from_disk, normalize_rel, path_should_emit, preview_of,
        should_open_external_now, strip_data_url_base64, LiveVault,
    };
    use std::time::Duration;
    use open_llm_wiki_core::{parse_query, ResultSet, VaultIndex};
    use std::collections::BTreeMap;
    use std::fs;

    #[test]
    fn create_sample_vault_writes_welcome() {
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: test-only env for documents_dir override; single-threaded test process.
        unsafe {
            std::env::set_var("OPEN_LLM_WIKI_DOCUMENTS", tmp.path());
        }
        let path = create_sample_vault().expect("create sample");
        let welcome = std::path::Path::new(&path).join("Welcome.md");
        assert!(welcome.is_file(), "Welcome.md should exist at {path}");
        let body = fs::read_to_string(&welcome).unwrap();
        assert!(body.contains("Open LLM Wiki"));
        assert!(body.contains("[[Local First]]"));
        // second call gets a numbered folder
        let path2 = create_sample_vault().expect("create sample 2");
        assert_ne!(path, path2);
        unsafe {
            std::env::remove_var("OPEN_LLM_WIKI_DOCUMENTS");
        }
    }

    #[test]
    fn normalize_and_md_helpers() {
        assert_eq!(normalize_rel(r".\a\b.md"), "a/b.md");
        assert!(is_md_rel("x.md"));
        assert!(!is_md_rel("x.canvas"));
    }

    #[test]
    fn external_url_allowlist_repo_and_pages() {
        assert!(is_allowed_external_url(
            "https://github.com/rhythm1995/open-llm-wiki"
        ));
        assert!(is_allowed_external_url(
            "https://github.com/rhythm1995/open-llm-wiki/issues"
        ));
        assert!(is_allowed_external_url(
            "https://rhythm1995.github.io/open-llm-wiki"
        ));
        assert!(is_allowed_external_url(
            "https://rhythm1995.github.io/open-llm-wiki/docs/start"
        ));
        assert!(is_allowed_external_url(
            "https://rhythm1995.github.io/open-llm-wiki/docs/start?lang=zh"
        ));
        assert!(!is_allowed_external_url("https://evil.example/phish"));
        assert!(!is_allowed_external_url(
            "https://github.com/rhythm1995/open-llm-wiki.evil"
        ));
        assert!(!is_allowed_external_url(
            "https://rhythm1995.github.io.evil/open-llm-wiki/docs/start"
        ));
        assert!(!is_allowed_external_url("http://github.com/rhythm1995/open-llm-wiki"));
    }

    #[test]
    fn external_url_dedupes_same_url_inside_window() {
        let window = Duration::from_millis(800);
        let url = "https://github.com/rhythm1995/open-llm-wiki/issues";
        assert!(should_open_external_now(None, url, window));
        assert!(!should_open_external_now(
            Some((url, Duration::from_millis(400))),
            url,
            window
        ));
        assert!(should_open_external_now(
            Some((url, Duration::from_millis(801))),
            url,
            window
        ));
        assert!(should_open_external_now(
            Some((url, Duration::from_millis(10))),
            "https://rhythm1995.github.io/open-llm-wiki/docs/start",
            window
        ));
    }

    #[test]
    fn base64_decode_png_header() {
        // "iVBORw0KGgo=" is PNG magic prefix
        let bytes = decode_base64("iVBORw0KGgo=").unwrap();
        assert_eq!(&bytes[..4], &[0x89, b'P', b'N', b'G']);
        let from_data = strip_data_url_base64("data:image/png;base64,iVBORw0KGgo=");
        assert_eq!(from_data, "iVBORw0KGgo=");
    }

    #[test]
    fn preview_strips_leading_h1_and_collapses_whitespace() {
        let body = "# Title\n\nFirst line.\nSecond, with   spaces.\n";
        assert_eq!(preview_of(body), "First line. Second, with spaces.");
    }

    #[test]
    fn preview_keeps_all_when_no_heading() {
        let body = "Just a body, no heading.\nAnother line.\n";
        assert_eq!(preview_of(body), "Just a body, no heading. Another line.");
    }

    #[test]
    fn preview_empty_after_heading() {
        assert_eq!(preview_of("# Only Title\n"), "");
    }

    #[test]
    fn preview_truncates_with_ellipsis_over_200_chars() {
        let long = "word ".repeat(60); // 300 字符
        let p = preview_of(&long);
        assert!(p.ends_with('…'));
        assert!(p.chars().count() <= 201); // 200 + 省略号
    }

    // ── watcher 过滤(path_should_emit):.md/.canvas 触发,.git/.obs/.trash/备份/图片 忽略。
    #[test]
    fn watcher_emits_for_md_and_canvas() {
        assert!(path_should_emit(std::path::Path::new("note.md")));
        assert!(path_should_emit(std::path::Path::new("sub/deep/whiteboard.canvas")));
    }

    #[test]
    fn watcher_ignores_dot_segments_at_any_depth() {
        // git 自动提交产生的 .git/ 变化是刷新噪音主源 —— 必须忽略。
        assert!(!path_should_emit(std::path::Path::new(".git/HEAD")));
        assert!(!path_should_emit(std::path::Path::new(".obsidian/app.json")));
        assert!(!path_should_emit(std::path::Path::new(".trash/note.md")));
        // 点段在任意深度都该忽略(不仅根)。
        assert!(!path_should_emit(std::path::Path::new("vault/.cache/x.md")));
    }

    #[test]
    fn watcher_ignores_non_md_canvas_and_backups() {
        assert!(!path_should_emit(std::path::Path::new("image.png")));
        assert!(!path_should_emit(std::path::Path::new("notes.txt")));
        // 编辑器备份文件(`file.md~`)扩展名是 `md~`,不等于 `md` —— 不触发。
        assert!(!path_should_emit(std::path::Path::new("note.md~")));
        // 无扩展名。
        assert!(!path_should_emit(std::path::Path::new("README")));
    }

    /// live_apply 后索引查询 = 同 entries 全量 build。
    #[test]
    fn live_apply_query_matches_full_build_from_map() {
        let mut live = LiveVault {
            root: "/tmp/v".into(),
            entries: BTreeMap::new(),
            index: VaultIndex::build(vec![]),
            media: open_llm_wiki_core::MediaIndex::new(),
        };
        live_apply(
            &mut live,
            vec![
                (
                    "a.md".into(),
                    Some("---\ntype: Concept\n---\n# A\n#tag1\n".into()),
                ),
                (
                    "b.md".into(),
                    Some("---\ntype: Source\n---\n# B\nbody truth\n".into()),
                ),
            ],
        );
        live_apply(
            &mut live,
            vec![
                ("a.md".into(), None),
                (
                    "c.md".into(),
                    Some("---\ntype: Concept\n---\n# C\n".into()),
                ),
            ],
        );
        let full = VaultIndex::build_from_map(&live.entries);
        assert_eq!(live.index.len(), full.len());
        let q = parse_query(r#"WHERE type = "Concept" RENDER count"#).unwrap();
        match (live.index.query(&q), full.query(&q)) {
            (ResultSet::Count(a), ResultSet::Count(b)) => assert_eq!(a, b),
            other => panic!("expected Count, got {other:?}"),
        }
        assert_eq!(live.index.search(&["truth"]).len(), 1);
    }

    /// `lint_vault` 命令的数据路径:delta 建起的 live 索引 → lint_all → 报告。
    #[test]
    fn lint_over_live_index_reports_candidates() {
        let mut live = LiveVault {
            root: "/tmp/v".into(),
            entries: BTreeMap::new(),
            index: VaultIndex::build(vec![]),
            media: open_llm_wiki_core::MediaIndex::new(),
        };
        live_apply(
            &mut live,
            vec![
                (
                    "a.md".into(),
                    Some(
                        "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[b]]\"\n---\n# A\n"
                            .into(),
                    ),
                ),
                (
                    "b.md".into(),
                    Some("---\ntype: Concept\nstatus: Active\n---\n# B\n".into()),
                ),
            ],
        );
        let report = open_llm_wiki_core::lint_all(live.index.graph());
        assert_eq!(report.findings.len(), 1);
        assert_eq!(report.findings[0].subject.path, "a.md");
        assert_eq!(report.findings[0].other.as_ref().unwrap().path, "b.md");
    }

    #[test]
    fn load_live_from_disk_roundtrip_tmp() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap();
        std::fs::write(
            dir.path().join("n.md"),
            "---\ntype: Note\n---\n# N\nhello index\n",
        )
        .unwrap();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".git/x.md"), "# hidden\n").unwrap();
        let live = load_live_from_disk(root).unwrap();
        assert_eq!(live.entries.len(), 1);
        assert!(live.entries.contains_key("n.md"));
        let q = parse_query("WHERE type = \"Note\" RENDER list").unwrap();
        match live.index.query(&q) {
            ResultSet::List(ids) => assert_eq!(ids.len(), 1),
            _ => panic!("list"),
        }
    }
}

/// git 归档一体化(Phase 1)集成测试:真实 round-trip 过系统 git(无 GUI 下的最强确认)。
/// 覆盖 is_repo / init / 选择性提交( commit 卫生 )/ 已删笔记列出 / 还原。
#[cfg(test)]
mod git_tests {
    use super::{
        git_commit_paths, git_deleted_notes, git_init, git_is_repo_inner, git_restore_note_inner,
        run_git,
    };

    /// 独占临时 vault + 设本地 git 身份(沙箱无全局 user 配置也能提交)+ 关 gpg 签名。
    fn fresh_repo() -> tempfile::TempDir {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap();
        // 先 init(空目录无内容可提交,失败被 git_init 静默吞掉),再设本地身份。
        git_init(root.to_string()).unwrap();
        run_git(root, &["config", "user.email", "test@openllmwiki.dev"]).unwrap();
        run_git(root, &["config", "user.name", "Test"]).unwrap();
        run_git(root, &["config", "commit.gpgsign", "false"]).unwrap();
        dir
    }

    fn write(root: &str, name: &str, body: &str) {
        std::fs::write(format!("{root}/{name}"), body).unwrap();
    }

    #[test]
    fn is_repo_false_then_init_makes_it_true() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap();
        // 裸目录不是 git 仓库。
        assert!(!git_is_repo_inner(root));
        // git_init 初始化(空目录无内容可提交,失败被静默吞掉,不影响 is_repo 判定)。
        git_init(root.to_string()).unwrap();
        assert!(git_is_repo_inner(root));
    }

    /// 「结构自动 + 内容手动」核心不变量:结构提交只含指定路径,
    /// 未暂存的正文编辑绝不被卷入(保住用户真实仓库的 commit 卫生)。
    #[test]
    fn commit_paths_is_selective_and_does_not_sweep_unstaged_edits() {
        let dir = fresh_repo();
        let root = dir.path().to_str().unwrap();

        write(root, "a.md", "# A\nbody-v1\n");
        git_commit_paths(root, "Create a", &["a.md"]);

        // 正文编辑:把 a.md 改成 v2(模拟用户手动编辑,不自动提交)。
        write(root, "a.md", "# A\nbody-v2-edited\n");
        // 结构操作:新建 b.md,只提交 b。
        write(root, "b.md", "# B\n");
        git_commit_paths(root, "Create b", &["b.md"]);

        // a 的 v2 编辑未进入 HEAD(仍 v1);b 已在 HEAD。
        let a_head = run_git(root, &["show", "HEAD:a.md"]).unwrap();
        assert!(a_head.contains("body-v1"));
        assert!(!a_head.contains("body-v2-edited"));
        let b_head = run_git(root, &["show", "HEAD:b.md"]).unwrap();
        assert!(b_head.contains("# B"));
    }

    /// 删除 → 归档列出 → 还原 的完整 round-trip。
    #[test]
    fn deleted_notes_and_restore_roundtrip() {
        let dir = fresh_repo();
        let root = dir.path().to_str().unwrap();

        write(root, "gone.md", "# Gone\noriginal body\n");
        git_commit_paths(root, "Create gone", &["gone.md"]);
        assert!(git_deleted_notes(root.to_string()).unwrap().is_empty());

        // 删除并自动提交删除(结构操作)。
        std::fs::remove_file(format!("{root}/gone.md")).unwrap();
        git_commit_paths(root, "Delete gone", &["gone.md"]);

        // 归档视图列出已删笔记;title 由路径推(去扩展名)。
        let deleted = git_deleted_notes(root.to_string()).unwrap();
        assert_eq!(deleted.len(), 1);
        assert_eq!(deleted[0].path, "gone.md");
        assert_eq!(deleted[0].title, "gone");
        assert!(!deleted[0].commit.is_empty());
        assert!(!deleted[0].deleted_at.is_empty());

        // 还原:文件回到工作区,内容为删除前的最后提交版本。
        git_restore_note_inner(root, "gone.md").unwrap();
        let body = std::fs::read_to_string(format!("{root}/gone.md")).unwrap();
        assert!(body.contains("original body"));
    }
}

//! openobs-app —— Tauri 桌面壳。
//!
//! 薄薄的 IO 层:把文件系统读写 + 目录选择暴露成 Tauri 命令,真正的逻辑(解析/图谱/查询/检索)
//! 全部委托给 `openobs-core`。前端通过 `@tauri-apps/api` 的 invoke 调用这些命令。
//!
//! 设计原则:命令函数只做 IO 与 core 之间的胶水,不写业务逻辑。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use openobs_core::{
    frontmatter_str, parse_query, tags as note_tags, type_of, EdgeKind, ResultSet, Target,
    VaultIndex,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
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
    write_note(root.clone(), path.clone(), content)?;
    // 结构操作自动提交(仅此路径);正文编辑不提交,保 commit 卫生。
    git_commit_paths(&root, &format!("Create {}", title_of(&path)), &[&path]);
    Ok(())
}

#[tauri::command]
fn delete_note(root: String, path: String) -> Result<(), String> {
    let full = resolve_under(&root, &path)?;
    fs::remove_file(&full).map_err(err)?;
    // 删除即提交:该笔记自此进入 git 历史,可在「归档」还原(到上次提交的内容)。
    git_commit_paths(&root, &format!("Delete {}", title_of(&path)), &[&path]);
    Ok(())
}

#[tauri::command]
fn rename_note(root: String, from: String, to: String) -> Result<(), String> {
    let src = resolve_under(&root, &from)?;
    let dst = resolve_under(&root, &to)?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(&src, &dst).map_err(err)?;
    git_commit_paths(
        &root,
        &format!("Rename {} → {}", title_of(&from), title_of(&to)),
        &[&from, &to],
    );
    Ok(())
}

/// 全量索引快照(节点 + 统一边),供图谱/反向链接/类型标签面板。
#[tauri::command]
fn index_vault(root: String) -> Result<VaultSnapshot, String> {
    let idx = build_index(&root)?;
    let nodes = project_nodes(&root, &idx);
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

/// 前端→终端的诊断日志桥:把 webview 的 console.error / 未捕获错误转发到 stderr。
/// 打包后无 inspector 时,从命令行启动 app 即可看到运行时报错(参见 lib/diag-log.ts)。
/// 仅供诊断,不做任何业务;前端 fire-and-forget 调用。
#[tauri::command]
fn diag_log(line: String) {
    eprintln!("[webview] {line}");
}

/// 系统文件夹选择对话框。
#[tauri::command]
async fn pick_vault(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
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
#[tauri::command]
fn git_restore_note(root: String, path: String) -> Result<String, String> {
    let hash_out = run_git(
        &root,
        &["log", "--all", "--diff-filter=D", "--format=%H", "--", &path],
    )?;
    let hash = hash_out
        .lines()
        .next()
        .ok_or_else(|| format!("git 历史中未找到已删除的 {path}"))?
        .trim()
        .to_string();
    // `<hash>^` = 删除提交的父提交,即删除前的最后版本。
    let parent = format!("{hash}^");
    run_git(&root, &["checkout", &parent, "--", &path])?;
    run_git(&root, &["add", "--", &path])?;
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

// ───────────────────────── 文件监听(增量触发)─────────────────────────
//
// notify 监听 vault 目录树(递归)。文件变化经 debounce(静默 350ms 合并)后 emit
// "vault-changed",前端 listen 到即 index_vault 全量重建。v1:watcher 只当**触发器**,
// 仍全量 rebuild —— 这与"索引是文件的派生物、文件即真相"一致;真增量 diff 是后续演进。
//
// 过滤:只对 .md/.canvas、且路径无点开头段(.git/.obs 等)的变化 emit,避免 git 自动
// 提交产生的 .git 噪音反复触发刷新。mock/浏览器模式不监听(无 OS fs)。

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

/// 一次 notify 事件是否值得通知前端:至少一个变化路径命中 `path_should_emit`。
fn should_emit_change(ev: &notify::Event) -> bool {
    ev.paths.iter().any(|p| path_should_emit(p))
}

/// 启动对 vault 的递归监听(切换 vault 时先停旧的)。变化 debounce 后 emit
/// "vault-changed";前端据此全量刷新索引。
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
    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // debounce 线程:事件静默 350ms 后才 emit,合并一次保存产生的多个 fs 事件。
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut pending = false;
        loop {
            match rx.recv_timeout(Duration::from_millis(350)) {
                Ok(ev) => {
                    if should_emit_change(&ev) {
                        pending = true;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if pending {
                        let _ = app_handle.emit("vault-changed", ());
                        pending = false;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

/// 停止监听(drop watcher → channel 断开 → debounce 线程自然退出)。
#[tauri::command]
fn unwatch_vault(state: State<WatcherState>) -> Result<(), String> {
    *state.0.lock().unwrap() = None;
    Ok(())
}

// ───────────────────────── 应用入口 ──────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState(Mutex::new(None)))
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
            reveal_in_finder,
            diag_log,
            git_status_raw,
            git_log_raw,
            git_commit,
            git_is_repo,
            git_deleted_notes,
            git_restore_note,
            git_init,
            watch_vault,
            unwatch_vault,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

#[cfg(test)]
mod tests {
    use super::{path_should_emit, preview_of};

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
}

/// git 归档一体化(Phase 1)集成测试:真实 round-trip 过系统 git(无 GUI 下的最强确认)。
/// 覆盖 is_repo / init / 选择性提交( commit 卫生 )/ 已删笔记列出 / 还原。
#[cfg(test)]
mod git_tests {
    use super::{git_commit_paths, git_deleted_notes, git_init, git_is_repo_inner, git_restore_note, run_git};

    /// 独占临时 vault + 设本地 git 身份(沙箱无全局 user 配置也能提交)+ 关 gpg 签名。
    fn fresh_repo() -> tempfile::TempDir {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap();
        // 先 init(空目录无内容可提交,失败被 git_init 静默吞掉),再设本地身份。
        git_init(root.to_string()).unwrap();
        run_git(root, &["config", "user.email", "test@openobs.dev"]).unwrap();
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
        git_restore_note(root.to_string(), "gone.md".to_string()).unwrap();
        let body = std::fs::read_to_string(format!("{root}/gone.md")).unwrap();
        assert!(body.contains("original body"));
    }
}

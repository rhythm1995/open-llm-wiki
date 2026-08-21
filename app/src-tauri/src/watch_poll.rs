//! watch_poll —— iOS 轮询文件监听(doc 18 M0)。
//!
//! notify 在 iOS 无后端(FSEvents 是 macOS-only)。这里用「快照 diff」替代:
//! 每轮 walk 一次 vault,记录 (len, mtime) 表,与上一轮比较;差异路径以与桌面
//! notify watcher **完全相同**的 `vault-changed` 事件 emit(相对路径列表),前端
//! `apply_vault_changes` 增量管线零改动。
//!
//! 纯逻辑(scan / diff / poll_once)无 Tauri 依赖,可在任意平台单测;轮询线程
//! 仅 iOS 调用。过滤复用 lib 的 `path_should_emit`(.md/.canvas、点段路径忽略)。

use std::collections::BTreeMap;
use std::path::Path;

/// vault 快照:相对路径 → (字节数, mtime 毫秒)。mtime 读取失败回退 0。
pub type PollSnapshot = BTreeMap<String, (u64, i64)>;

/// 单轮轮询结果:首轮建基线不报变化;之后有差异才 Some(路径列表)。
#[derive(Debug, PartialEq, Eq)]
pub enum PollOutcome {
    /// 首轮(无上一轮快照):静默建基线,不 emit。
    Baseline,
    /// 与上一轮一致。
    Unchanged,
    /// 新增 / 内容变化(mtime 或 len)/ 删除 的相对路径。
    Changed(Vec<String>),
}

/// 全量扫描 vault 内值得通知的文件(.md/.canvas;点段路径忽略,与桌面 watcher 过滤一致)。
pub fn scan_poll_snapshot(root: &Path) -> PollSnapshot {
    let mut snap = PollSnapshot::new();
    if !root.is_dir() {
        return snap;
    }
    for entry in walkdir::WalkDir::new(root)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let Ok(e) = entry else {
            continue;
        };
        let p = e.path();
        if !p.is_file() || !crate::path_should_emit(p) {
            continue;
        }
        let rel = p
            .strip_prefix(root)
            .unwrap_or(p)
            .to_string_lossy()
            .replace('\\', "/");
        let Ok(meta) = std::fs::metadata(p) else {
            continue;
        };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        snap.insert(rel, (meta.len(), mtime_ms));
    }
    snap
}

/// 纯 diff:两个快照间 新增 / 变化 / 删除 的相对路径(排序输出)。
pub fn diff_poll_snapshots(old: &PollSnapshot, new: &PollSnapshot) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (path, sig) in new {
        match old.get(path) {
            None => out.push(path.clone()), // 新增
            Some(prev) if prev != sig => out.push(path.clone()), // len 或 mtime 变
            Some(_) => {}
        }
    }
    for path in old.keys() {
        if !new.contains_key(path) {
            out.push(path.clone()); // 删除
        }
    }
    out.sort();
    out
}

/// 一轮轮询:扫描 + 与上一轮 diff。目录不存在时返回 Err(轮询循环据此退出)。
pub fn poll_once(
    root: &Path,
    prev: Option<&PollSnapshot>,
) -> Result<(PollSnapshot, PollOutcome), String> {
    if !root.is_dir() {
        return Err(format!("不是目录:{}", root.display()));
    }
    let snap = scan_poll_snapshot(root);
    let outcome = match prev {
        None => PollOutcome::Baseline,
        Some(old) => {
            let changed = diff_poll_snapshots(old, &snap);
            if changed.is_empty() {
                PollOutcome::Unchanged
            } else {
                PollOutcome::Changed(changed)
            }
        }
    };
    Ok((snap, outcome))
}

/// 轮询间隔(iOS 前台为主的生命周期下,2s 足够跟手且成本可控)。
pub const POLL_INTERVAL_MS: u64 = 2000;

/// iOS 轮询循环:每轮 poll_once,差异 emit `vault-changed`(与桌面 notify watcher 同事件同
/// payload 形态)。`gen_arc` 是 WatcherState 的世代计数:watch_vault 再被调用(切 vault /
/// 停监听)会递增,旧循环在下一个 tick 自查后退出。根目录消失(poll_once Err)也退出。
#[cfg(target_os = "ios")]
pub fn spawn_poll_watcher(
    app: tauri::AppHandle,
    root: std::path::PathBuf,
    gen_arc: std::sync::Arc<std::sync::Mutex<u64>>,
    my_gen: u64,
) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut prev: Option<PollSnapshot> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS));
            let stale = gen_arc
                .lock()
                .map(|g| *g != my_gen)
                .unwrap_or(true);
            if stale {
                break;
            }
            match poll_once(&root, prev.as_ref()) {
                Ok((snap, PollOutcome::Changed(paths))) => {
                    let _ = app.emit("vault-changed", paths);
                    prev = Some(snap);
                }
                Ok((snap, _)) => prev = Some(snap),
                Err(_) => break, // 根目录消失:退出,等下一次 watch_vault 重启。
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("olw-poll-")
            .tempdir()
            .unwrap()
    }

    #[test]
    fn scan_finds_md_and_canvas_and_ignores_dot_dirs() {
        let dir = tmp();
        std::fs::write(dir.path().join("a.md"), "# A\n").unwrap();
        std::fs::create_dir_all(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/b.md"), "# B\n").unwrap();
        std::fs::write(dir.path().join("sub/board.canvas"), "{}").unwrap();
        // 噪音:.git、.open-llm-wiki、非 md/canvas。
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".git/HEAD.md"), "x").unwrap();
        std::fs::create_dir_all(dir.path().join("sub/.open-llm-wiki")).unwrap();
        std::fs::write(dir.path().join("sub/.open-llm-wiki/x.md"), "x").unwrap();
        std::fs::write(dir.path().join("img.png"), b"PNG").unwrap();

        let snap = scan_poll_snapshot(dir.path());
        let mut keys: Vec<&str> = snap.keys().map(|s| s.as_str()).collect();
        keys.sort();
        assert_eq!(keys, vec!["a.md", "sub/b.md", "sub/board.canvas"]);
        // len 记录字节数。
        assert_eq!(snap.get("a.md").map(|(l, _)| *l), Some(4));
    }

    #[test]
    fn diff_reports_created_changed_removed() {
        let old: PollSnapshot = BTreeMap::from([
            ("keep.md".into(), (1, 100)),
            ("gone.md".into(), (2, 200)),
            ("edit.md".into(), (3, 300)),
        ]);
        let new: PollSnapshot = BTreeMap::from([
            ("keep.md".into(), (1, 100)),
            ("edit.md".into(), (3, 301)), // mtime 变
            ("born.md".into(), (5, 500)),
            ("grown.md".into(), (9, 100)), // len 变(mtime 相同也算变)
        ]);
        // edit.md mtime 变、born.md 新增、gone.md 删除、grown.md 相对 old 是新增:
        let old2: PollSnapshot = BTreeMap::from([
            ("keep.md".into(), (1, 100)),  // 保持不变(对照)
            ("grown.md".into(), (1, 100)), // 仅 len 变(mtime 相同)
        ]);
        assert_eq!(
            diff_poll_snapshots(&old, &new),
            vec!["born.md", "edit.md", "gone.md", "grown.md"]
        );
        assert_eq!(diff_poll_snapshots(&old2, &new), vec!["born.md", "edit.md", "grown.md"]);
        // 完全一致 → 空。
        assert!(diff_poll_snapshots(&old, &old).is_empty());
    }

    #[test]
    fn poll_once_baseline_then_detects_write_and_delete() {
        let dir = tmp();
        std::fs::write(dir.path().join("n.md"), "v1\n").unwrap();

        // 首轮:Baseline,不报变化。
        let (snap, out) = poll_once(dir.path(), None).unwrap();
        assert_eq!(out, PollOutcome::Baseline);
        assert!(snap.contains_key("n.md"));

        // 无变化 → Unchanged。
        let (_, out) = poll_once(dir.path(), Some(&snap)).unwrap();
        assert_eq!(out, PollOutcome::Unchanged);

        // 写入(len 变化即可触发 diff,不依赖 mtime 精度)→ Changed 恰含变更路径。
        std::fs::write(dir.path().join("n.md"), "v2-longer\n").unwrap();
        std::fs::write(dir.path().join("new.md"), "# N\n").unwrap();
        let (snap2, out) = poll_once(dir.path(), Some(&snap)).unwrap();
        assert_eq!(
            out,
            PollOutcome::Changed(vec!["n.md".into(), "new.md".into()])
        );

        // 删除 → Changed 含被删路径。
        std::fs::remove_file(dir.path().join("new.md")).unwrap();
        let (_, out) = poll_once(dir.path(), Some(&snap2)).unwrap();
        assert_eq!(out, PollOutcome::Changed(vec!["new.md".into()]));

        // 根目录消失 → Err(轮询循环退出),不 panic。
        let gone = tmp();
        let path = gone.path().to_path_buf();
        drop(gone);
        assert!(poll_once(&path, None).is_err());
    }
}

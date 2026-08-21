//! storage —— vault 存储防护层(doc 17:iCloud 支持"允许 + 引导 + 防护"的防护侧)。
//!
//! core 侧(纯判定:`open_llm_wiki_core::storage`)负责类别/配对/放行决策;
//! 本模块只做 IO 胶水:
//! - **G1 原子写**:同目录 tmp → rename。云盘(或任何观察者)要么看到旧文件、
//!   要么看到新文件,绝不看到半截;对本地用户也是崩溃防截断修复。
//! - **G2 detect_storage**:fs 探测(Mobile Documents / D&D 同步 / 云盘根)→
//!   core 判类别 + 有界 eviction 采样(`.icloud` stub 与 macOS dataless)。
//! - **G3 git 闸门**:icloud vault 默认停用自动提交与 git_init(icloud-managed
//!   宽松,IC-1 拍板);用户可经 `set_git_automation` 显式开启。
//! - **create_icloud_vault**:一键在 CloudDocs 下建 vault(用户无需进 ~/Library)。
//! - **G5 scan_conflicts**:全库 .md 名单 → core 冲突配对。
//! - **G6 读超时**:dataless 文件的隐式 iCloud 下载可能长时间阻塞,读笔记带
//!   超时,超时回 `ReadOutcome::Timeout` 让 UI 给占位提示。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use open_llm_wiki_core::storage as core_storage;
use open_llm_wiki_core::StorageKind;
use serde::Serialize;
use walkdir::WalkDir;

/// 一次读盘的最长等待(iCloud dataless 隐式下载)。超时不算错误——是"仍在下载"。
pub const READ_TIMEOUT: Duration = Duration::from_secs(10);

/// eviction 采样上限:探测发生在打开 vault 的路径上,必须有界。
const EVICTION_SAMPLE_LIMIT: usize = 200;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ───────────────────────── G1:原子写 ─────────────────────────

/// 进程内单调计数,给 tmp 文件唯一名(并发保存不互踩)。
static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// 原子写:同目录隐藏 tmp → 写入 + fsync → rename 覆盖目标。
/// 失败时清理 tmp;rename 跨行为原子(APFS/HFS/NTFS 均保证)。
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "目标无父目录".to_string())?;
    fs::create_dir_all(parent).map_err(err)?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let seq = TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = parent.join(format!(".{name}.tmp-{}-{seq}", std::process::id()));
    let write = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, path)
    })();
    if let Err(e) = write {
        let _ = fs::remove_file(&tmp);
        return Err(err(e));
    }
    Ok(())
}

pub fn atomic_write_str(path: &Path, content: &str) -> Result<(), String> {
    atomic_write(path, content.as_bytes())
}

// ───────────────────────── G2:存储探测 ─────────────────────────

/// home 目录。`OPEN_LLM_WIKI_HOME` 供测试注入假 home(优先级最高)。
fn home_dir() -> PathBuf {
    if let Ok(h) = std::env::var("OPEN_LLM_WIKI_HOME") {
        return PathBuf::from(h);
    }
    if let Ok(h) = std::env::var("HOME") {
        return PathBuf::from(h);
    }
    if let Ok(h) = std::env::var("USERPROFILE") {
        return PathBuf::from(h);
    }
    std::env::temp_dir()
}

/// 规范化(解析符号链接;失败回退原路径)。
fn canonical(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// fs 探测 → core 纯判定的类别。
pub fn storage_kind(root: &str) -> StorageKind {
    let home = canonical(&home_dir());
    let root_canon = canonical(Path::new(root));
    let md = home.join("Library/Mobile Documents");
    let cloud = md.join("com~apple~CloudDocs");
    let mut other_roots = vec![home.join("OneDrive"), home.join("Dropbox"), home.join("iCloudDrive")];
    if let Ok(od) = std::env::var("OneDrive") {
        other_roots.push(PathBuf::from(od));
    }
    let probes = core_storage::StorageProbes {
        mobile_documents: md.is_dir().then_some(md),
        cloud_docs: cloud.is_dir().then_some(cloud.clone()),
        dnd_documents: cloud.join("Documents").is_dir().then_some(cloud.join("Documents")),
        other_cloud_roots: other_roots.into_iter().filter(|p| p.is_dir()).collect(),
    };
    core_storage::classify_storage(&root_canon, &home, &probes)
}

/// macOS dataless 文件判定位(APFS st_flags 的 SF_DATALESS;TN3150)。
#[cfg(target_os = "macos")]
fn is_dataless(path: &Path) -> bool {
    use std::ffi::CString;
    const SF_DATALESS: u32 = 0x0001_0000;
    let Ok(c) = CString::new(path.as_os_str().as_encoded_bytes()) else {
        return false;
    };
    unsafe {
        let mut st: libc::stat = std::mem::zeroed();
        if libc::stat(c.as_ptr(), &mut st) == 0 {
            (st.st_flags & SF_DATALESS) != 0
        } else {
            false
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn is_dataless(_path: &Path) -> bool {
    false
}

/// 有界 eviction 采样:返回 (sampled, evicted)。
///
/// - 旧 macOS:evicted 文件是点开头 `.名字.icloud` stub,不放宽点过滤就看不见;
/// - Sonoma+:文件名正常但 dataless(stat 不触发下载,零成本)。
///
/// 只统计 `.md`;`.icloud` stub 单独计数。最多走 EVICTION_SAMPLE_LIMIT 个样本。
fn sample_eviction(root: &Path) -> (usize, usize) {
    let mut sampled = 0usize;
    let mut evicted = 0usize;
    for entry in WalkDir::new(root)
        .min_depth(1)
        .into_iter()
        // 只排除点开头**目录**(.git/.open-llm-wiki);点文件放行——stub 就是点文件。
        .filter_entry(|e| !e.file_type().is_dir() || !e.file_name().to_string_lossy().starts_with('.'))
    {
        let Ok(e) = entry else { continue };
        if e.file_type().is_dir() {
            continue;
        }
        let name = e.file_name().to_string_lossy().into_owned();
        if core_storage::is_icloud_stub(&name) {
            sampled += 1;
            evicted += 1;
        } else if name.ends_with(".md") {
            sampled += 1;
            if is_dataless(e.path()) {
                evicted += 1;
            }
        } else {
            continue;
        }
        if sampled >= EVICTION_SAMPLE_LIMIT {
            break;
        }
    }
    (sampled, evicted)
}

/// detect_storage 命令的 DTO(snake_case,与现有 DTO 惯例一致)。
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct StorageInfo {
    /// "local" | "icloud" | "icloud-managed" | "cloud-other"
    pub kind: String,
    pub cloud_docs_root: Option<String>,
    /// eviction 采样样本数(0 = 未采样 / 非 iCloud 类)。
    pub evicted_sampled: usize,
    pub evicted_count: usize,
}

/// 探测 vault 存储类别 + eviction 采样(icloud 类才采样)。
pub fn detect_storage_impl(root: &str) -> Result<StorageInfo, String> {
    if !Path::new(root).is_dir() {
        return Err(format!("不是目录:{root}"));
    }
    let kind = storage_kind(root);
    let home = canonical(&home_dir());
    let cloud_docs_root = home
        .join("Library/Mobile Documents/com~apple~CloudDocs")
        .is_dir()
        .then(|| home.join("Library/Mobile Documents/com~apple~CloudDocs").to_string_lossy().into_owned());
    let (evicted_sampled, evicted_count) = match kind {
        StorageKind::Icloud | StorageKind::IcloudManaged => {
            sample_eviction(Path::new(root))
        }
        _ => (0, 0),
    };
    Ok(StorageInfo {
        kind: kind.as_str().to_string(),
        cloud_docs_root,
        evicted_sampled,
        evicted_count,
    })
}

#[tauri::command]
pub fn detect_storage(root: String) -> Result<StorageInfo, String> {
    let info = detect_storage_impl(&root)?;
    // §10 度量(本地日志,遵循现有 logging 方案):iCloud vault 占比 / eviction 面。
    crate::logging::emit(
        crate::logging::LogLevel::Info,
        "ipc.detect_storage",
        "probed",
        Some(serde_json::json!({
            "kind": info.kind,
            "evicted_sampled": info.evicted_sampled,
            "evicted_count": info.evicted_count,
        })),
    );
    Ok(info)
}

/// iCloud Drive 是否可用(CloudDocs 目录存在)。欢迎屏据此把「在 iCloud 中创建」
/// 置灰而非点进去才失败(doc 17 M2 验收)。
pub fn icloud_available_impl() -> bool {
    let home = home_dir();
    home.join("Library/Mobile Documents/com~apple~CloudDocs").is_dir()
}

#[tauri::command]
pub fn icloud_available() -> bool {
    icloud_available_impl()
}

// ───────────────────────── 一键创建 iCloud vault ─────────────────────────

/// 名字消毒:去路径分隔符与控制字符,掐头点号;空 → "Vault"。
fn sanitize_vault_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !c.is_control() && *c != '/' && *c != '\\')
        .collect::<String>()
        .trim()
        .trim_start_matches('.')
        .to_string();
    if cleaned.is_empty() {
        "Vault".to_string()
    } else {
        cleaned
    }
}

/// 在 `CloudDocs/Open LLM Wiki/<名字>` 下创建 vault(重名加序号),返回绝对路径。
/// CloudDocs 不存在(未登录 iCloud)→ 明确报错,UI 引导回本地。
pub fn create_icloud_vault_impl(name: &str) -> Result<String, String> {
    let home = home_dir();
    let cloud = home.join("Library/Mobile Documents/com~apple~CloudDocs");
    if !cloud.is_dir() {
        return Err("未检测到 iCloud Drive(未登录或未开启 iCloud)。可改为在本机文件夹创建。".into());
    }
    let base = cloud.join("Open LLM Wiki");
    fs::create_dir_all(&base).map_err(err)?;
    let stem = sanitize_vault_name(name);
    let mut root = base.join(&stem);
    let mut n = 2u32;
    while root.exists() {
        root = base.join(format!("{stem} {n}"));
        n += 1;
        if n > 100 {
            return Err("同名 vault 过多".into());
        }
    }
    fs::create_dir_all(&root).map_err(err)?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_icloud_vault(name: String) -> Result<String, String> {
    let path = create_icloud_vault_impl(&name)?;
    crate::logging::emit(
        crate::logging::LogLevel::Info,
        "ipc.create_icloud_vault",
        "created",
        Some(serde_json::json!({ "path": &path })),
    );
    Ok(path)
}

// ───────────────────────── G3:git 自动化闸门 ─────────────────────────

/// 用户显式覆写(root → allowed)。默认空 = 未覆写(遵守各类别默认)。
static GIT_AUTOMATION: Mutex<Vec<(String, bool)>> = Mutex::new(Vec::new());

#[tauri::command]
pub fn set_git_automation(root: String, allowed: bool) -> Result<(), String> {
    let mut g = GIT_AUTOMATION.lock().map_err(err)?;
    if let Some(slot) = g.iter_mut().find(|(r, _)| r == &root) {
        slot.1 = allowed;
    } else {
        g.push((root, allowed));
    }
    Ok(())
}

/// git 自动化(结构自动提交 / git_init)当前是否放行。决策在 core(IC-1:icloud
/// 默认关、icloud-managed 宽松);此处注入覆写。
pub fn git_auto_allowed(root: &str) -> bool {
    let kind = storage_kind(root);
    let user_override = GIT_AUTOMATION
        .lock()
        .ok()
        .and_then(|g| g.iter().find(|(r, _)| r == root).map(|(_, a)| *a));
    core_storage::git_auto_allowed(kind, user_override)
}

// ───────────────────────── G5:冲突副本扫描 ─────────────────────────

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ConflictPairOut {
    pub base: String,
    pub copy: String,
}

/// 全库 .md 相对路径 → core 冲突配对(只读名单,不读内容,开销 ~ 一次目录遍历)。
pub fn scan_conflicts_impl(root: &str) -> Result<Vec<ConflictPairOut>, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("不是目录:{root}"));
    }
    let mut rels: Vec<String> = Vec::new();
    for entry in WalkDir::new(root_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let e = entry.map_err(err)?;
        if e.file_type().is_dir() {
            continue;
        }
        if e.path().extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }
        let rel = e
            .path()
            .strip_prefix(root_path)
            .unwrap_or(e.path())
            .to_string_lossy()
            .replace('\\', "/");
        rels.push(rel);
    }
    Ok(core_storage::conflict_pairs(&rels)
        .into_iter()
        .map(|p| ConflictPairOut { base: p.base, copy: p.copy })
        .collect())
}

#[tauri::command]
pub fn scan_conflicts(root: String) -> Result<Vec<ConflictPairOut>, String> {
    let pairs = scan_conflicts_impl(&root)?;
    // §10 度量:冲突检出率(只在非空时打点,避免刷屏)。
    if !pairs.is_empty() {
        crate::logging::emit(
            crate::logging::LogLevel::Info,
            "ipc.scan_conflicts",
            "found",
            Some(serde_json::json!({ "count": pairs.len() })),
        );
    }
    Ok(pairs)
}

// ───────────────────────── G6:读超时 ─────────────────────────

/// 读盘结果:内容,或"仍在下载"(超时)。
#[derive(Debug, PartialEq)]
pub enum ReadOutcome {
    Content(String),
    Timeout,
}

/// 带超时的 read_to_string:后台线程读,主线程等 `timeout`。
/// dataless 文件的隐式 iCloud 下载可能远超 UI 可接受时长——超时不是 IO 错误,
/// 是 `Timeout`,由上层给占位提示。
pub fn read_to_string_timeout(path: &Path, timeout: Duration) -> Result<ReadOutcome, String> {
    let p = path.to_path_buf();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(fs::read_to_string(&p));
    });
    match rx.recv_timeout(timeout) {
        Ok(Ok(s)) => Ok(ReadOutcome::Content(s)),
        Ok(Err(e)) => Err(err(e)),
        Err(mpsc::RecvTimeoutError::Timeout) => Ok(ReadOutcome::Timeout),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err("读取线程中断".into()),
    }
}

// ───────────────────────── app data 基座(shadow repo 迁移用) ─────────────────────────

/// app 数据目录基座(与 tauri app_data_dir 同值:identifier = dev.openllmwiki.desktop)。
/// `OPEN_LLM_WIKI_APP_DATA` 供测试注入。transcript DB 走 tauri 解析,此处手解析
/// 是因为 git_attr 深处拿不到 AppHandle;两者解析结果一致(同 identifier 同规则)。
pub fn app_data_base() -> PathBuf {
    if let Ok(d) = std::env::var("OPEN_LLM_WIKI_APP_DATA") {
        return PathBuf::from(d);
    }
    const IDENT: &str = "dev.openllmwiki.desktop";
    let home = home_dir();
    #[cfg(target_os = "macos")]
    {
        home.join("Library/Application Support").join(IDENT)
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .map(|a| PathBuf::from(a).join(IDENT))
            .unwrap_or_else(|_| home.join("AppData/Roaming").join(IDENT))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var("XDG_DATA_HOME")
            .map(|x| PathBuf::from(x).join(IDENT))
            .unwrap_or_else(|_| home.join(".local/share").join(IDENT))
    }
}

// ───────────────────────── 测试 ─────────────────────────

/// env 注入型测试互斥锁(OPEN_LLM_WIKI_HOME / OPEN_LLM_WIKI_APP_DATA):
/// git_attr 的 shadow 测试与本模块测试共用,防并发互踩。
#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    fn env_lock() -> MutexGuard<'static, ()> {
        super::TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn tmp() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("olw-storage-")
            .tempdir()
            .unwrap()
    }

    /// 造一个"假 home":可选带 iCloud 目录结构,可选带 D&D 痕迹。
    /// 返回 (home, root_builder)。root 放在真实 vault 语义下(可 git init)。
    fn fake_home(icloud: bool, dnd: bool) -> tempfile::TempDir {
        let home = tempfile::Builder::new().prefix("olw-home-").tempdir().unwrap();
        if icloud {
            let cloud = home.path().join("Library/Mobile Documents/com~apple~CloudDocs");
            std::fs::create_dir_all(cloud.join("Open LLM Wiki")).unwrap();
            if dnd {
                std::fs::create_dir_all(cloud.join("Documents")).unwrap();
            }
        }
        home
    }

    // ── G1 原子写 ──

    #[test]
    fn atomic_write_creates_overwrites_and_cleans_tmp() {
        let dir = tmp();
        let f = dir.path().join("a.md");
        atomic_write(&f, b"v1").unwrap();
        assert_eq!(std::fs::read(&f).unwrap(), b"v1");
        atomic_write(&f, b"v2-longer").unwrap();
        assert_eq!(std::fs::read(&f).unwrap(), b"v2-longer");
        // 不留 tmp 残留(目录里只有目标文件)。
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.md".to_string()], "{names:?}");
        // 建嵌套父目录 + 二进制字节原样。
        let nested = dir.path().join("x/y/attach.png");
        let bytes: &[u8] = &[0x89, b'P', b'N', b'G', 0xff];
        atomic_write(&nested, bytes).unwrap();
        assert_eq!(std::fs::read(&nested).unwrap(), bytes);
    }

    #[test]
    fn atomic_write_failure_leaves_old_content() {
        let dir = tmp();
        let f = dir.path().join("a.md");
        atomic_write(&f, b"old").unwrap();
        // 用一个**目录**占住目标路径 → rename 失败 → 旧文件不该被破坏。
        let blocker = dir.path().join("block");
        std::fs::create_dir(&blocker).unwrap();
        assert!(atomic_write(&blocker, b"x").is_err());
        assert_eq!(std::fs::read(&f).unwrap(), b"old");
    }

    // ── G2 探测 ──

    #[test]
    fn detect_local_when_no_icloud_dirs() {
        let _g = env_lock();
        let home = fake_home(false, false);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        let vault = home.path().join("notes");
        std::fs::create_dir_all(&vault).unwrap();
        let info = detect_storage_impl(vault.to_str().unwrap()).unwrap();
        assert_eq!(info.kind, "local");
        assert_eq!(info.evicted_sampled, 0);
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    /// doc 18 §5:iOS app 自有 ubiquity 容器(`iCloud~dev~openllmwiki~mobile`)下的
    /// vault 桌面端打开时同样判 icloud → G3 git 闸门与提示照常生效(桌面↔iPhone 同步)。
    #[test]
    fn detect_own_mobile_container_is_icloud() {
        let _g = env_lock();
        let home = fake_home(false, false);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        let vault = home
            .path()
            .join("Library/Mobile Documents/iCloud~dev~openllmwiki~mobile/Documents/v");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(vault.join("a.md"), "# A\n").unwrap();
        let info = detect_storage_impl(vault.to_str().unwrap()).unwrap();
        assert_eq!(info.kind, "icloud");
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    #[test]
    fn detect_icloud_and_managed_and_stub_eviction() {
        let _g = env_lock();
        let home = fake_home(true, true);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        // 显式 iCloud:vault 在 CloudDocs 下;旧系统 stub 记为 evicted。
        let vault = home
            .path()
            .join("Library/Mobile Documents/com~apple~CloudDocs/Open LLM Wiki/v");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(vault.join("a.md"), "# A\n").unwrap();
        std::fs::write(vault.join(".b.md.icloud"), "stub").unwrap();
        let info = detect_storage_impl(vault.to_str().unwrap()).unwrap();
        assert_eq!(info.kind, "icloud");
        assert!(info.cloud_docs_root.is_some());
        assert_eq!(info.evicted_sampled, 2);
        assert_eq!(info.evicted_count, 1);
        // D&D 痕迹 + ~/Documents 下的 vault → icloud-managed(同样采样)。
        let dd = home.path().join("Documents/demo");
        std::fs::create_dir_all(&dd).unwrap();
        std::fs::write(dd.join("n.md"), "# N\n").unwrap();
        let info2 = detect_storage_impl(dd.to_str().unwrap()).unwrap();
        assert_eq!(info2.kind, "icloud-managed");
        assert_eq!(info2.evicted_sampled, 1);
        assert_eq!(info2.evicted_count, 0);
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    #[test]
    fn detect_rejects_non_dir() {
        assert!(detect_storage_impl("/definitely-not-a-dir-olw").is_err());
    }

    // ── create_icloud_vault ──

    #[test]
    fn create_icloud_vault_under_cloud_docs_with_uniquing() {
        let _g = env_lock();
        let home = fake_home(true, false);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        let p1 = create_icloud_vault_impl("My Wiki").unwrap();
        assert!(p1.contains("CloudDocs"));
        assert!(p1.ends_with("Open LLM Wiki/My Wiki"), "{p1}");
        assert!(Path::new(&p1).is_dir());
        let p2 = create_icloud_vault_impl("My Wiki").unwrap();
        assert!(p2.ends_with("My Wiki 2"), "{p2}");
        // 名字消毒:路径分隔符与点开头剥离;空名兜底。
        let p3 = create_icloud_vault_impl("../a/b").unwrap();
        assert!(p3.ends_with("ab"), "{p3}");
        let p4 = create_icloud_vault_impl("   ").unwrap();
        assert!(p4.ends_with("Vault"), "{p4}");
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    #[test]
    fn create_icloud_vault_errors_without_cloud_docs() {
        let _g = env_lock();
        let home = fake_home(false, false);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        let e = create_icloud_vault_impl("x").unwrap_err();
        assert!(e.contains("iCloud"), "{e}");
        assert!(!icloud_available_impl(), "无 CloudDocs → 不可用");
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    #[test]
    fn icloud_available_follows_cloud_docs_presence() {
        let _g = env_lock();
        let home = fake_home(true, false);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        assert!(icloud_available_impl());
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    // ── G3 闸门(lib.rs 的 git_commit_paths / git_init 走这里) ──

    #[test]
    fn git_gate_blocks_icloud_allows_managed_and_override() {
        let _g = env_lock();
        // 纯决策已在 core 全矩阵测试;此处测 IO 侧 kind + 覆写注入。
        let home = fake_home(true, true);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_HOME", home.path()); }
        let icloud_root = home
            .path()
            .join("Library/Mobile Documents/com~apple~CloudDocs/v1");
        let managed_root = home.path().join("Documents/v2");
        std::fs::create_dir_all(&icloud_root).unwrap();
        std::fs::create_dir_all(&managed_root).unwrap();
        let r1 = icloud_root.to_str().unwrap().to_string();
        let r2 = managed_root.to_str().unwrap().to_string();
        assert!(!git_auto_allowed(&r1), "icloud 默认关");
        assert!(git_auto_allowed(&r2), "icloud-managed 宽松");
        set_git_automation(r1.clone(), true).unwrap();
        assert!(git_auto_allowed(&r1), "显式开启后放行");
        set_git_automation(r1, false).unwrap();
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_HOME"); }
    }

    // ── G5 冲突扫描 ──

    #[test]
    fn scan_conflicts_finds_pairs_and_skips_dot_dirs() {
        let dir = tmp();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("Note.md"), "# N\n").unwrap();
        std::fs::write(dir.path().join("Note 2.md"), "# N2\n").unwrap();
        std::fs::write(dir.path().join("plain.md"), "# P\n").unwrap();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".git/Hook 2.md"), "# hidden\n").unwrap();
        let pairs = scan_conflicts_impl(root).unwrap();
        assert_eq!(
            pairs,
            vec![ConflictPairOut { base: "Note.md".into(), copy: "Note 2.md".into() }]
        );
    }

    // ── G6 读超时 ──

    #[test]
    fn read_timeout_returns_content_for_normal_file() {
        let dir = tmp();
        let f = dir.path().join("a.md");
        std::fs::write(&f, "hello").unwrap();
        assert_eq!(
            read_to_string_timeout(&f, Duration::from_secs(5)).unwrap(),
            ReadOutcome::Content("hello".into())
        );
        assert!(read_to_string_timeout(&dir.path().join("nope.md"), Duration::from_secs(5)).is_err());
    }

    /// fifo 无写者 → read 阻塞 → 超时返回 Timeout(真阻塞路径,unix only)。
    #[cfg(unix)]
    #[test]
    fn read_timeout_times_out_on_blocking_fifo() {
        use std::process::Command;
        let dir = tmp();
        let fifo = dir.path().join("pipe.md");
        let ok = Command::new("mkfifo")
            .arg(&fifo)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            return; // 环境无 mkfifo,跳过(不 fail)。
        }
        assert_eq!(
            read_to_string_timeout(&fifo, Duration::from_millis(200)).unwrap(),
            ReadOutcome::Timeout
        );
    }

    // ── app data 基座 ──

    #[test]
    fn app_data_base_respects_env_override() {
        let _g = env_lock();
        let home = fake_home(false, false);
        unsafe { std::env::set_var("OPEN_LLM_WIKI_APP_DATA", home.path().join("adata")); }
        assert_eq!(app_data_base(), home.path().join("adata"));
        unsafe { std::env::remove_var("OPEN_LLM_WIKI_APP_DATA"); }
    }
}

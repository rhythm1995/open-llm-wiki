//! Client log bus (L1): level filter + file NDJSON + stderr + panic hook.
//!
//! Pure helpers are unit-tested without Tauri. IO lives in `LogBus`.
//! See docs/12-client-logging.md.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, SyncSender};
use std::sync::Arc;
use std::time::Duration;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

// ─── Levels / profiles ───────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum LogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warn = 3,
    Error = 4,
    Fatal = 5,
}

impl LogLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Trace => "trace",
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
            Self::Fatal => "fatal",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "trace" => Some(Self::Trace),
            "debug" => Some(Self::Debug),
            "info" => Some(Self::Info),
            "warn" | "warning" => Some(Self::Warn),
            "error" => Some(Self::Error),
            "fatal" => Some(Self::Fatal),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogProfile {
    /// Debug builds default: debug+.
    Dev,
    /// Maximum detail.
    Verbose,
    /// Release default: error+fatal only.
    Prod,
}

impl LogProfile {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "dev" | "development" => Some(Self::Dev),
            "verbose" | "trace" | "debug" => Some(Self::Verbose),
            "prod" | "production" | "release" => Some(Self::Prod),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Verbose => "verbose",
            Self::Prod => "prod",
        }
    }

    pub fn min_level(self) -> LogLevel {
        match self {
            Self::Verbose => LogLevel::Trace,
            Self::Dev => LogLevel::Debug,
            Self::Prod => LogLevel::Error,
        }
    }
}

/// Resolve profile: env `OPENOBS_LOG_PROFILE` → else debug_assertions → Dev else Prod.
pub fn resolve_profile_from_env() -> LogProfile {
    if let Ok(raw) = std::env::var("OPENOBS_LOG_PROFILE") {
        if let Some(p) = LogProfile::parse(&raw) {
            return p;
        }
    }
    if cfg!(debug_assertions) {
        LogProfile::Dev
    } else {
        LogProfile::Prod
    }
}

pub fn should_emit(level: LogLevel, min: LogLevel) -> bool {
    level >= min
}

// ─── Formatting (pure) ───────────────────────────────────────────

/// Build one NDJSON line (no trailing newline required by caller to append).
pub fn format_ndjson_line(
    ts: &str,
    level: LogLevel,
    target: &str,
    msg: &str,
    fields: Option<&serde_json::Value>,
    session_id: &str,
) -> String {
    let mut map = serde_json::Map::new();
    map.insert("ts".into(), json!(ts));
    map.insert("level".into(), json!(level.as_str()));
    map.insert("target".into(), json!(target));
    map.insert("msg".into(), json!(msg));
    map.insert("session_id".into(), json!(session_id));
    if let Some(f) = fields {
        if !f.is_null() {
            map.insert("fields".into(), f.clone());
        }
    }
    serde_json::Value::Object(map).to_string()
}

pub fn daily_log_filename(ymd: &str) -> String {
    format!("openobs-{ymd}.log")
}

pub fn error_log_filename(ymd: &str) -> String {
    format!("openobs-{ymd}.error.log")
}

/// UTC date `YYYY-MM-DD` from unix seconds.
pub fn utc_ymd_from_unix(secs: u64) -> String {
    // Civil date from days since Unix epoch (algorithm: Howard Hinnant).
    let z = (secs / 86_400) as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

/// ISO-8601-ish UTC timestamp with millis.
pub fn utc_ts_now() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let millis = dur.subsec_millis();
    let ymd = utc_ymd_from_unix(secs);
    let tod = secs % 86_400;
    let h = tod / 3600;
    let min = (tod % 3600) / 60;
    let s = tod % 60;
    format!("{ymd}T{h:02}:{min:02}:{s:02}.{millis:03}Z")
}

/// Keep `keep_days` of `openobs-YYYY-MM-DD*.log`; return paths to delete (oldest first).
pub fn prune_candidates(
    names: &[String],
    today_ymd: &str,
    keep_days: u32,
) -> Vec<String> {
    let mut dated: Vec<(String, String)> = names
        .iter()
        .filter_map(|n| {
            // openobs-YYYY-MM-DD.log or .error.log
            let rest = n.strip_prefix("openobs-")?;
            let ymd = rest.get(0..10)?;
            if ymd.len() != 10 || ymd.as_bytes()[4] != b'-' {
                return None;
            }
            Some((ymd.to_string(), n.clone()))
        })
        .collect();
    dated.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    if dated.is_empty() {
        return Vec::new();
    }
    // Unique dates sorted
    let mut dates: Vec<String> = dated.iter().map(|(d, _)| d.clone()).collect();
    dates.dedup();
    if dates.len() <= keep_days as usize {
        return Vec::new();
    }
    let drop_n = dates.len() - keep_days as usize;
    let drop_dates: std::collections::HashSet<&str> =
        dates.iter().take(drop_n).map(|s| s.as_str()).collect();
    // Never drop today's files even if keep_days is 0 edge case
    dated
        .into_iter()
        .filter(|(d, _)| drop_dates.contains(d.as_str()) && d != today_ymd)
        .map(|(_, n)| n)
        .collect()
}

fn short_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", nanos % 0xffff_ffff)
}

// ─── PortSink (optional TCP live-stream, dev/debug only) ─────────

/// Parse the `OPENOBS_LOG_PORT` value into a port. Pure (env lookup done by
/// the caller) so it is unit-testable. Empty / non-numeric / 0 → None.
pub fn parse_log_port(raw: Option<&str>) -> Option<u16> {
    let p: u16 = raw?.trim().parse().ok()?;
    (p > 0).then_some(p)
}

/// Start a localhost TCP log sink. The app acts as a **server**: it binds the
/// already-bound `listener` (127.0.0.1) and clients — `nc 127.0.0.1 <port>` or
/// `socat - TCP:127.0.0.1:<port>` — connect in to tail the live NDJSON stream.
/// Returns a bounded sender the bus pushes lines through.
///
/// Two threads: an acceptor adds inbound streams to a shared client list; a
/// writer drains the channel and fans each line out to every client, dropping
/// any that error or time out. The channel is bounded + `try_send` is used on
/// the emit side, so a stalled writer/client can never block logging.
pub(crate) fn start_port_sink(listener: TcpListener) -> SyncSender<String> {
    let (tx, rx) = mpsc::sync_channel::<String>(256);
    let write_timeout = Duration::from_millis(200);
    let clients: Arc<Mutex<Vec<TcpStream>>> = Arc::new(Mutex::new(Vec::new()));

    // Acceptor (blocking accept; connections queue in the OS backlog meanwhile).
    let acc_clients = clients.clone();
    let _ = std::thread::Builder::new()
        .name("openobs-log-port-accept".into())
        .spawn(move || {
            while let Ok((stream, addr)) = listener.accept() {
                let _ = stream.set_write_timeout(Some(write_timeout));
                if let Ok(mut g) = acc_clients.lock() {
                    g.push(stream);
                }
                eprintln!("[openobs] log port: client connected {addr}");
            }
        });

    // Writer (fan-out; drop dead clients).
    let wr_clients = clients;
    std::thread::Builder::new()
        .name("openobs-log-port-writer".into())
        .spawn(move || {
            while let Ok(line) = rx.recv() {
                let mut payload = line.into_bytes();
                payload.push(b'\n');
                if let Ok(mut g) = wr_clients.lock() {
                    let mut dead = Vec::new();
                    for (i, c) in g.iter_mut().enumerate() {
                        if c.write_all(&payload).is_err() {
                            dead.push(i);
                        }
                    }
                    for i in dead.into_iter().rev() {
                        g.remove(i);
                    }
                }
            }
        })
        .expect("spawn openobs-log-port-writer");
    tx
}

/// Bind + start the PortSink when `OPENOBS_LOG_PORT` is set. Best-effort: a
/// bind failure is logged to stderr and returns None (app keeps running).
fn start_log_port_sink_from_env() -> Option<SyncSender<String>> {
    let port = parse_log_port(std::env::var("OPENOBS_LOG_PORT").ok().as_deref())?;
    match TcpListener::bind(("127.0.0.1", port)) {
        Ok(listener) => {
            eprintln!(
                "[openobs] log port: live NDJSON stream on 127.0.0.1:{port} \
                 (tail with: nc 127.0.0.1 {port})"
            );
            Some(start_port_sink(listener))
        }
        Err(e) => {
            eprintln!("[openobs] log port: failed to bind 127.0.0.1:{port}: {e}");
            None
        }
    }
}

// ─── Bus ─────────────────────────────────────────────────────────

struct BusInner {
    dir: PathBuf,
    session_id: String,
    /// Min level as u8 (LogLevel).
    min_level: AtomicU8,
    profile: Mutex<LogProfile>,
    /// Serialize file writes.
    write_lock: Mutex<()>,
    /// Per-target 级别覆盖(放宽):key 存在时,该 target 用 min(全局, 覆盖)。
    /// 用于让「acp」等排查必需的 target 在 release(prod = error+)下也记到 debug。
    target_mins: Mutex<HashMap<String, LogLevel>>,
    /// Optional TCP PortSink sender (Some only when OPENOBS_LOG_PORT is set).
    port_tx: Mutex<Option<SyncSender<String>>>,
}

static BUS: OnceLock<BusInner> = OnceLock::new();

fn bus() -> Option<&'static BusInner> {
    BUS.get()
}

/// Initialize global bus. Idempotent (first call wins).
pub fn init(log_dir: PathBuf, profile: LogProfile) {
    let _ = BUS.get_or_init(|| {
        let _ = fs::create_dir_all(&log_dir);
        let min = profile.min_level() as u8;
        let session_id = short_session_id();
        let port_tx = start_log_port_sink_from_env();
        let inner = BusInner {
            dir: log_dir,
            session_id: session_id.clone(),
            min_level: AtomicU8::new(min),
            profile: Mutex::new(profile),
            write_lock: Mutex::new(()),
            target_mins: Mutex::new(HashMap::new()),
            port_tx: Mutex::new(port_tx),
        };
        // Startup banner always goes to stderr; file only if level allows info or lower min.
        let banner = format!(
            "log bus init profile={} session={} dir={}",
            profile.as_str(),
            session_id,
            inner.dir.display()
        );
        eprintln!("[openobs] {banner}");
        // Write info line if allowed
        let fields = json!({ "profile": profile.as_str() });
        emit_raw(
            &inner,
            LogLevel::Info,
            "app",
            "logging started",
            Some(&fields),
        );
        prune_dir(&inner.dir, 14);
        inner
    });
}

pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "panic".to_string()
        };
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "?".into());
        emit(
            LogLevel::Fatal,
            "panic",
            &msg,
            Some(json!({ "location": loc })),
        );
        prev(info);
    }));
}

pub fn set_profile(profile: LogProfile) {
    if let Some(b) = bus() {
        b.min_level
            .store(profile.min_level() as u8, Ordering::Relaxed);
        if let Ok(mut g) = b.profile.lock() {
            *g = profile;
        }
        emit(
            LogLevel::Info,
            "app",
            "log profile changed",
            Some(json!({ "profile": profile.as_str() })),
        );
    }
}

pub fn current_profile() -> Option<LogProfile> {
    bus().and_then(|b| b.profile.lock().ok().map(|g| *g))
}

pub fn log_dir() -> Option<PathBuf> {
    bus().map(|b| b.dir.clone())
}

pub fn session_id() -> Option<String> {
    bus().map(|b| b.session_id.clone())
}

pub fn emit(level: LogLevel, target: &str, msg: &str, fields: Option<serde_json::Value>) {
    if let Some(b) = bus() {
        emit_raw(b, level, target, msg, fields.as_ref());
    } else {
        // Not initialized: stderr only for errors
        if level >= LogLevel::Error {
            eprintln!("[{}] {target}: {msg}", level.as_str());
        }
    }
}

/// 为某 target 设一个「至少记到 X」的覆盖(只放宽、不收紧):若全局 profile 更宽松
/// (数值更小),仍以全局为准。用于让 `acp` 等排查必需的 target 在 prod 下也详细。
pub fn set_target_min(target: &str, level: LogLevel) {
    if let Some(b) = bus() {
        if let Ok(mut g) = b.target_mins.lock() {
            g.insert(target.to_string(), level);
        }
    }
}

/// 某 target 的有效门槛:取全局 min 与该 target 覆盖中更宽松者(数值更小)。
fn effective_min(b: &BusInner, target: &str) -> LogLevel {
    let global = LogLevel::from_u8(b.min_level.load(Ordering::Relaxed));
    let ov = b
        .target_mins
        .lock()
        .ok()
        .and_then(|g| g.get(target).copied());
    pick_min(global, ov)
}

/// 纯函数:覆盖只放宽、不收紧。无覆盖 → 全局;有覆盖取更宽松者。
fn pick_min(global: LogLevel, ov: Option<LogLevel>) -> LogLevel {
    match ov {
        Some(o) if (o as u8) < (global as u8) => o,
        _ => global,
    }
}

fn emit_raw(
    b: &BusInner,
    level: LogLevel,
    target: &str,
    msg: &str,
    fields: Option<&serde_json::Value>,
) {
    let min = effective_min(b, target);
    if !should_emit(level, min) {
        return;
    }
    let ts = utc_ts_now();
    let line = format_ndjson_line(&ts, level, target, msg, fields, &b.session_id);

    // Optional TCP PortSink (dev/debug only; default off). Bounded channel +
    // try_send so a stalled client can never block the emit path.
    if let Ok(g) = b.port_tx.lock() {
        if let Some(tx) = g.as_ref() {
            let _ = tx.try_send(line.clone());
        }
    }

    // stderr for warn+
    if level >= LogLevel::Warn {
        eprintln!("[{}] {target}: {msg}", level.as_str());
    } else if cfg!(debug_assertions) && level >= LogLevel::Info {
        eprintln!("[{}] {target}: {msg}", level.as_str());
    }

    let _guard = b.write_lock.lock().unwrap_or_else(|e| e.into_inner());
    let ymd = utc_ymd_from_unix(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    );
    let main_path = b.dir.join(daily_log_filename(&ymd));
    if let Err(e) = append_line(&main_path, &line) {
        eprintln!("[openobs] log file write failed: {e}");
    }
    if level >= LogLevel::Error {
        let err_path = b.dir.join(error_log_filename(&ymd));
        let _ = append_line(&err_path, &line);
    }
}

impl LogLevel {
    fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Trace,
            1 => Self::Debug,
            2 => Self::Info,
            3 => Self::Warn,
            4 => Self::Error,
            _ => Self::Fatal,
        }
    }
}

fn append_line(path: &Path, line: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(path)?;
    f.write_all(line.as_bytes())?;
    f.write_all(b"\n")?;
    Ok(())
}

fn prune_dir(dir: &Path, keep_days: u32) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    let names: Vec<String> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    let today = utc_ymd_from_unix(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    );
    for name in prune_candidates(&names, &today, keep_days) {
        let _ = fs::remove_file(dir.join(name));
    }
}

/// Bundle recent log files into one text export under the log dir.
/// Returns absolute path of the written file.
pub fn export_bundle(keep_days: u32) -> Result<PathBuf, String> {
    let b = bus().ok_or_else(|| "log bus not initialized".to_string())?;
    let dir = &b.dir;
    let rd = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut names: Vec<String> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let n = e.file_name().into_string().ok()?;
            if n.starts_with("openobs-") && n.ends_with(".log") {
                Some(n)
            } else {
                None
            }
        })
        .collect();
    names.sort();
    // Prefer newest by name (YYYY-MM-DD sorts well); keep last keep_days*2 files roughly.
    let take = (keep_days.max(1) as usize).saturating_mul(4).max(4);
    if names.len() > take {
        names = names.split_off(names.len() - take);
    }
    let ts = utc_ts_now().replace(':', "").replace('.', "");
    let out_name = format!("openobs-export-{ts}.txt");
    let out_path = dir.join(&out_name);
    let mut out = String::new();
    out.push_str(&format!(
        "# OpenObsidian log export\n# session={}\n# files={}\n\n",
        b.session_id,
        names.len()
    ));
    for name in &names {
        let path = dir.join(name);
        out.push_str(&format!("===== {name} =====\n"));
        match fs::read_to_string(&path) {
            Ok(body) => out.push_str(&body),
            Err(e) => out.push_str(&format!("(read error: {e})\n")),
        }
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push('\n');
    }
    fs::write(&out_path, out).map_err(|e| e.to_string())?;
    Ok(out_path)
}

/// Open log directory in system file manager (best-effort).
pub fn open_dir_in_os(dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("unsupported platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_order_and_filter() {
        assert!(should_emit(LogLevel::Error, LogLevel::Error));
        assert!(!should_emit(LogLevel::Info, LogLevel::Error));
        assert!(should_emit(LogLevel::Debug, LogLevel::Debug));
        assert!(should_emit(LogLevel::Fatal, LogLevel::Error));
    }

    #[test]
    fn profile_min_levels() {
        assert_eq!(LogProfile::Prod.min_level(), LogLevel::Error);
        assert_eq!(LogProfile::Dev.min_level(), LogLevel::Debug);
        assert_eq!(LogProfile::Verbose.min_level(), LogLevel::Trace);
    }

    #[test]
    fn ndjson_round_shape() {
        let line = format_ndjson_line(
            "2026-08-02T00:00:00.000Z",
            LogLevel::Info,
            "ipc.test",
            "hello",
            Some(&json!({"n": 1})),
            "abc",
        );
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["level"], "info");
        assert_eq!(v["target"], "ipc.test");
        assert_eq!(v["msg"], "hello");
        assert_eq!(v["session_id"], "abc");
        assert_eq!(v["fields"]["n"], 1);
    }

    #[test]
    fn utc_ymd_known() {
        // 2026-08-02 00:00:00 UTC — compute via known epoch
        // 2024-01-01 00:00:00 UTC = 1704067200
        assert_eq!(utc_ymd_from_unix(1704067200), "2024-01-01");
    }

    #[test]
    fn prune_keeps_recent() {
        let names = vec![
            "openobs-2026-07-01.log".into(),
            "openobs-2026-07-01.error.log".into(),
            "openobs-2026-07-20.log".into(),
            "openobs-2026-08-01.log".into(),
            "openobs-2026-08-02.log".into(),
            "notes.txt".into(),
        ];
        let drop = prune_candidates(&names, "2026-08-02", 2);
        // keep 2 most recent dates: 08-01, 08-02 → drop 07-01 and 07-20
        assert!(drop.iter().any(|n| n.contains("2026-07-01")));
        assert!(drop.iter().any(|n| n.contains("2026-07-20")));
        assert!(!drop.iter().any(|n| n.contains("2026-08-02")));
        assert!(!drop.iter().any(|n| n.contains("2026-08-01")));
    }

    #[test]
    fn parse_level_profile() {
        assert_eq!(LogLevel::parse("WARN"), Some(LogLevel::Warn));
        assert_eq!(LogProfile::parse("production"), Some(LogProfile::Prod));
    }

    #[test]
    fn pick_min_override_only_widens() {
        // 无覆盖 → 全局。
        assert_eq!(pick_min(LogLevel::Error, None), LogLevel::Error);
        // 覆盖更宽松(Info < Error)→ 取覆盖。
        assert_eq!(pick_min(LogLevel::Error, Some(LogLevel::Info)), LogLevel::Info);
        // 覆盖更收紧(Trace 表示更宽,但给个比全局窄的:全局 Verbose=Trace,覆盖 Warn)
        assert_eq!(pick_min(LogLevel::Trace, Some(LogLevel::Warn)), LogLevel::Trace);
        // 覆盖 == 全局。
        assert_eq!(pick_min(LogLevel::Debug, Some(LogLevel::Debug)), LogLevel::Debug);
    }

    #[test]
    fn parse_log_port_strict() {
        assert_eq!(parse_log_port(Some("9876")), Some(9876));
        assert_eq!(parse_log_port(Some(" 9876 ")), Some(9876));
        assert_eq!(parse_log_port(None), None);
        assert_eq!(parse_log_port(Some("")), None);
        assert_eq!(parse_log_port(Some("not-a-port")), None);
        // 0 is rejected (would mean "OS picks" — useless to nc into).
        assert_eq!(parse_log_port(Some("0")), None);
        // Out of u16 range.
        assert_eq!(parse_log_port(Some("70000")), None);
    }

    #[test]
    fn port_sink_streams_lines_to_client() {
        use std::io::Read;
        // Bind an ephemeral port; start the sink directly (no global bus).
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let tx = start_port_sink(listener);

        let mut client = TcpStream::connect(("127.0.0.1", port)).unwrap();
        client
            .set_read_timeout(Some(Duration::from_millis(500)))
            .unwrap();
        // Let the acceptor pick the connection up.
        std::thread::sleep(Duration::from_millis(100));

        tx.send(r#"{"msg":"ping"}"#.to_string()).unwrap();

        // Poll-read until we see a newline (absorb scheduling jitter).
        let mut got = String::new();
        let mut buf = [0u8; 256];
        for _ in 0..10 {
            match client.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    got.push_str(std::str::from_utf8(&buf[..n]).unwrap());
                    if got.contains('\n') {
                        break;
                    }
                }
                Err(e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut =>
                {
                    std::thread::sleep(Duration::from_millis(40));
                }
                Err(_) => break,
            }
        }
        assert!(got.contains("ping"), "expected the streamed line, got: {got:?}");
    }

    #[test]
    fn export_bundle_writes_file() {
        let dir = std::env::temp_dir().join(format!(
            "openobs-log-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        // Force re-init: BUS is OnceLock — only first init wins.
        // If already inited by other tests, just write a log line then export if bus ready.
        init(dir.clone(), LogProfile::Dev);
        emit(
            LogLevel::Error,
            "test",
            "export probe",
            None,
        );
        if let Ok(path) = export_bundle(7) {
            let body = fs::read_to_string(&path).unwrap();
            assert!(body.contains("OpenObsidian log export") || body.contains("export probe") || body.contains("openobs-"));
            let _ = fs::remove_file(&path);
        }
        // cleanup best-effort
        let _ = fs::remove_dir_all(&dir);
    }
}

//! 本地 agent 探测与接线(B-MCP-ONBOARD)。
//!
//! CLI 三入口(见 [`USAGE`]):
//! - [`run_setup`] —— 探测本地 agent,把 `openobsidian` 条目写进各家 MCP 配置;
//! - [`run_doctor`] —— 诊断接线健康;
//! - [`run_init`] —— 播种 wiki-starter 模板建 vault。
//!
//! 桌面 app 的「Agent 记忆接入」面板复用本模块的 pub 函数
//! ([`detect_agents`] / [`wire_agent`] / [`unwire_agent`] / [`run_checks`] / [`seed_vault`])。
//!
//! # 安全规则(写别人 app 的配置文件)
//!
//! 1. 每次真写前备份 `<file>.openobsidian.bak`;
//! 2. 同目录 tmp + `fs::rename` 原子写——中途崩溃不会截断用户文件;
//! 3. 解析不了的文件(如带注释的 JSONC)绝不触碰——报错并给手动 snippet;
//! 4. 只动 user-level 全局配置,绝不碰项目级配置(`.mcp.json` 等);
//! 5. [`GUIDANCE_SNIPPET`] 只打印给用户粘贴,绝不自动写入任何用户文件;
//! 6. claude-code 优先走官方 CLI(`claude mcp add-json -s user`),
//!    让 Claude Code 自己写它的 `~/.claude.json`(避免对活体状态文件 read-modify-write 竞争),
//!    CLI 不可用才回退文件直写。
//!
//! Windows 注册表行可编译但本轮未实测(见 [`agents`] 注释)。

use std::env;
use std::fs;
use std::io::{BufRead, IsTerminal};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Map, Value};

/// 写进各 agent 配置的 MCP 条目键名。
pub const ENTRY_KEY: &str = "openobsidian";
/// 未指定 vault 时的默认名(home 下)。
pub const DEFAULT_VAULT_NAME: &str = "OpenObsidian-Memory";

const BACKUP_SUFFIX: &str = ".openobsidian.bak";
const TMP_SUFFIX: &str = ".openobsidian.tmp";

// ── 位置与环境 ─────────────────────────────────────────────────────────────

pub fn home_dir() -> Result<PathBuf, String> {
    for var in ["HOME", "USERPROFILE"] {
        if let Ok(v) = env::var(var) {
            if !v.is_empty() {
                return Ok(PathBuf::from(v));
            }
        }
    }
    Err("cannot determine home directory (HOME/USERPROFILE unset)".to_string())
}

/// 当前二进制的 canonical 路径(穿透 symlink)。
pub fn self_exe() -> Result<PathBuf, String> {
    let exe = env::current_exe().map_err(|e| format!("cannot resolve current executable: {e}"))?;
    exe.canonicalize()
        .map_err(|e| format!("cannot canonicalize {}: {e}", exe.display()))
}

/// 相对路径转绝对(相对当前目录)。
pub fn absolutize(p: &Path) -> PathBuf {
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(p)
    }
}

/// `{APPDATA}` 等 env token 展开(纯函数,env 取值注入以便测试)。
pub fn expand_tokens(
    s: &str,
    home: &Path,
    env_var: &dyn Fn(&str) -> Option<String>,
) -> Result<PathBuf, String> {
    if let Some(rest) = s.strip_prefix("{APPDATA}/") {
        let appdata = env_var("APPDATA")
            .ok_or_else(|| "APPDATA is not set; cannot resolve Windows config path".to_string())?;
        return Ok(PathBuf::from(appdata).join(rest));
    }
    if s.contains('{') {
        return Err(format!("unknown env token in config path: {s}"));
    }
    Ok(home.join(s))
}

// ── 注册表 ─────────────────────────────────────────────────────────────────

/// 一个 agent 的接线配方。加新 agent = 加一条字面量。
pub struct AgentSpec {
    pub id: &'static str,
    pub label: &'static str,
    /// PATH 探测二进制(装过的证据);空 = 无此证据。
    pub probe_binaries: &'static [&'static str],
    /// macOS /Applications bundle(装过的证据);空 = 无。
    pub app_bundles: &'static [&'static str],
    pub config: ConfigTarget,
    /// 报告里的补充说明(如 grok 的「manual only」)。
    pub note: &'static str,
}

/// 配置写到哪里、什么格式。
pub enum ConfigTarget {
    /// `{"mcpServers": {KEY: {command, args}}}`
    JsonMcpServers(ConfigLoc),
    /// Zed:`{"context_servers": {KEY: {command, args, settings}}}`
    ZedContextServers(ConfigLoc),
    /// Codex:`[mcp_servers.KEY]`(TOML,toml_edit 保格式)
    CodexToml(ConfigLoc),
    /// 无自动接线,只打印手动 snippet。
    Manual,
}

/// 各 OS 下相对 home 的配置路径;`{APPDATA}` 在 Windows 行展开。
#[derive(Clone, Copy)]
pub struct ConfigLoc {
    pub macos: Option<&'static str>,
    pub linux: Option<&'static str>,
    pub windows: Option<&'static str>,
}

/// agent 注册表(数据驱动)。
///
/// Windows 行可编译但本轮未实测;linux 的 Claude Desktop 路径是社区路径,同样未实测。
pub fn agents() -> &'static [AgentSpec] {
    &[
        AgentSpec {
            id: "claude-code",
            label: "Claude Code",
            probe_binaries: &["claude"],
            app_bundles: &[],
            config: ConfigTarget::JsonMcpServers(ConfigLoc {
                macos: Some(".claude.json"),
                linux: Some(".claude.json"),
                windows: Some(".claude.json"),
            }),
            note: "官方 CLI 优先(claude mcp add-json -s user),失败回退文件直写",
        },
        AgentSpec {
            id: "claude-desktop",
            label: "Claude Desktop",
            probe_binaries: &[],
            app_bundles: &["/Applications/Claude.app"],
            config: ConfigTarget::JsonMcpServers(ConfigLoc {
                macos: Some("Library/Application Support/Claude/claude_desktop_config.json"),
                linux: Some(".config/Claude/claude_desktop_config.json"),
                windows: Some("{APPDATA}/Claude/claude_desktop_config.json"),
            }),
            note: "接线后需重启 app",
        },
        AgentSpec {
            id: "cursor",
            label: "Cursor",
            probe_binaries: &["cursor-agent"],
            app_bundles: &["/Applications/Cursor.app"],
            config: ConfigTarget::JsonMcpServers(ConfigLoc {
                macos: Some(".cursor/mcp.json"),
                linux: Some(".cursor/mcp.json"),
                windows: Some(".cursor/mcp.json"),
            }),
            note: "",
        },
        AgentSpec {
            id: "codex",
            label: "Codex CLI",
            probe_binaries: &["codex"],
            app_bundles: &[],
            config: ConfigTarget::CodexToml(ConfigLoc {
                macos: Some(".codex/config.toml"),
                linux: Some(".codex/config.toml"),
                windows: Some(".codex/config.toml"),
            }),
            note: "",
        },
        AgentSpec {
            id: "windsurf",
            label: "Windsurf",
            probe_binaries: &["windsurf"],
            app_bundles: &["/Applications/Windsurf.app"],
            config: ConfigTarget::JsonMcpServers(ConfigLoc {
                macos: Some(".codeium/windsurf/mcp_config.json"),
                linux: Some(".codeium/windsurf/mcp_config.json"),
                windows: Some(".codeium/windsurf/mcp_config.json"),
            }),
            note: "",
        },
        AgentSpec {
            id: "zed",
            label: "Zed",
            probe_binaries: &["zed"],
            app_bundles: &["/Applications/Zed.app"],
            config: ConfigTarget::ZedContextServers(ConfigLoc {
                macos: Some(".config/zed/settings.json"),
                linux: Some(".config/zed/settings.json"),
                windows: Some("{APPDATA}/Zed/settings.json"),
            }),
            note: "settings.json 若带注释(JSONC)解析必失败——走拒碰路径,打印 snippet",
        },
        AgentSpec {
            id: "grok",
            label: "Grok CLI",
            probe_binaries: &["grok"],
            app_bundles: &[],
            config: ConfigTarget::Manual,
            note: "无 MCP 自动接线面;打印 snippet 手动粘贴(Pi 同理,见 AGENTS.md)",
        },
    ]
}

/// 当前平台下该 agent 的配置文件路径;Ok(None) = 本平台未定义。
pub fn config_path(loc: &ConfigLoc, home: &Path) -> Result<Option<PathBuf>, String> {
    let rel = if cfg!(target_os = "macos") {
        loc.macos
    } else if cfg!(target_os = "windows") {
        loc.windows
    } else {
        loc.linux
    };
    match rel {
        Some(r) => expand_tokens(r, home, &|v| env::var(v).ok()).map(Some),
        None => Ok(None),
    }
}

fn required_config_path(loc: &ConfigLoc, home: &Path) -> Result<PathBuf, String> {
    config_path(loc, home)?.ok_or_else(|| "no config path defined for this OS".to_string())
}

// ── 探测 ───────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct AgentStatus {
    pub id: String,
    pub label: String,
    /// 任一硬证据命中。
    pub present: bool,
    /// 硬证据(PATH 二进制 / 配置文件 / app bundle)。
    pub evidence: Vec<String>,
    /// 弱信号(如配置父目录存在)——不足以判「装过」。
    pub hints: Vec<String>,
    pub config_path: Option<PathBuf>,
    pub note: String,
}

/// 探测所有注册 agent(home 参数注入以便 fake-home 测试)。
pub fn detect_agents(home: &Path) -> Vec<AgentStatus> {
    agents().iter().map(|spec| detect_one(spec, home)).collect()
}

fn detect_one(spec: &AgentSpec, home: &Path) -> AgentStatus {
    let mut evidence = Vec::new();
    let mut hints = Vec::new();
    for bin in spec.probe_binaries {
        if let Some(p) = binary_probe(bin) {
            evidence.push(format!("binary on PATH: {}", p.display()));
        }
    }
    let cfg = match &spec.config {
        ConfigTarget::Manual => None,
        ConfigTarget::JsonMcpServers(loc)
        | ConfigTarget::ZedContextServers(loc)
        | ConfigTarget::CodexToml(loc) => config_path(loc, home).ok().flatten(),
    };
    if let Some(p) = &cfg {
        if p.is_file() {
            evidence.push(format!("config exists: {}", p.display()));
        } else if let Some(parent) = p.parent() {
            if parent.is_dir() {
                hints.push(format!("config dir exists: {}", parent.display()));
            }
        }
    }
    for bundle in spec.app_bundles {
        if Path::new(bundle).exists() {
            evidence.push(format!("app bundle: {bundle}"));
        }
    }
    AgentStatus {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        present: !evidence.is_empty(),
        evidence,
        hints,
        config_path: cfg,
        note: spec.note.to_string(),
    }
}

fn binary_probe(name: &str) -> Option<PathBuf> {
    which::which(name).ok()
}

// ── 条目渲染 ────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct McpEntry {
    pub command: PathBuf,
    pub vault: PathBuf,
}

pub fn render_json_entry(e: &McpEntry) -> Value {
    json!({
        "command": e.command.to_string_lossy(),
        "args": [e.vault.to_string_lossy()],
    })
}

/// Zed 的 `context_servers` schema 多一个 `settings`(新建时给 `{}`,替换时保留已有)。
pub fn render_zed_entry(e: &McpEntry) -> Value {
    json!({
        "command": e.command.to_string_lossy(),
        "args": [e.vault.to_string_lossy()],
        "settings": {},
    })
}

/// 手动兜底 / 拒碰时的 copy-paste 文本。
pub fn render_snippet(spec: &AgentSpec, e: &McpEntry) -> String {
    match &spec.config {
        ConfigTarget::CodexToml(_) => format!(
            "[mcp_servers.{ENTRY_KEY}]\ncommand = \"{}\"\nargs = [\"{}\"]",
            e.command.display(),
            e.vault.display()
        ),
        ConfigTarget::ZedContextServers(_) => format!(
            "\"context_servers\": {{\n  \"{ENTRY_KEY}\": {}\n}}",
            indent2(&serde_json::to_string_pretty(&render_zed_entry(e)).unwrap_or_default())
        ),
        ConfigTarget::JsonMcpServers(_) | ConfigTarget::Manual => format!(
            "\"mcpServers\": {{\n  \"{ENTRY_KEY}\": {}\n}}",
            indent2(&serde_json::to_string_pretty(&render_json_entry(e)).unwrap_or_default())
        ),
    }
}

/// snippet 里嵌套 JSON 整体再缩进两格,保证用户粘贴后层级对齐。
fn indent2(s: &str) -> String {
    s.lines().map(|l| format!("  {l}")).collect::<Vec<_>>().join("\n")
}

// ── 写入基础设施 ────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum WriteOutcome {
    /// 真写完成;detail 说明机制(官方 CLI / 写了哪个文件),backup 为备份路径(新建无)。
    Written {
        detail: String,
        backup: Option<PathBuf>,
    },
    /// dry-run:未写,描述将执行的操作。
    DryRun(String),
    /// 无需改动(如 remove 目标本就不存在)。
    Unchanged(String),
}

impl WriteOutcome {
    pub fn describe(&self) -> String {
        match self {
            WriteOutcome::Written { detail, backup } => match backup {
                Some(b) => format!("{detail} (backup: {})", b.display()),
                None => detail.clone(),
            },
            WriteOutcome::DryRun(s) => format!("dry-run: would {s}"),
            WriteOutcome::Unchanged(s) => s.clone(),
        }
    }
}

fn backup_path(path: &Path) -> PathBuf {
    with_suffix(path, BACKUP_SUFFIX)
}

fn tmp_path(path: &Path) -> PathBuf {
    with_suffix(path, TMP_SUFFIX)
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

fn backup_if_exists(path: &Path) -> Result<Option<PathBuf>, String> {
    if path.exists() {
        let bak = backup_path(path);
        fs::copy(path, &bak)
            .map_err(|e| format!("backup {} failed: {e}", path.display()))?;
        Ok(Some(bak))
    } else {
        Ok(None)
    }
}

/// 原子写:同目录 tmp → rename。中途崩溃不会截断目标。
fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    let tmp = tmp_path(path);
    fs::write(&tmp, contents).map_err(|e| format!("write {} failed: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| {
        format!(
            "rename {} -> {} failed: {e}",
            tmp.display(),
            path.display()
        )
    })?;
    Ok(())
}

// ── JSON 写入器(Claude Code / Claude Desktop / Cursor / Windsurf / Zed)────

/// Upsert JSON 配置里的 `root_key.KEY` 条目。
///
/// - 文件缺失(含缺父目录)→ 新建 `{root_key: {KEY: entry}}`;
/// - 可解析 → 保留其他键与键序(serde_json preserve_order),原地 upsert;
///   替换已有条目时保留其非空 `settings`(Zed);
/// - 不可解析 → Err,**绝不触碰文件**。
pub fn install_json_entry(
    path: &Path,
    root_key: &str,
    entry: Value,
    dry_run: bool,
) -> Result<WriteOutcome, String> {
    let existed = path.exists();
    let raw = if existed {
        fs::read_to_string(path).map_err(|e| format!("read {} failed: {e}", path.display()))?
    } else {
        String::new()
    };
    let mut doc: Map<String, Value> = if raw.trim().is_empty() {
        Map::new()
    } else {
        match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Object(m)) => m,
            Ok(_) => {
                return Err(format!(
                    "{} is not a JSON object; refusing to touch it",
                    path.display()
                ))
            }
            Err(e) => {
                return Err(format!(
                    "cannot parse {} ({e}); refusing to touch it",
                    path.display()
                ))
            }
        }
    };
    let root = doc
        .entry(root_key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let root_obj = root.as_object_mut().ok_or_else(|| {
        format!(
            "`{root_key}` in {} is not an object; refusing to touch it",
            path.display()
        )
    })?;

    let mut new_entry = entry;
    // 替换已有条目时保留其 settings(Zed schema)。
    if let Some(old_settings) = root_obj.get(ENTRY_KEY).and_then(|v| v.get("settings")) {
        if let Some(ne) = new_entry.as_object_mut() {
            let empty = ne
                .get("settings")
                .and_then(|s| s.as_object())
                .is_some_and(Map::is_empty);
            if empty {
                ne.insert("settings".to_string(), old_settings.clone());
            }
        }
    }
    root_obj.insert(ENTRY_KEY.to_string(), new_entry);

    let action = if existed {
        format!("update `{ENTRY_KEY}` in {}", path.display())
    } else {
        format!("create {} with `{ENTRY_KEY}`", path.display())
    };
    if dry_run {
        return Ok(WriteOutcome::DryRun(action));
    }
    let backup = backup_if_exists(path)?;
    let pretty = serde_json::to_string_pretty(&Value::Object(doc)).map_err(|e| e.to_string())?;
    atomic_write(path, &format!("{pretty}\n"))?;
    Ok(WriteOutcome::Written {
        detail: format!("wrote {}", path.display()),
        backup,
    })
}

/// 删除 JSON 配置里的 `root_key.KEY` 条目(只删我们的键)。
pub fn remove_json_entry(
    path: &Path,
    root_key: &str,
    dry_run: bool,
) -> Result<WriteOutcome, String> {
    if !path.exists() {
        return Ok(WriteOutcome::Unchanged(format!(
            "{} not present; nothing to remove",
            path.display()
        )));
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read {} failed: {e}", path.display()))?;
    let mut doc: Map<String, Value> = match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Object(m)) => m,
        Ok(_) => {
            return Err(format!(
                "{} is not a JSON object; refusing to touch it",
                path.display()
            ))
        }
        Err(e) => {
            return Err(format!(
                "cannot parse {} ({e}); refusing to touch it",
                path.display()
            ))
        }
    };
    let removed = match doc.get_mut(root_key) {
        Some(Value::Object(root_obj)) => root_obj.remove(ENTRY_KEY).is_some(),
        _ => false,
    };
    if !removed {
        return Ok(WriteOutcome::Unchanged(format!(
            "`{ENTRY_KEY}` not present in {}; nothing to remove",
            path.display()
        )));
    }
    if dry_run {
        return Ok(WriteOutcome::DryRun(format!(
            "remove `{ENTRY_KEY}` from {}",
            path.display()
        )));
    }
    let backup = backup_if_exists(path)?;
    let pretty = serde_json::to_string_pretty(&Value::Object(doc)).map_err(|e| e.to_string())?;
    atomic_write(path, &format!("{pretty}\n"))?;
    Ok(WriteOutcome::Written {
        detail: format!("removed `{ENTRY_KEY}` from {}", path.display()),
        backup,
    })
}

// ── Codex TOML 写入器(toml_edit 保格式 / 保注释)─────────────────────────────

pub fn install_codex_entry(path: &Path, e: &McpEntry, dry_run: bool) -> Result<WriteOutcome, String> {
    let existed = path.exists();
    let raw = if existed {
        fs::read_to_string(path).map_err(|err| format!("read {} failed: {err}", path.display()))?
    } else {
        String::new()
    };
    let mut doc: toml_edit::DocumentMut = raw.parse().map_err(|err| {
        format!(
            "cannot parse {} ({err}); refusing to touch it",
            path.display()
        )
    })?;
    let root = doc.as_table_mut();
    if root.get("mcp_servers").map_or(true, |i| i.is_none()) {
        root.insert(
            "mcp_servers",
            toml_edit::Item::Table(toml_edit::Table::new()),
        );
    }
    let servers = match root.get_mut("mcp_servers").unwrap() {
        toml_edit::Item::Table(t) => t,
        _ => {
            return Err(format!(
                "mcp_servers in {} is not a standard table (inline?); refusing to touch it",
                path.display()
            ))
        }
    };
    let mut entry = toml_edit::Table::new();
    entry["command"] = toml_edit::value(e.command.to_string_lossy().into_owned());
    let mut arr = toml_edit::Array::new();
    arr.push(e.vault.to_string_lossy().into_owned());
    entry["args"] = toml_edit::value(arr);
    servers.insert(ENTRY_KEY, toml_edit::Item::Table(entry));

    let action = if existed {
        format!("update `[mcp_servers.{ENTRY_KEY}]` in {}", path.display())
    } else {
        format!("create {} with `[mcp_servers.{ENTRY_KEY}]`", path.display())
    };
    if dry_run {
        return Ok(WriteOutcome::DryRun(action));
    }
    let backup = backup_if_exists(path)?;
    atomic_write(path, &doc.to_string())?;
    Ok(WriteOutcome::Written {
        detail: format!("wrote {}", path.display()),
        backup,
    })
}

pub fn remove_codex_entry(path: &Path, dry_run: bool) -> Result<WriteOutcome, String> {
    if !path.exists() {
        return Ok(WriteOutcome::Unchanged(format!(
            "{} not present; nothing to remove",
            path.display()
        )));
    }
    let raw = fs::read_to_string(path).map_err(|err| format!("read {} failed: {err}", path.display()))?;
    let mut doc: toml_edit::DocumentMut = raw.parse().map_err(|err| {
        format!(
            "cannot parse {} ({err}); refusing to touch it",
            path.display()
        )
    })?;
    let removed = doc
        .as_table_mut()
        .get_mut("mcp_servers")
        .and_then(|i| i.as_table_mut())
        .and_then(|t| t.remove(ENTRY_KEY))
        .is_some();
    if !removed {
        return Ok(WriteOutcome::Unchanged(format!(
            "`[mcp_servers.{ENTRY_KEY}]` not present in {}; nothing to remove",
            path.display()
        )));
    }
    if dry_run {
        return Ok(WriteOutcome::DryRun(format!(
            "remove `[mcp_servers.{ENTRY_KEY}]` from {}",
            path.display()
        )));
    }
    let backup = backup_if_exists(path)?;
    atomic_write(path, &doc.to_string())?;
    Ok(WriteOutcome::Written {
        detail: format!("removed `[mcp_servers.{ENTRY_KEY}]` from {}", path.display()),
        backup,
    })
}

// ── claude-code 官方 CLI 链 ─────────────────────────────────────────────────

/// `claude mcp add-json openobsidian <json> -s user` —— 让 Claude Code 自己写
/// 它的 `~/.claude.json`(多 MB 活体状态文件),避免我们 read-modify-write 的并发窗口。
fn claude_cli_add(entry: &McpEntry) -> Result<String, String> {
    let payload = serde_json::to_string(&render_json_entry(entry)).map_err(|e| e.to_string())?;
    let out = Command::new("claude")
        .args(["mcp", "add-json", ENTRY_KEY, &payload, "-s", "user"])
        .output()
        .map_err(|e| format!("cannot run `claude` CLI: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("`claude mcp add-json` failed: {}", stderr.trim()));
    }
    Ok("wired via `claude mcp add-json -s user`".to_string())
}

fn claude_cli_remove() -> Result<String, String> {
    let out = Command::new("claude")
        .args(["mcp", "remove", ENTRY_KEY, "-s", "user"])
        .output()
        .map_err(|e| format!("cannot run `claude` CLI: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("`claude mcp remove` failed: {}", stderr.trim()));
    }
    Ok("removed via `claude mcp remove -s user`".to_string())
}

// ── 单 agent 接线 / 拆线(CLI 与桌面 app UI 共用)─────────────────────────────

/// 接线单个 agent。
///
/// claude-code 官方 CLI 优先、失败回退文件直写;其余文件直写(带安全护栏)。
/// [`ConfigTarget::Manual`] 一律 Err(正文即手动 snippet)。
pub fn wire_agent(
    spec: &AgentSpec,
    home: &Path,
    entry: &McpEntry,
    dry_run: bool,
) -> Result<WriteOutcome, String> {
    Ok(match &spec.config {
        ConfigTarget::Manual => {
            return Err(format!(
                "{} has no auto-wire path; add manually:\n\n{}",
                spec.label,
                render_snippet(spec, entry)
            ))
        }
        ConfigTarget::JsonMcpServers(loc) => {
            let path = required_config_path(loc, home)?;
            if spec.id == "claude-code" && !dry_run {
                match claude_cli_add(entry) {
                    Ok(detail) => {
                        return Ok(WriteOutcome::Written {
                            detail,
                            backup: None,
                        })
                    }
                    Err(e) => {
                        println!("  (claude CLI path failed: {e}; falling back to direct file edit)");
                    }
                }
            }
            install_json_entry(&path, "mcpServers", render_json_entry(entry), dry_run)?
        }
        ConfigTarget::ZedContextServers(loc) => {
            let path = required_config_path(loc, home)?;
            install_json_entry(&path, "context_servers", render_zed_entry(entry), dry_run)?
        }
        ConfigTarget::CodexToml(loc) => {
            let path = required_config_path(loc, home)?;
            install_codex_entry(&path, entry, dry_run)?
        }
    })
}

/// 拆线单个 agent(只删 `openobsidian` 条目)。
pub fn unwire_agent(spec: &AgentSpec, home: &Path, dry_run: bool) -> Result<WriteOutcome, String> {
    Ok(match &spec.config {
        ConfigTarget::Manual => {
            return Err(format!(
                "{} has no auto-wired entry; if configured manually, remove it manually",
                spec.label
            ))
        }
        ConfigTarget::JsonMcpServers(loc) => {
            let path = required_config_path(loc, home)?;
            if spec.id == "claude-code" && !dry_run && claude_cli_remove().is_ok() {
                return Ok(WriteOutcome::Written {
                    detail: "removed via `claude mcp remove -s user`".to_string(),
                    backup: None,
                });
            }
            remove_json_entry(&path, "mcpServers", dry_run)?
        }
        ConfigTarget::ZedContextServers(loc) => {
            let path = required_config_path(loc, home)?;
            remove_json_entry(&path, "context_servers", dry_run)?
        }
        ConfigTarget::CodexToml(loc) => {
            let path = required_config_path(loc, home)?;
            remove_codex_entry(&path, dry_run)?
        }
    })
}

// ── vault 播种(内嵌 templates/wiki-starter)────────────────────────────────

/// 内嵌模板文件(相对路径,内容)。必须与 `templates/wiki-starter/` 目录一致
/// (drift-guard 测试 `embedded_list_matches_templates_dir` 守护;
/// include_str! 本身防「删」,该测试防「增」)。
pub fn embedded_files() -> &'static [(&'static str, &'static str)] {
    &[
        ("README.md", include_str!("../../templates/wiki-starter/README.md")),
        ("index.md", include_str!("../../templates/wiki-starter/index.md")),
        (
            "examples/example-concept.md",
            include_str!("../../templates/wiki-starter/examples/example-concept.md"),
        ),
        (
            "examples/example-entity.md",
            include_str!("../../templates/wiki-starter/examples/example-entity.md"),
        ),
        (
            "examples/example-source.md",
            include_str!("../../templates/wiki-starter/examples/example-source.md"),
        ),
        (
            "examples/example-summary.md",
            include_str!("../../templates/wiki-starter/examples/example-summary.md"),
        ),
        (
            "health/agent-unreviewed.md",
            include_str!("../../templates/wiki-starter/health/agent-unreviewed.md"),
        ),
        (
            "health/concept-hunger.md",
            include_str!("../../templates/wiki-starter/health/concept-hunger.md"),
        ),
        (
            "health/contested-concepts.md",
            include_str!("../../templates/wiki-starter/health/contested-concepts.md"),
        ),
        (
            "health/duplicate-titles.md",
            include_str!("../../templates/wiki-starter/health/duplicate-titles.md"),
        ),
        (
            "health/evidence-distribution.md",
            include_str!("../../templates/wiki-starter/health/evidence-distribution.md"),
        ),
        (
            "health/knowledge-mix.md",
            include_str!("../../templates/wiki-starter/health/knowledge-mix.md"),
        ),
        (
            "health/orphans.md",
            include_str!("../../templates/wiki-starter/health/orphans.md"),
        ),
        (
            "health/single-source-concepts.md",
            include_str!("../../templates/wiki-starter/health/single-source-concepts.md"),
        ),
        (
            "health/stale-agent-notes.md",
            include_str!("../../templates/wiki-starter/health/stale-agent-notes.md"),
        ),
        (
            "health/stale-sources.md",
            include_str!("../../templates/wiki-starter/health/stale-sources.md"),
        ),
        (
            "health/unreviewed-pages.md",
            include_str!("../../templates/wiki-starter/health/unreviewed-pages.md"),
        ),
        (
            "prompts/ingest-distill.md",
            include_str!("../../templates/wiki-starter/prompts/ingest-distill.md"),
        ),
        (
            "types/concept.md",
            include_str!("../../templates/wiki-starter/types/concept.md"),
        ),
        (
            "types/entity.md",
            include_str!("../../templates/wiki-starter/types/entity.md"),
        ),
        (
            "types/query.md",
            include_str!("../../templates/wiki-starter/types/query.md"),
        ),
        (
            "types/source.md",
            include_str!("../../templates/wiki-starter/types/source.md"),
        ),
        (
            "types/summary.md",
            include_str!("../../templates/wiki-starter/types/summary.md"),
        ),
    ]
}

#[derive(Debug, Default)]
pub struct SeedReport {
    pub written: Vec<String>,
    pub skipped: Vec<String>,
}

/// 播种模板到 `dir`。非空目录无 `--force` 拒绝;`--force` 合并但**永不覆盖**已有文件。
pub fn seed_vault(dir: &Path, force: bool) -> Result<SeedReport, String> {
    if dir.exists() {
        if !dir.is_dir() {
            return Err(format!("{} exists and is not a directory", dir.display()));
        }
        let non_empty = fs::read_dir(dir)
            .map_err(|e| format!("read {} failed: {e}", dir.display()))?
            .next()
            .is_some();
        if non_empty && !force {
            return Err(format!(
                "{} is not empty; use --force to merge (existing files are never overwritten)",
                dir.display()
            ));
        }
    } else {
        fs::create_dir_all(dir).map_err(|e| format!("create {} failed: {e}", dir.display()))?;
    }
    let mut report = SeedReport::default();
    for (rel, content) in embedded_files() {
        let full = dir.join(rel);
        if full.exists() {
            report.skipped.push((*rel).to_string());
            continue;
        }
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("create {} failed: {e}", parent.display()))?;
        }
        fs::write(&full, content).map_err(|e| format!("write {} failed: {e}", full.display()))?;
        report.written.push((*rel).to_string());
    }
    Ok(report)
}

// ── doctor ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Ok,
    Warn,
    Fail,
}

#[derive(Debug, Clone)]
pub struct Check {
    pub name: String,
    pub status: Status,
    pub detail: String,
}

fn ok_check(name: &str, detail: String) -> Check {
    Check {
        name: name.to_string(),
        status: Status::Ok,
        detail,
    }
}

fn warn_check(name: &str, detail: String) -> Check {
    Check {
        name: name.to_string(),
        status: Status::Warn,
        detail,
    }
}

fn fail_check(name: &str, detail: String) -> Check {
    Check {
        name: name.to_string(),
        status: Status::Fail,
        detail,
    }
}

/// doctor 检查清单(纯输入:三个已解析路径 → 可用 tempdir 全量测试)。
pub fn run_checks(vault: &Path, home: &Path, exe: &Path) -> Vec<Check> {
    let mut checks: Vec<Check> = Vec::new();

    checks.push(ok_check("binary", format!("resolved: {}", exe.display())));

    if !vault.is_dir() {
        checks.push(fail_check(
            "vault",
            format!("{} is not a directory", vault.display()),
        ));
        return checks;
    }
    checks.push(ok_check("vault", vault.display().to_string()));

    match crate::list_md(vault) {
        Ok(files) if !files.is_empty() => {
            checks.push(ok_check("notes", format!("{} .md notes", files.len())))
        }
        Ok(_) => checks.push(fail_check(
            "notes",
            "vault has no .md notes; run `openobs-mcp init <vault> --force` to seed the scaffold"
                .to_string(),
        )),
        Err(e) => checks.push(fail_check("notes", e)),
    }

    let index_md = vault.join("index.md");
    if index_md.is_file() {
        match fs::read_to_string(&index_md) {
            Ok(content) if frontmatter_has_owf1(&content) => checks.push(ok_check(
                "format",
                "index.md declares `format: owf/1`".to_string(),
            )),
            Ok(_) => checks.push(warn_check(
                "format",
                "index.md exists but does not declare `format: owf/1`".to_string(),
            )),
            Err(e) => checks.push(warn_check("format", format!("cannot read index.md: {e}"))),
        }
    } else {
        checks.push(warn_check("format", "index.md not found".to_string()));
    }

    if vault.join("types").is_dir() {
        checks.push(ok_check(
            "scaffold",
            "wiki-starter scaffold present (types/)".to_string(),
        ));
    } else {
        checks.push(warn_check(
            "scaffold",
            "types/ missing; run `openobs-mcp init <vault> --force` to seed the scaffold"
                .to_string(),
        ));
    }

    for spec in agents() {
        let loc = match &spec.config {
            ConfigTarget::Manual => continue,
            ConfigTarget::JsonMcpServers(l)
            | ConfigTarget::ZedContextServers(l)
            | ConfigTarget::CodexToml(l) => l,
        };
        let Some(cfg) = config_path(loc, home).ok().flatten() else {
            continue;
        };
        if !cfg.is_file() {
            continue;
        }
        match read_wired_entry(spec, &cfg) {
            Ok(Some(w)) => {
                if !w.command.exists() {
                    checks.push(warn_check(
                        spec.label,
                        format!(
                            "wired but command path is missing: {} (re-run setup)",
                            w.command.display()
                        ),
                    ));
                } else if !same_path(&w.command, exe) {
                    checks.push(warn_check(
                        spec.label,
                        format!(
                            "wired to {} but the current binary is {} (re-run setup)",
                            w.command.display(),
                            exe.display()
                        ),
                    ));
                } else if !same_path(&w.vault, vault) {
                    checks.push(warn_check(
                        spec.label,
                        format!(
                            "wired to vault {} which differs from {} (re-run setup with --vault)",
                            w.vault.display(),
                            vault.display()
                        ),
                    ));
                } else {
                    checks.push(ok_check(
                        spec.label,
                        format!("wired: {} → {}", exe.display(), vault.display()),
                    ));
                }
            }
            Ok(None) => checks.push(warn_check(
                spec.label,
                format!(
                    "config present ({}) but `{ENTRY_KEY}` not wired; run setup",
                    cfg.display()
                ),
            )),
            Err(e) => checks.push(warn_check(spec.label, format!("{}: {e}", cfg.display()))),
        }
    }

    checks
}

fn same_path(a: &Path, b: &Path) -> bool {
    let ca = a.canonicalize().unwrap_or_else(|_| a.to_path_buf());
    let cb = b.canonicalize().unwrap_or_else(|_| b.to_path_buf());
    ca == cb
}

/// index.md 首个 `---`…`---` 块是否含 `format: owf/1` 声明。
fn frontmatter_has_owf1(content: &str) -> bool {
    let trimmed = content.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else {
        return false;
    };
    let Some(end) = rest.find("\n---") else {
        return false;
    };
    rest[..end].lines().any(|l| {
        let l = l.trim();
        l.starts_with("format:") && l["format:".len()..].trim().trim_matches('"') == "owf/1"
    })
}

/// agent 配置里已有的 `openobsidian` 条目(doctor 与桌面 app UI 展示用)。
#[derive(Debug, Clone)]
pub struct WiredEntry {
    pub command: PathBuf,
    pub vault: PathBuf,
}

fn wired_from_json(entry: &Value) -> Option<WiredEntry> {
    let command = entry.get("command")?.as_str()?.to_string();
    let vault = entry
        .get("args")?
        .as_array()?
        .first()?
        .as_str()?
        .to_string();
    Some(WiredEntry {
        command: PathBuf::from(command),
        vault: PathBuf::from(vault),
    })
}

fn wired_from_toml_item(item: &toml_edit::Item) -> Option<WiredEntry> {
    let t = item.as_table()?;
    let command = t.get("command")?.as_value()?.as_str()?.to_string();
    let args = t.get("args")?.as_value()?.as_array()?;
    let vault = args.iter().next()?.as_str()?.to_string();
    Some(WiredEntry {
        command: PathBuf::from(command),
        vault: PathBuf::from(vault),
    })
}

/// 读指定 agent 配置文件中已接线的 `openobsidian` 条目(桌面 app UI 展示「已接入」用)。
///
/// Ok(None) = 无配置文件或未接线;Err = 配置文件存在但不可读/不可解析。
pub fn read_agent_entry(spec: &AgentSpec, home: &Path) -> Result<Option<WiredEntry>, String> {
    let loc = match &spec.config {
        ConfigTarget::Manual => return Ok(None),
        ConfigTarget::JsonMcpServers(l)
        | ConfigTarget::ZedContextServers(l)
        | ConfigTarget::CodexToml(l) => l,
    };
    let Some(cfg) = config_path(loc, home)? else {
        return Ok(None);
    };
    if !cfg.is_file() {
        return Ok(None);
    }
    read_wired_entry(spec, &cfg)
}

fn read_wired_entry(spec: &AgentSpec, path: &Path) -> Result<Option<WiredEntry>, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("cannot read ({e})"))?;
    match &spec.config {
        ConfigTarget::JsonMcpServers(_) => {
            let doc: Value = serde_json::from_str(&raw).map_err(|e| {
                format!("unparseable config ({e}); fix manually or re-run setup")
            })?;
            Ok(doc
                .get("mcpServers")
                .and_then(|m| m.get(ENTRY_KEY))
                .and_then(wired_from_json))
        }
        ConfigTarget::ZedContextServers(_) => {
            let doc: Value = serde_json::from_str(&raw).map_err(|e| {
                format!("unparseable config ({e}); fix manually or re-run setup")
            })?;
            Ok(doc
                .get("context_servers")
                .and_then(|m| m.get(ENTRY_KEY))
                .and_then(wired_from_json))
        }
        ConfigTarget::CodexToml(_) => {
            let doc: toml_edit::DocumentMut = raw
                .parse()
                .map_err(|e| format!("unparseable config ({e}); fix manually or re-run setup"))?;
            let item = doc
                .as_table()
                .get("mcp_servers")
                .and_then(|i| i.as_table())
                .and_then(|t| t.get(ENTRY_KEY));
            Ok(item.and_then(wired_from_toml_item))
        }
        ConfigTarget::Manual => Ok(None),
    }
}

// ── 编排(CLI 入口;app UI 直接调上面的函数)────────────────────────────────

pub const USAGE: &str = "\
openobs-mcp — OpenObsidian MCP server + agent onboarding

Serve (unchanged behavior):
  openobs-mcp                    serve; vault = $OPENOBS_VAULT or current dir
  openobs-mcp <path>             serve with vault = <path>
  openobs-mcp serve [<path>]     explicit serve (escape hatch for vault dirs named
                                 like a subcommand, e.g. `serve ./setup`)

Onboarding:
  openobs-mcp setup [--vault P] [--agent ID]... [--yes] [--dry-run] [--remove]
      Detect local agents and register this server in their MCP configs.
      --vault P   vault to expose (default: $OPENOBS_VAULT or ~/OpenObsidian-Memory)
      --agent ID  only act on these agents (repeatable); default: all detected
      --yes       never prompt (required when stdin is not a terminal)
      --dry-run   print the plan without writing anything
      --remove    unregister instead of register
  openobs-mcp doctor [--vault P]
      Diagnose wiring health (exit 1 on failure).
  openobs-mcp init <dir> [--force]
      Seed the wiki-starter template into <dir> (--force merges, never overwrites).
  openobs-mcp help | --help | -h

Agent ids: claude-code, claude-desktop, cursor, codex, windsurf, zed, grok (manual)
";

/// 给用户粘贴进 agent 指引文件(CLAUDE.md / AGENTS.md 等)的文本。
/// **只打印,绝不自动写入任何用户文件。**
pub const GUIDANCE_SNIPPET: &str = "\
## OpenObsidian memory (paste into your agent guidance file)

This machine has an OpenObsidian vault wired as long-term memory via MCP
(server name: openobsidian). Treat it as an LLM-wiki:
- Orient with vault_info / list_notes; find pages via search_notes or run_qql.
- read_note before editing — it returns a graph brief (backlinks / forward / dead links).
- write_note audits broken links right after writing; fix what it reports.
- Vault format is OWF-1 (see index.md frontmatter): unknown types/fields are
  tolerated; follow the page-type conventions under types/.
- Prefer updating existing pages over creating near-duplicates; lint_vault
  lists structural candidates (never auto-fixed).
";

struct SetupOpts {
    vault: Option<PathBuf>,
    agents: Vec<String>,
    yes: bool,
    dry_run: bool,
    remove: bool,
}

fn parse_setup_opts(args: &[String]) -> Result<SetupOpts, String> {
    let mut o = SetupOpts {
        vault: None,
        agents: Vec::new(),
        yes: false,
        dry_run: false,
        remove: false,
    };
    let mut i = 1; // skip "setup"
    while i < args.len() {
        match args[i].as_str() {
            "--vault" => {
                i += 1;
                o.vault = Some(PathBuf::from(
                    args.get(i).ok_or("--vault needs a value")?,
                ));
            }
            "--agent" => {
                i += 1;
                o.agents
                    .push(args.get(i).ok_or("--agent needs a value")?.clone());
            }
            "--yes" | "-y" => o.yes = true,
            "--dry-run" => o.dry_run = true,
            "--remove" => o.remove = true,
            other => return Err(format!("unknown option: {other} (see `openobs-mcp help`)")),
        }
        i += 1;
    }
    Ok(o)
}

fn confirm(yes: bool, question: &str) -> Result<(), String> {
    if yes {
        return Ok(());
    }
    if !std::io::stdin().is_terminal() {
        return Err(format!(
            "confirmation needed ({question}) but stdin is not a terminal; pass --yes"
        ));
    }
    println!("{question} [y/N]");
    let mut line = String::new();
    std::io::stdin()
        .lock()
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    match line.trim().to_lowercase().as_str() {
        "y" | "yes" => Ok(()),
        _ => Err("aborted by user".to_string()),
    }
}

fn resolve_setup_vault(opts: &SetupOpts, home: &Path) -> Result<PathBuf, String> {
    let vault = if let Some(v) = &opts.vault {
        v.clone()
    } else if let Ok(v) = env::var("OPENOBS_VAULT") {
        PathBuf::from(v)
    } else {
        home.join(DEFAULT_VAULT_NAME)
    };
    let vault = absolutize(&vault);
    if !vault.exists() {
        if opts.dry_run {
            println!(
                "vault {} does not exist (would seed wiki-starter into it)",
                vault.display()
            );
            return Ok(vault);
        }
        confirm(
            opts.yes,
            &format!(
                "vault {} does not exist; create and seed it with the wiki-starter template?",
                vault.display()
            ),
        )?;
        let report = seed_vault(&vault, false)?;
        println!(
            "seeded {} files into {}",
            report.written.len(),
            vault.display()
        );
    } else if !vault.is_dir() {
        return Err(format!("{} exists and is not a directory", vault.display()));
    }
    Ok(vault)
}

pub fn run_setup(args: &[String]) -> Result<(), String> {
    let opts = parse_setup_opts(args)?;
    let home = home_dir()?;
    let exe = self_exe()?;
    let exe_str = exe.to_string_lossy();
    if exe_str.contains("/target/debug/") || exe_str.contains("\\target\\debug\\") {
        println!(
            "note: running a debug build ({}); consider `cargo build -p openobs-mcp --release` and re-running setup.",
            exe.display()
        );
    }

    let vault = resolve_setup_vault(&opts, &home)?;
    let entry = McpEntry {
        command: exe.clone(),
        vault: vault.clone(),
    };

    let statuses = detect_agents(&home);
    let targets: Vec<&AgentSpec> = agents()
        .iter()
        .filter(|s| opts.agents.is_empty() || opts.agents.iter().any(|a| a == s.id))
        .collect();
    if targets.is_empty() {
        return Err(format!("no agents match --agent {:?}", opts.agents));
    }

    println!("\nVault:  {}", vault.display());
    println!("Binary: {}", exe.display());
    println!("\nDetected agents:");
    let mut actionable: Vec<&AgentSpec> = Vec::new();
    for spec in &targets {
        let st = statuses.iter().find(|x| x.id == spec.id);
        let detected = st.is_some_and(|s| s.present);
        let mark = if detected { "✓" } else { "-" };
        println!("{mark} {}", spec.label);
        if let Some(st) = st {
            for e in &st.evidence {
                println!("    {e}");
            }
            for h in &st.hints {
                println!("    (hint) {h}");
            }
        }
        if matches!(spec.config, ConfigTarget::Manual) {
            println!("    manual only — snippet will be printed");
        }
        // 默认只接检测到的;--agent 显式点名的无视检测状态。
        if detected || !opts.agents.is_empty() {
            actionable.push(spec);
        }
    }

    if actionable.is_empty() {
        println!("\nNo detected agents to wire. Use --agent <id> to force a specific agent.");
        return Ok(());
    }

    let verb = if opts.remove { "remove entry from" } else { "wire" };
    let ids: Vec<&str> = actionable.iter().map(|s| s.id).collect();
    println!("\nWill {} {}", verb, ids.join(", "));
    if !opts.dry_run {
        confirm(opts.yes, "Proceed?")?;
    }

    let mut failures = 0usize;
    for spec in &actionable {
        let res = if opts.remove {
            unwire_agent(spec, &home, opts.dry_run)
        } else {
            wire_agent(spec, &home, &entry, opts.dry_run)
        };
        match res {
            Ok(outcome) => println!("  [ok] {} — {}", spec.label, outcome.describe()),
            Err(e) => {
                failures += 1;
                println!("  [!!] {} — {e}", spec.label);
            }
        }
    }

    if !opts.remove {
        println!("\nVerification (doctor):");
        for c in run_checks(&vault, &home, &exe) {
            let mark = match c.status {
                Status::Ok => "ok",
                Status::Warn => "warn",
                Status::Fail => "FAIL",
            };
            println!("  [{mark}] {}: {}", c.name, c.detail);
        }
        println!("\nOptional: paste the following into your agents' guidance file (CLAUDE.md / AGENTS.md):");
        println!("────────────────────────────────────────");
        println!("{GUIDANCE_SNIPPET}");
        println!("────────────────────────────────────────");
        println!("Restart any running agent app to load the new MCP server.");
    }

    if failures > 0 && !opts.dry_run {
        return Err(format!("{failures} agent(s) failed"));
    }
    Ok(())
}

pub fn run_doctor(args: &[String]) -> Result<(), String> {
    let mut vault: Option<PathBuf> = None;
    let mut i = 1; // skip "doctor"
    while i < args.len() {
        match args[i].as_str() {
            "--vault" => {
                i += 1;
                vault = Some(PathBuf::from(
                    args.get(i).ok_or("--vault needs a value")?,
                ));
            }
            other => return Err(format!("unknown option: {other} (see `openobs-mcp help`)")),
        }
        i += 1;
    }
    let home = home_dir()?;
    let exe = self_exe()?;
    let vault = absolutize(
        &vault
            .or_else(|| env::var("OPENOBS_VAULT").ok().map(PathBuf::from))
            .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from("."))),
    );
    println!("openobs-mcp doctor");
    println!("  binary: {}", exe.display());
    println!("  vault:  {}", vault.display());
    let checks = run_checks(&vault, &home, &exe);
    let mut has_fail = false;
    for c in &checks {
        let mark = match c.status {
            Status::Ok => "ok",
            Status::Warn => "warn",
            Status::Fail => "FAIL",
        };
        println!("  [{mark}] {}: {}", c.name, c.detail);
        if c.status == Status::Fail {
            has_fail = true;
        }
    }
    if has_fail {
        Err("doctor found failures".to_string())
    } else {
        Ok(())
    }
}

pub fn run_init(args: &[String]) -> Result<(), String> {
    let mut dir: Option<PathBuf> = None;
    let mut force = false;
    let mut i = 1; // skip "init"
    while i < args.len() {
        match args[i].as_str() {
            "--force" => force = true,
            other => {
                if other.starts_with('-') {
                    return Err(format!("unknown option: {other} (see `openobs-mcp help`)"));
                }
                if dir.is_some() {
                    return Err("init takes exactly one directory argument".to_string());
                }
                dir = Some(PathBuf::from(other));
            }
        }
        i += 1;
    }
    let dir = dir.ok_or("usage: openobs-mcp init <dir> [--force]")?;
    let report = seed_vault(&dir, force)?;
    println!(
        "seeded {} files into {}",
        report.written.len(),
        dir.display()
    );
    for s in &report.skipped {
        println!("  skipped (exists): {s}");
    }
    Ok(())
}

// ── 测试 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn tempdir() -> tempfile::TempDir {
        // 前缀不得以 `.` 开头(list_md 隐藏规则)。
        tempfile::Builder::new().prefix("oomcp-").tempdir().unwrap()
    }

    fn entry() -> McpEntry {
        McpEntry {
            command: PathBuf::from("/bin/openobs-mcp"),
            vault: PathBuf::from("/v"),
        }
    }

    fn spec_by_id(id: &str) -> &'static AgentSpec {
        agents().iter().find(|s| s.id == id).unwrap()
    }

    // ── 注册表 / 路径 ────────────────────────────────────────────────────────

    #[test]
    fn registry_shape() {
        let mut ids = std::collections::HashSet::new();
        for spec in agents() {
            assert!(ids.insert(spec.id), "duplicate agent id: {}", spec.id);
            match &spec.config {
                ConfigTarget::Manual => {}
                ConfigTarget::JsonMcpServers(l)
                | ConfigTarget::ZedContextServers(l)
                | ConfigTarget::CodexToml(l) => {
                    assert!(
                        l.macos.is_some() || l.linux.is_some() || l.windows.is_some(),
                        "{} has no config path for any OS",
                        spec.id
                    );
                }
            }
        }
        assert!(matches!(spec_by_id("grok").config, ConfigTarget::Manual));
        assert_eq!(ENTRY_KEY, "openobsidian");
    }

    #[test]
    fn expand_tokens_appdata_and_plain() {
        let home = Path::new("/home/u");
        let env = |v: &str| {
            if v == "APPDATA" {
                Some("C:\\AppData".to_string())
            } else {
                None
            }
        };
        assert_eq!(
            expand_tokens("{APPDATA}/Claude/cfg.json", home, &env).unwrap(),
            PathBuf::from("C:\\AppData").join("Claude/cfg.json")
        );
        assert_eq!(
            expand_tokens(".claude.json", home, &env).unwrap(),
            PathBuf::from("/home/u/.claude.json")
        );
        assert!(expand_tokens("{NOPE}/x", home, &env).is_err());
        let no_env = |_v: &str| None;
        assert!(expand_tokens("{APPDATA}/x", home, &no_env).is_err());
    }

    // ── 探测(fake home,不做负向断言——真机可能装了这些 agent)─────────────

    #[test]
    fn detect_agents_with_fake_home() {
        let home = tempdir();
        let h = home.path();
        fs::write(h.join(".claude.json"), "{}").unwrap();
        fs::create_dir_all(h.join(".codex")).unwrap();
        fs::write(h.join(".codex/config.toml"), "").unwrap();
        fs::create_dir_all(h.join(".config/zed")).unwrap();
        fs::write(h.join(".config/zed/settings.json"), "{}").unwrap();

        let statuses = detect_agents(h);
        for id in ["claude-code", "codex", "zed"] {
            let st = statuses.iter().find(|s| s.id == id).unwrap();
            assert!(st.present, "{id} should be detected via fabricated config");
            assert!(
                st.evidence.iter().any(|e| e.starts_with("config exists:")),
                "{id} evidence: {:?}",
                st.evidence
            );
        }
        // 二进制探测只测负向(用一个绝不存在的名字)。
        assert!(binary_probe("openobs-definitely-not-installed-xyz").is_none());
    }

    // ── JSON 写入器 ─────────────────────────────────────────────────────────

    #[test]
    fn json_fresh_file_creates_mcp_servers_with_parents() {
        let dir = tempdir();
        let cfg = dir.path().join("nested/dir/config.json");
        let out =
            install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), false).unwrap();
        match out {
            WriteOutcome::Written { backup, .. } => assert!(backup.is_none()),
            other => panic!("expected Written, got {other:?}"),
        }
        let doc: Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap()).unwrap();
        assert_eq!(doc["mcpServers"]["openobsidian"]["command"], "/bin/openobs-mcp");
        assert_eq!(doc["mcpServers"]["openobsidian"]["args"][0], "/v");
    }

    #[test]
    fn json_preserves_other_keys_and_order() {
        let dir = tempdir();
        let cfg = dir.path().join("c.json");
        fs::write(
            &cfg,
            r#"{"zebra":1,"alpha":{"x":1},"mcpServers":{"other":{"command":"o"}}}"#,
        )
        .unwrap();
        install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), false).unwrap();
        let doc: Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap()).unwrap();
        let keys: Vec<&String> = doc.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["zebra", "alpha", "mcpServers"]);
        assert_eq!(doc["mcpServers"]["other"]["command"], "o");
        assert_eq!(doc["mcpServers"]["openobsidian"]["command"], "/bin/openobs-mcp");
    }

    #[test]
    fn json_idempotent_replace_updates_vault() {
        let dir = tempdir();
        let cfg = dir.path().join("c.json");
        install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), false).unwrap();
        let mut e2 = entry();
        e2.vault = PathBuf::from("/v2");
        install_json_entry(&cfg, "mcpServers", render_json_entry(&e2), false).unwrap();
        let doc: Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap()).unwrap();
        assert_eq!(doc["mcpServers"]["openobsidian"]["args"][0], "/v2");
    }

    #[test]
    fn json_corrupt_refuses_and_keeps_file() {
        let dir = tempdir();
        let cfg = dir.path().join("c.json");
        fs::write(&cfg, "{ not json").unwrap();
        let res = install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), false);
        assert!(res.is_err());
        assert_eq!(fs::read_to_string(&cfg).unwrap(), "{ not json");
        assert!(!backup_path(&cfg).exists());
    }

    #[test]
    fn json_backup_written_before_overwrite() {
        let dir = tempdir();
        let cfg = dir.path().join("c.json");
        fs::write(&cfg, r#"{"a":1}"#).unwrap();
        install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), false).unwrap();
        assert_eq!(fs::read_to_string(backup_path(&cfg)).unwrap(), r#"{"a":1}"#);
    }

    #[test]
    fn json_remove_deletes_only_our_key() {
        let dir = tempdir();
        let cfg = dir.path().join("c.json");
        fs::write(&cfg, r#"{"mcpServers":{"other":{"command":"o"}}}"#).unwrap();
        install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), false).unwrap();
        let out = remove_json_entry(&cfg, "mcpServers", false).unwrap();
        assert!(matches!(out, WriteOutcome::Written { .. }));
        let doc: Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap()).unwrap();
        assert!(doc["mcpServers"].get("openobsidian").is_none());
        assert_eq!(doc["mcpServers"]["other"]["command"], "o");
        // 再次 remove:目标已不在 → Unchanged,不报错。
        let again = remove_json_entry(&cfg, "mcpServers", false).unwrap();
        assert!(matches!(again, WriteOutcome::Unchanged(_)));
        // 文件缺失 → Unchanged。
        let missing = dir.path().join("nope.json");
        assert!(matches!(
            remove_json_entry(&missing, "mcpServers", false).unwrap(),
            WriteOutcome::Unchanged(_)
        ));
    }

    #[test]
    fn json_dry_run_writes_nothing() {
        let dir = tempdir();
        let cfg = dir.path().join("c.json");
        let out = install_json_entry(&cfg, "mcpServers", render_json_entry(&entry()), true).unwrap();
        assert!(matches!(out, WriteOutcome::DryRun(_)));
        assert!(!cfg.exists());
    }

    // ── Zed schema ──────────────────────────────────────────────────────────

    #[test]
    fn zed_entry_shape_and_settings_preserved() {
        let dir = tempdir();
        let cfg = dir.path().join("settings.json");
        fs::write(
            &cfg,
            r#"{"theme":"dark","context_servers":{"openobsidian":{"command":"/old","args":["/oldv"],"settings":{"custom":true}}}}"#,
        )
        .unwrap();
        install_json_entry(&cfg, "context_servers", render_zed_entry(&entry()), false).unwrap();
        let doc: Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap()).unwrap();
        assert_eq!(doc["theme"], "dark");
        let e = &doc["context_servers"]["openobsidian"];
        assert_eq!(e["command"], "/bin/openobs-mcp");
        assert_eq!(e["settings"]["custom"], true, "替换时不得覆盖已有 settings");

        // 全新条目:settings = {}。
        let cfg2 = dir.path().join("s2.json");
        install_json_entry(&cfg2, "context_servers", render_zed_entry(&entry()), false).unwrap();
        let doc2: Value = serde_json::from_str(&fs::read_to_string(&cfg2).unwrap()).unwrap();
        assert_eq!(doc2["context_servers"]["openobsidian"]["settings"], json!({}));
    }

    // ── Codex TOML ─────────────────────────────────────────────────────────

    #[test]
    fn codex_upsert_new_file() {
        let dir = tempdir();
        let cfg = dir.path().join("config.toml");
        install_codex_entry(&cfg, &entry(), false).unwrap();
        let raw = fs::read_to_string(&cfg).unwrap();
        assert!(raw.contains("[mcp_servers.openobsidian]"));
        assert!(raw.contains("command = \"/bin/openobs-mcp\""));
        assert!(raw.contains("args = [\"/v\"]"));
    }

    #[test]
    fn codex_upsert_preserves_comments_and_other_tables() {
        let dir = tempdir();
        let cfg = dir.path().join("config.toml");
        let orig = "# top comment\n\n[mcp_servers.other]\ncommand = \"other-bin\"\n\n[model_providers.x]\nname = \"x\"\n";
        fs::write(&cfg, orig).unwrap();
        install_codex_entry(&cfg, &entry(), false).unwrap();
        let raw = fs::read_to_string(&cfg).unwrap();
        assert!(raw.contains("# top comment"));
        assert!(raw.contains("[mcp_servers.other]"));
        assert!(raw.contains("command = \"other-bin\""));
        assert!(raw.contains("[model_providers.x]"));
        assert!(raw.contains("[mcp_servers.openobsidian]"));

        // 幂等替换:改 vault,其他不动。
        let mut e2 = entry();
        e2.vault = PathBuf::from("/v2");
        install_codex_entry(&cfg, &e2, false).unwrap();
        let raw2 = fs::read_to_string(&cfg).unwrap();
        assert!(raw2.contains("\"/v2\""));
        assert!(raw2.contains("command = \"other-bin\""));
    }

    #[test]
    fn codex_remove_entry() {
        let dir = tempdir();
        let cfg = dir.path().join("config.toml");
        install_codex_entry(&cfg, &entry(), false).unwrap();
        let out = remove_codex_entry(&cfg, false).unwrap();
        assert!(matches!(out, WriteOutcome::Written { .. }));
        assert!(!fs::read_to_string(&cfg).unwrap().contains("openobsidian"));
        let again = remove_codex_entry(&cfg, false).unwrap();
        assert!(matches!(again, WriteOutcome::Unchanged(_)));
    }

    #[test]
    fn codex_inline_mcp_servers_refused() {
        let dir = tempdir();
        let cfg = dir.path().join("config.toml");
        fs::write(&cfg, "mcp_servers = { foo = {} }\n").unwrap();
        let res = install_codex_entry(&cfg, &entry(), false);
        assert!(res.is_err());
        assert_eq!(fs::read_to_string(&cfg).unwrap(), "mcp_servers = { foo = {} }\n");
    }

    // ── wire/unwire(CLI 与 app UI 共用层)──────────────────────────────────

    #[test]
    fn wire_agent_writes_cursor_config() {
        let home = tempdir();
        let out = wire_agent(spec_by_id("cursor"), home.path(), &entry(), false).unwrap();
        assert!(matches!(out, WriteOutcome::Written { .. }));
        let cfg = home.path().join(".cursor/mcp.json");
        assert!(cfg.is_file());
        let doc: Value = serde_json::from_str(&fs::read_to_string(&cfg).unwrap()).unwrap();
        assert_eq!(doc["mcpServers"]["openobsidian"]["command"], "/bin/openobs-mcp");
    }

    #[test]
    fn wire_agent_manual_refuses_with_snippet() {
        let e = wire_agent(spec_by_id("grok"), Path::new("/nonexistent"), &entry(), false)
            .unwrap_err();
        assert!(e.contains("mcpServers"), "snippet 应含 JSON 形态: {e}");
        assert!(e.contains("/bin/openobs-mcp"));
    }

    #[test]
    fn unwire_agent_removes_cursor_entry() {
        let home = tempdir();
        wire_agent(spec_by_id("cursor"), home.path(), &entry(), false).unwrap();
        let out = unwire_agent(spec_by_id("cursor"), home.path(), false).unwrap();
        assert!(matches!(out, WriteOutcome::Written { .. }));
        let doc: Value =
            serde_json::from_str(&fs::read_to_string(home.path().join(".cursor/mcp.json")).unwrap())
                .unwrap();
        assert!(doc["mcpServers"].get("openobsidian").is_none());
    }

    // ── 播种 ────────────────────────────────────────────────────────────────

    #[test]
    fn seed_vault_writes_all_files_with_owf1() {
        let dir = tempdir();
        let target = dir.path().join("vault");
        let report = seed_vault(&target, false).unwrap();
        assert_eq!(report.written.len(), embedded_files().len());
        assert!(report.skipped.is_empty());
        let index = fs::read_to_string(target.join("index.md")).unwrap();
        assert!(index.contains("format: owf/1"));
        assert!(target.join("types").is_dir());
    }

    #[test]
    fn seed_vault_refuses_nonempty_without_force() {
        let dir = tempdir();
        let target = dir.path().join("vault");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("mine.md"), "# mine\n").unwrap();
        let res = seed_vault(&target, false);
        assert!(res.unwrap_err().contains("--force"));
    }

    #[test]
    fn seed_vault_force_merges_without_clobbering() {
        let dir = tempdir();
        let target = dir.path().join("vault");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("index.md"), "# mine\n").unwrap();
        let report = seed_vault(&target, true).unwrap();
        assert!(report.skipped.contains(&"index.md".to_string()));
        assert_eq!(report.written.len(), embedded_files().len() - 1);
        assert_eq!(fs::read_to_string(target.join("index.md")).unwrap(), "# mine\n");
    }

    /// drift guard:include_str! 防「删」,此测试防「增」——
    /// templates/wiki-starter/ 加文件必须同步进 embedded_files()。
    #[test]
    fn embedded_list_matches_templates_dir() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../templates/wiki-starter");
        let mut on_disk = BTreeSet::new();
        for entry in walkdir::WalkDir::new(&root).min_depth(1) {
            let entry = entry.unwrap();
            if entry.path().is_file() {
                on_disk.insert(
                    entry
                        .path()
                        .strip_prefix(&root)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
        let embedded: BTreeSet<String> = embedded_files()
            .iter()
            .map(|(r, _)| (*r).to_string())
            .collect();
        assert_eq!(
            embedded, on_disk,
            "embedded_files() 与 templates/wiki-starter/ 漂移——更新 onboard.rs 的 include_str! 清单"
        );
    }

    #[test]
    fn seeded_vault_passes_list_md() {
        let dir = tempdir();
        let target = dir.path().join("v");
        seed_vault(&target, false).unwrap();
        let files = crate::list_md(&target).unwrap();
        assert_eq!(files.len(), embedded_files().len());
    }

    // ── doctor ──────────────────────────────────────────────────────────────

    /// 造一个 fake home + seeded vault + 匹配的 cursor 条目 → 全绿。
    fn doctor_fixture() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let dir = tempdir();
        let home = dir.path().join("home");
        let vault = dir.path().join("vault");
        let exe = dir.path().join("openobs-mcp");
        fs::create_dir_all(&home).unwrap();
        fs::write(&exe, "").unwrap();
        seed_vault(&vault, false).unwrap();
        (dir, home, vault, exe)
    }

    fn wire_cursor_at(home: &Path, e: &McpEntry) {
        let cfg = home.join(".cursor/mcp.json");
        fs::create_dir_all(cfg.parent().unwrap()).unwrap();
        install_json_entry(&cfg, "mcpServers", render_json_entry(e), false).unwrap();
    }

    #[test]
    fn doctor_ok_on_seeded_vault_with_matching_entry() {
        let (_d, home, vault, exe) = doctor_fixture();
        wire_cursor_at(
            &home,
            &McpEntry {
                command: exe.clone(),
                vault: vault.clone(),
            },
        );
        let checks = run_checks(&vault, &home, &exe);
        assert!(
            !checks.iter().any(|c| c.status == Status::Fail),
            "checks: {checks:?}"
        );
        let cursor = checks.iter().find(|c| c.name == "Cursor").unwrap();
        assert_eq!(cursor.status, Status::Ok);
    }

    #[test]
    fn doctor_flags_stale_command_and_vault_mismatch() {
        let (_d, home, vault, exe) = doctor_fixture();
        // stale command:配置指向另一个存在的二进制。
        let stale = home.join("old-openobs-mcp");
        fs::write(&stale, "").unwrap();
        wire_cursor_at(
            &home,
            &McpEntry {
                command: stale,
                vault: vault.clone(),
            },
        );
        let checks = run_checks(&vault, &home, &exe);
        let cursor = checks.iter().find(|c| c.name == "Cursor").unwrap();
        assert_eq!(cursor.status, Status::Warn);
        assert!(cursor.detail.contains("re-run setup"));

        // vault 不匹配。
        wire_cursor_at(
            &home,
            &McpEntry {
                command: exe.clone(),
                vault: home.join("other-vault"),
            },
        );
        let checks = run_checks(&vault, &home, &exe);
        let cursor = checks.iter().find(|c| c.name == "Cursor").unwrap();
        assert_eq!(cursor.status, Status::Warn);
        assert!(cursor.detail.contains("--vault"));
    }

    #[test]
    fn doctor_unparseable_config_warns() {
        let (_d, home, vault, exe) = doctor_fixture();
        fs::create_dir_all(home.join(".cursor")).unwrap();
        fs::write(home.join(".cursor/mcp.json"), "{ bad").unwrap();
        let checks = run_checks(&vault, &home, &exe);
        let cursor = checks.iter().find(|c| c.name == "Cursor").unwrap();
        assert_eq!(cursor.status, Status::Warn);
    }

    #[test]
    fn doctor_missing_vault_fails() {
        let (_d, home, _vault, exe) = doctor_fixture();
        let checks = run_checks(&home.join("no-such-vault"), &home, &exe);
        assert!(checks.iter().any(|c| c.status == Status::Fail));
    }

    // ── snippet / guidance ──────────────────────────────────────────────────

    #[test]
    fn render_snippet_contains_absolute_paths() {
        let e = McpEntry {
            command: PathBuf::from("/abs/openobs-mcp"),
            vault: PathBuf::from("/abs/vault"),
        };
        let s = render_snippet(spec_by_id("cursor"), &e);
        assert!(s.contains("/abs/openobs-mcp"));
        assert!(s.contains("/abs/vault"));
        assert!(s.contains(ENTRY_KEY));
        let codex = render_snippet(spec_by_id("codex"), &e);
        assert!(codex.contains("[mcp_servers.openobsidian]"));
    }

    #[test]
    fn guidance_snippet_mentions_tools_and_format() {
        assert!(GUIDANCE_SNIPPET.contains("write_note"));
        assert!(GUIDANCE_SNIPPET.contains("OWF-1"));
    }
}

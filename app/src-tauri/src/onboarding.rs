//! Agent 记忆接入(B-MCP-ONBOARD 桌面侧)—— `openobs_mcp::onboard` 的薄胶水。
//!
//! CLI(`openobs-mcp setup/doctor/init`)与这组命令共享同一套逻辑,UI 只是表单。
//! 所有写操作走 onboard 的安全护栏(备份 / 原子写 / 拒碰不可解析文件);
//! 本模块不复制任何接线逻辑。
//!
//! app 进程 ≠ openobs-mcp 进程:MCP 条目的 `command` 需要 mcp 二进制路径,
//! 由 [`resolve_mcp_binary_from`] 定位(当前 exe 同目录 → PATH → UI 手选)。

use std::path::{Path, PathBuf};

use openobs_mcp::onboard;
use serde::Serialize;

/// UI 面板里的 agent 行。
#[derive(Serialize)]
pub struct AgentRow {
    pub id: String,
    pub label: String,
    /// 检测到已安装(任一硬证据命中)。
    pub present: bool,
    pub evidence: Vec<String>,
    pub hints: Vec<String>,
    pub config_path: Option<String>,
    pub note: String,
    /// 无自动接线面(只给 snippet)。
    pub manual_only: bool,
    /// 已接线时:条目里的 command 路径。
    pub wired_command: Option<String>,
    /// 已接线时:条目里的 vault。
    pub wired_vault: Option<String>,
    /// 配置文件存在但不可解析/不可读(展示原因,不触碰文件)。
    pub config_error: Option<String>,
}

#[derive(Serialize)]
pub struct ScanOut {
    pub home: String,
    /// 自动解析到的 openobs-mcp 二进制路径;null = 需用户手选。
    pub resolved_binary: Option<String>,
    pub agents: Vec<AgentRow>,
    /// 可粘贴进 agent 指引文件的引导文本(UI 提供复制按钮,绝不自动写入)。
    pub guidance: String,
}

#[tauri::command]
pub fn onboard_scan() -> Result<ScanOut, String> {
    let home = onboard::home_dir()?;
    let mut agents: Vec<AgentRow> = Vec::new();
    for status in onboard::detect_agents(&home) {
        let spec = onboard::agents()
            .iter()
            .find(|s| s.id == status.id)
            .expect("registry id mismatch");
        let manual_only = matches!(spec.config, onboard::ConfigTarget::Manual);
        let (wired_command, wired_vault, config_error) =
            match onboard::read_agent_entry(spec, &home) {
                Ok(Some(w)) => (
                    Some(w.command.to_string_lossy().into_owned()),
                    Some(w.vault.to_string_lossy().into_owned()),
                    None,
                ),
                Ok(None) => (None, None, None),
                Err(e) => (None, None, Some(e)),
            };
        agents.push(AgentRow {
            id: status.id,
            label: status.label,
            present: status.present,
            evidence: status.evidence,
            hints: status.hints,
            config_path: status.config_path.map(|p| p.to_string_lossy().into_owned()),
            note: status.note,
            manual_only,
            wired_command,
            wired_vault,
            config_error,
        });
    }
    Ok(ScanOut {
        home: home.to_string_lossy().into_owned(),
        resolved_binary: resolve_mcp_binary().map(|p| p.to_string_lossy().into_owned()),
        agents,
        guidance: onboard::GUIDANCE_SNIPPET.to_string(),
    })
}

/// 定位 openobs-mcp 二进制(纯函数,`app_exe` 注入以便测试):
/// 1. 当前 exe 的同目录(workspace 里 target/{debug,release} 两个二进制并排);
/// 2. PATH 上的 `openobs-mcp`(`which`);
/// 3. 都没有 → None,UI 走手选。
pub fn resolve_mcp_binary_from(app_exe: &Path) -> Option<PathBuf> {
    let exe = app_exe.canonicalize().unwrap_or_else(|_| app_exe.to_path_buf());
    if let Some(dir) = exe.parent() {
        let candidate = dir.join("openobs-mcp");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    which::which("openobs-mcp").ok()
}

fn resolve_mcp_binary() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    resolve_mcp_binary_from(&exe)
}

/// 单 agent 操作回执(接入 / 拆线共用)。
#[derive(Serialize)]
pub struct AgentActionResult {
    pub id: String,
    pub ok: bool,
    pub message: String,
}

fn to_action_result(id: &str, res: Result<String, String>) -> AgentActionResult {
    match res {
        Ok(message) => AgentActionResult {
            id: id.into(),
            ok: true,
            message,
        },
        Err(message) => AgentActionResult {
            id: id.into(),
            ok: false,
            message,
        },
    }
}

/// 把 openobs-mcp 接入所选 agent(写各家 MCP 配置;护栏在 onboard)。
/// `dry_run=true` 只报告将执行的操作,不落盘。
#[tauri::command]
pub fn onboard_apply(
    binary: String,
    vault: String,
    agent_ids: Vec<String>,
    dry_run: Option<bool>,
) -> Result<Vec<AgentActionResult>, String> {
    if binary.trim().is_empty() {
        return Err("openobs-mcp binary path is required".into());
    }
    if vault.trim().is_empty() {
        return Err("vault path is required".into());
    }
    let home = onboard::home_dir()?;
    let entry = onboard::McpEntry {
        command: PathBuf::from(binary),
        vault: PathBuf::from(vault),
    };
    let mut out = Vec::new();
    for spec in onboard::agents() {
        if !agent_ids.iter().any(|id| id == spec.id) {
            continue;
        }
        let res = onboard::wire_agent(spec, &home, &entry, dry_run.unwrap_or(false))
            .map(|o| o.describe());
        out.push(to_action_result(spec.id, res));
    }
    Ok(out)
}

/// 拆线:只删各家配置里的 `openobsidian` 条目。
#[tauri::command]
pub fn onboard_remove(agent_ids: Vec<String>) -> Result<Vec<AgentActionResult>, String> {
    let home = onboard::home_dir()?;
    let mut out = Vec::new();
    for spec in onboard::agents() {
        if !agent_ids.iter().any(|id| id == spec.id) {
            continue;
        }
        let res = onboard::unwire_agent(spec, &home, false).map(|o| o.describe());
        out.push(to_action_result(spec.id, res));
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct OnboardCheck {
    pub name: String,
    /// "ok" | "warn" | "fail"
    pub status: String,
    pub detail: String,
}

/// 接线健康诊断(与 `openobs-mcp doctor` 同一份 [`onboard::run_checks`])。
#[tauri::command]
pub fn onboard_doctor(vault: String, binary: Option<String>) -> Result<Vec<OnboardCheck>, String> {
    let home = onboard::home_dir()?;
    let exe = binary
        .filter(|b| !b.trim().is_empty())
        .map(PathBuf::from)
        .or_else(resolve_mcp_binary)
        .ok_or_else(|| "cannot locate openobs-mcp binary".to_string())?;
    Ok(onboard::run_checks(&PathBuf::from(vault), &home, &exe)
        .into_iter()
        .map(|c| OnboardCheck {
            name: c.name,
            status: match c.status {
                onboard::Status::Ok => "ok".into(),
                onboard::Status::Warn => "warn".into(),
                onboard::Status::Fail => "fail".into(),
            },
            detail: c.detail,
        })
        .collect())
}

#[derive(Serialize)]
pub struct SeedReportOut {
    pub written: Vec<String>,
    pub skipped: Vec<String>,
}

/// 播种 wiki-starter 模板(与 `openobs-mcp init` 同一份 [`onboard::seed_vault`])。
/// `force=true` 合并非空目录但永不覆盖已有文件。
#[tauri::command]
pub fn onboard_init(dir: String, force: Option<bool>) -> Result<SeedReportOut, String> {
    let report = onboard::seed_vault(&PathBuf::from(dir), force.unwrap_or(false))?;
    Ok(SeedReportOut {
        written: report.written,
        skipped: report.skipped,
    })
}

/// 引导文本(粘贴进 agent 的 CLAUDE.md / AGENTS.md 等;UI 只复制,绝不代写)。
#[tauri::command]
pub fn onboard_guidance() -> String {
    onboard::GUIDANCE_SNIPPET.to_string()
}

/// 重新解析 openobs-mcp 二进制(UI「重新检测」按钮)。
#[tauri::command]
pub fn onboard_resolve_binary() -> Option<String> {
    resolve_mcp_binary().map(|p| p.to_string_lossy().into_owned())
}

/// 手动选择 openobs-mcp 二进制(系统文件对话框)。
#[tauri::command]
pub async fn onboard_pick_binary(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().blocking_pick_file();
    Ok(file
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 同目录优先:fake app exe 旁放一个 openobs-mcp → 命中同目录。
    #[test]
    fn resolve_binary_prefers_sibling_of_app_exe() {
        let dir = tempfile::TempDir::new().unwrap();
        let app_exe = dir.path().join("openobs-app");
        std::fs::write(&app_exe, "").unwrap();
        std::fs::write(dir.path().join("openobs-mcp"), "").unwrap();
        let got = resolve_mcp_binary_from(&app_exe).expect("sibling should win");
        assert!(got.ends_with("openobs-mcp"), "got: {got:?}");
        assert_eq!(
            got.parent().unwrap(),
            dir.path().canonicalize().unwrap(),
            "应命中 app exe 同目录,而不是 PATH 上可能存在的其它副本"
        );
    }

    /// to_action_result:Ok/Err 映射不丢信息。
    #[test]
    fn action_result_mapping() {
        let ok = to_action_result("cursor", Ok("wrote".into()));
        assert!(ok.ok && ok.message == "wrote");
        let bad = to_action_result("grok", Err("manual".into()));
        assert!(!bad.ok && bad.message == "manual");
    }
}

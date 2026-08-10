//! open-llm-wiki-mcp 库面。
//!
//! - [`list_md`]:vault `.md` 枚举(与桌面 app 同一条隐藏规则),服务器与 onboarding 共用;
//! - [`onboard`]:本地 agent 探测与接线(B-MCP-ONBOARD)。CLI 子命令(setup / doctor / init)
//!   与桌面 app 的「Agent 记忆接入」面板共用同一套逻辑。

use std::path::Path;
use walkdir::WalkDir;

pub mod onboard;

/// 枚举 vault 下 `.md` 文件的相对路径(排序后)。
///
/// 跳过任何含 `.` 开头分量的路径(`.git` / `.open-llm-wiki` / `.trash` 等)——
/// 与桌面 app 的隐藏规则一致。
pub fn list_md(root: &Path) -> Result<Vec<String>, String> {
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

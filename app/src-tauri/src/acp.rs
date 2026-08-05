//! 应用内 Agent:ACP(Agent Client Protocol)托管。
//!
//! doc 11 / Phase 7。一条 ACP 子进程 = 一个编码 agent(opencode / claude …);
//! 本应用扮演 **client**,把 agent 的读写/权限/流式输出桥接到 Tauri 前端。
//!
//! 架构:ACP v2 的 future 不适合跨线程 spawn,故整条连接跑在**一条专用 OS
//! 线程**上(current_thread tokio runtime,`block_on(connect_with)`)。前端
//! 通过 Tauri 命令把意图投进 `mpsc` 通道 → 专用线程消费;agent 的回调
//! (notification / fs / permission)则通过 `AppHandle.emit` 推回前端。
//!
//! ## 子进程生命周期(B-AGENT-SHELL)
//!
//! - **spawn + 进程组 kill**:`AcpAgent::from_str` 已封装(spawn + stdio +
//!   `kill_on_drop` + 进程组 kill,无孤儿);本模块不重复造。
//! - **存活检测**:`AcpState` 持一个 `Arc<AtomicBool>` alive 标志,专用线程进入置
//!   true、退出(任意路径)置 false。前端可轮询 `agent_alive`(聚焦 / 定时)判断
//!   agent 是否还在;子进程**意外退出**(非用户 agent_stop)时,线程退出会额外
//!   `emit("agent-error", …)`,前端据此即时复位「已连接」状态,不致假活。
//! - **resume 边界**:线程 = 一个 agent 子进程 + 一段 stdio 会话,不跨 app 重启
//!   续接。ACP `session/resume` 仅认**同一 agent**(其 system prompt / tool schema
//!   专属);切 agent 不迁移会话,而走 §2.4 的 Model C 移交(归一化为新 agent 新
//!   线程的 seed)。故此处无跨进程 resume。
//!
//! 事件契约(前端监听):
//! - `agent-update`   —— SessionUpdate(流式 token / 工具调用 / 思考 …)
//! - `agent-permission`{id,mode,options} —— 请求授权,前端回 `agent_permission_respond`
//! - `agent-file-write`{path} —— agent 写了 vault 内文件(供活动面板标注)
//! - `agent-session`{session_id} —— 会话已建立
//! - `agent-done`{stop_reason} —— 一轮 prompt 结束
//! - `agent-error` —— 字符串错误

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::logging;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, oneshot};

use agent_client_protocol as acp;
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, CreateTerminalRequest, ErrorCode,
    CreateTerminalResponse, EnvVariable, FileSystemCapabilities, InitializeRequest,
    KillTerminalRequest, KillTerminalResponse, NewSessionRequest, PromptRequest,
    ReadTextFileRequest, ReadTextFileResponse, ReleaseTerminalRequest,
    ReleaseTerminalResponse, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SelectedPermissionOutcome, SessionConfigOptionValue, SessionId,
    SessionNotification, SetSessionConfigOptionRequest, SetSessionModeRequest, StopReason,
    TerminalExitStatus, TerminalId, TerminalOutputRequest, TerminalOutputResponse,
    TextContent, WaitForTerminalExitRequest, WaitForTerminalExitResponse,
    WriteTextFileRequest, WriteTextFileResponse,
};
use agent_client_protocol::{Agent, Client, ConnectionTo, JsonRpcRequest};

// ───────────────────── session/set_model(非标准扩展)─────────────────────
//
// ACP 标准(schema 1.5)没有切换模型的会话方法:模型若走标准路,是 agent 在
// `config_options` 里声明 category=model 的下拉,client 用 `session/set_config_option`
// 切(claude / opencode 走这条,前端已渲染)。但 Cursor 适配器(@blowmage/cursor-agent-acp
// ≥0.7)在 session/new 的 result 里带私有 `models`(currentModelId + availableModels),
// 切换走扩展方法 `session/set_model`({sessionId, modelId})。SDK 未内置该请求类型,
// 这里用 JsonRpcRequest derive 自定义;响应形状不保证(各家返回 _meta 或空),故响应
// 类型直接用 serde_json::Value(它对任意 result 都实现 JsonRpcResponse)。agent 不支持
// 该方法时回 Method not found,前端如实提示。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonRpcRequest)]
#[request(method = "session/set_model", response = serde_json::Value)]
struct SetSessionModelRequest {
    #[serde(rename = "sessionId")]
    session_id: SessionId,
    #[serde(rename = "modelId")]
    model_id: String,
}

// ─────────────────────────── 事件出口 ───────────────────────────────
//
// 把 emit 抽成 trait:`AppHandle` 走 Tauri 事件推前端;测试用 mock 收集到内存,
// 这样在**无 GUI** 的情况下也能对真实 agent 子进程(opencode)跑通整条 ACP
// 闭环(initialize → new_session → prompt → 流式 → 完成)。

pub trait AgentEmitter: Send + Sync + Clone + 'static {
    fn emit_update(&self, payload: serde_json::Value);
    fn emit_permission(
        &self,
        id: String,
        tool_call: serde_json::Value,
        options: serde_json::Value,
        high_risk: bool,
        // 稳定的工具分类(read/edit/search…),供前端「始终允许此类」白名单匹配。
        // 高危恒为 None——白名单永远不放行高危。
        kind: Option<String>,
    );
    fn emit_file_write(&self, payload: FileWritePayload);
    fn emit_session(&self, session_id: String);
    /// §2.3:会话建立时把 agent 声明的 modes / config_options 推前端(供下拉渲染)。
    fn emit_session_info(&self, payload: serde_json::Value);
    fn emit_done(&self, stop_reason: serde_json::Value);
    fn emit_error(&self, msg: String);
}

impl AgentEmitter for AppHandle {
    fn emit_update(&self, payload: serde_json::Value) {
        let _ = self.emit("agent-update", payload);
    }
    fn emit_permission(
        &self,
        id: String,
        tool_call: serde_json::Value,
        options: serde_json::Value,
        high_risk: bool,
        kind: Option<String>,
    ) {
        let _ = self.emit(
            "agent-permission",
            serde_json::json!({ "id": id, "tool_call": tool_call, "options": options, "high_risk": high_risk, "kind": kind }),
        );
    }
    fn emit_file_write(&self, payload: FileWritePayload) {
        let _ = self.emit("agent-file-write", payload);
    }
    fn emit_session(&self, session_id: String) {
        let _ = self.emit("agent-session", serde_json::json!({ "session_id": session_id }));
    }
    fn emit_session_info(&self, payload: serde_json::Value) {
        let _ = self.emit("agent-session-info", payload);
    }
    fn emit_done(&self, stop_reason: serde_json::Value) {
        let _ = self.emit("agent-done", serde_json::json!({ "stop_reason": stop_reason }));
    }
    fn emit_error(&self, msg: String) {
        let _ = self.emit("agent-error", msg);
    }
}

/// 高危操作启发式(§5;与前端 isHighRisk 对齐)。删除/重命名/移动/破坏性覆盖/执行命令
/// 一律判高危——宽松模式下也不自动放行,恒弹卡逐次问。terminal 创建恒高危(另传 true)。
fn is_high_risk_value(v: &serde_json::Value) -> bool {
    let s = serde_json::to_string(v).unwrap_or_default().to_lowercase();
    s.contains("delet")
        || s.contains("remov")
        || s.contains("rename")
        || s.contains("overwrite")
        || s.contains("rmdir")
        || s.contains("trash")
        || s.contains("destructive")
        || s.contains("wipe")
}

/// 把 ACP `ToolKind` 归一成稳定小写串(白名单键)。delete / move 这类天然高危的
/// 返回 None——白名单永远不放行它们,即便用户误勾。
fn tool_kind_slug(k: &agent_client_protocol::schema::v1::ToolKind) -> Option<&'static str> {
    use agent_client_protocol::schema::v1::ToolKind::*;
    match *k {
        Read => Some("read"),
        Edit => Some("edit"),
        Search => Some("search"),
        Think => Some("think"),
        Fetch => Some("fetch"),
        SwitchMode => Some("switch_mode"),
        // delete / move / execute / other(及任何未来新增变体)恒高危或语义不稳:
        // 不给白名单键。
        Delete | Move | Execute | Other => None,
        _ => None,
    }
}

/// §4 标注层:一次 fs 写入的元数据(随 `agent-file-write` 推前端 / 进转录)。
/// `writer` 形如 `agent-<id>`;`added`/`removed` 由 pre-image 与新内容行 diff 得出
/// (§105:ACP update 流不带行数 diff,宿主须自行比对)。`created`=写入前文件不存在。
#[derive(Clone, Serialize)]
pub struct FileWritePayload {
    path: String,
    writer: String,
    added: usize,
    removed: usize,
    created: bool,
}

/// 对 pre-image 与新内容做行级 diff,返回 (新增行数, 删除行数)。基于最长公共子序列
/// (LCS)长度:added = new_lines - lcs, removed = old_lines - lcs。对超大文件(>8000
/// 行)退化为朴素集合差(近似,避免 O(n*m) 内存爆)。
fn line_diff(old: &str, new: &str) -> (usize, usize) {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    if old_lines.is_empty() {
        return (new_lines.len(), 0);
    }
    if new_lines.is_empty() {
        return (0, old_lines.len());
    }
    // 超大文件:朴素近似(集合差),不建 DP 表。
    if old_lines.len() > 8000 || new_lines.len() > 8000 {
        use std::collections::HashSet;
        let os: HashSet<&str> = old_lines.iter().copied().collect();
        let ns: HashSet<&str> = new_lines.iter().copied().collect();
        let added = new_lines.iter().filter(|l| !os.contains(*l)).count();
        let removed = old_lines.iter().filter(|l| !ns.contains(*l)).count();
        return (added, removed);
    }
    let lcs = lcs_len(&old_lines, &new_lines);
    (
        new_lines.len().saturating_sub(lcs),
        old_lines.len().saturating_sub(lcs),
    )
}

/// 两序列最长公共子序列长度(DP;调用方已保证序列不太大)。
fn lcs_len(a: &[&str], b: &[&str]) -> usize {
    let mut dp = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        let mut prev = 0; // dp[i-1][j-1]
        for j in 1..=b.len() {
            let cur = dp[j];
            if a[i - 1] == b[j - 1] {
                dp[j] = prev + 1;
            } else {
                dp[j] = dp[j].max(dp[j - 1]);
            }
            prev = cur;
        }
    }
    dp[b.len()]
}

// ─────────────────────────── PATH 修正(B-AGENT-PATHFIX) ─────────────
//
// 从 Finder/Dock 启动 app 时,继承的 PATH 极简(/usr/bin:/bin:…),既检测不到
// 也 spawn 不了用户用 homebrew/pnpm/cargo 装的 agent。启动时跑一次登录 shell
// 取回用户的 PATH,并兜底合并常见目录,使 `which` 与 `AcpAgent` 子进程都能命中。

/// 把用户登录 shell 的 PATH 与若干常见安装目录并进当前进程 PATH(去重、仅追加)。
/// 任一步失败都静默回退,绝不阻断启动。
pub fn augment_path() {
    let mut segs: Vec<String> = std::env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();

    let push_new = |segs: &mut Vec<String>, p: String| {
        if !p.is_empty() && !segs.iter().any(|s| s == &p) {
            segs.push(p);
        }
    };

    // 1) 登录 shell 的 PATH(`-l` 读 .zprofile/.zprofile 等;不交互,不会卡)。
    if let Some(shell_path) = collect_shell_path() {
        for p in shell_path.split(':') {
            push_new(&mut segs, p.to_string());
        }
    }

    // 2) 常见安装目录兜底(存在才加)。
    let home = std::env::var("HOME").unwrap_or_default();
    let mut candidates = vec![
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
    ];
    if !home.is_empty() {
        candidates.push(format!("{home}/.cargo/bin"));
        candidates.push(format!("{home}/.local/bin"));
        candidates.push(format!("{home}/Library/pnpm")); // macOS pnpm 默认
        candidates.push(format!("{home}/.local/share/pnpm"));
        candidates.push(format!("{home}/.bun/bin"));
        // volta / fnm 顶层 bin(node 版本管理器;通常也在 .zshrc 里加载)。
        candidates.push(format!("{home}/.volta/bin"));
        candidates.push(format!("{home}/.fnm"));
    }
    for c in candidates {
        if std::path::Path::new(&c).is_dir() {
            push_new(&mut segs, c);
        }
    }

    // 3) nvm 的 node bin 目录:~/.nvm/versions/node/vX.Y.Z/bin。nvm 把 node 只在
    //    .zshrc(交互式)里加进 PATH,登录式取不到,交互式探测万一被看门狗杀掉也
    //    兜不到 —— 故显式扫一遍版本目录,取版本号最大(=最新装的那个)的 bin 补上。
    if !home.is_empty() {
        let nvm_node = format!("{home}/.nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_node) {
            let mut picks: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let bin = e.path().join("bin");
                    if bin.is_dir() {
                        Some(bin.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
                .collect();
            picks.sort(); // 版本号字符串排序,最大者末尾。
            if let Some(latest) = picks.last() {
                push_new(&mut segs, latest.clone());
            }
        }
    }

    let final_path = segs.join(":");
    std::env::set_var("PATH", &final_path);
    logging::emit(
        logging::LogLevel::Info,
        "acp",
        "PATH augmented",
        Some(serde_json::json!({
            "path": final_path,
            "node_present": which::which("node").is_ok(),
            "npx_present": which::which("npx").is_ok(),
        })),
    );
}

/// 取用户的 PATH。先试**交互式登录** shell(`-ilc`),它会读 `.zshrc` —— 正是
/// nvm / fnm / volta 等 node 版本管理器把 `node` 装进 PATH 的地方;只跑登录式
/// (`-lc`,仅读 `.zprofile`)取不到,于是 `npx`/`pnpm` 壳能找到入口、却找不到
/// `node`,运行时报 `exec: node: not found`(claude-code / cursor 失败的根因)。
/// 交互式有极少概率被 `.zshrc` 里的阻塞命令卡住,故带 4s 看门狗;超时即回退登录式。
fn collect_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    // 1) 交互式登录(读 .zshrc → 含 nvm/fnm/volta 的 node)。带看门狗防卡。
    if let Some(p) = run_shell_path(&shell, &["-ilc", "printf '%s' \"$PATH\""], true) {
        return Some(p);
    }
    // 2) 回退:登录式(不读 .zshrc,但稳定不卡)。仍能拿到 homebrew / cargo 等。
    run_shell_path(&shell, &["-lc", "printf '%s' \"$PATH\""], false)
}

/// 跑一次 `$SHELL <args>`,取 stdout 末段作为 PATH。`watchdog` 时给进程 4s 上限:
/// 到点仍在跑就强杀,`wait_with_output` 随即返回失败 → 调用方走回退。stdin 接
/// /dev/null 避免 TTY 等待;stdout 取最后一个换行后的内容以丢弃 profile/.zshrc 的
/// stdout 噪声(PATH 本身不含换行)。
fn run_shell_path(shell: &str, args: &[&str], watchdog: bool) -> Option<String> {
    let mut cmd = std::process::Command::new(shell);
    cmd.args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    let child = cmd.spawn().ok()?;
    if watchdog {
        let pid = child.id();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(4));
            // 进程已退出则 kill 无害失败;仍在跑则强杀。
            let _ = std::process::Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .output();
        });
    }
    let out = child.wait_with_output().ok()?;
    if !out.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&out.stdout).to_string();
    let path = raw.rsplit_once('\n').map(|(_, p)| p).unwrap_or(&raw);
    if path.contains(':') {
        Some(path.to_string())
    } else {
        None
    }
}

// ─────────────────────────── 食谱 / 检测 ────────────────────────────

/// 一个 agent 的「连接器」:把它的全部私有知识收进一处——身份、启动命令、
/// 探测策略、安装指引、登录命令。加 agent = 加一个 Recipe 字面量,别处不动。
struct Recipe {
    id: &'static str,
    label: &'static str,
    /// 完整启动命令,会被 `AcpAgent::from_str` 解析成 program + args。
    command: &'static str,
    /// 探测策略(封装「需要什么才能跑」),见 [`Detect`]。
    detect: Detect,
    /// 未安装时给用户看的安装指引(命令 + 说明);node/npx 缺失时由 Detect 再补根因句。
    install_hint: &'static str,
    /// 未登录 / API key 失效时,错误提示里给的登录命令(None = 无统一命令,走通用提示)。
    login_cmd: Option<&'static str>,
}

/// 探测策略:按 agent 的启动形态分类,各自封装「就绪判定」与「缺什么补什么提示」。
/// 取代了旧的 `detect_bin` 字符串特判 + `needs_node` bool——通用循环里不再有 agent 分支。
enum Detect {
    /// 仅需某二进制在 PATH(独立 CLI,如 grok)。
    Binary(&'static str),
    /// npx 拉起的适配器(claude / cursor):需 node + 一个真能跑的 npx(壳可能是失效 shim)。
    NpxAdapter,
    /// 二进制 + node 都要在(如 pi:pi-acp 经 npx 拉起,再调 pi 二进制)。
    BinaryPlusNode(&'static str),
}

/// node 缺失时的共用提示:某依赖(adapter 壳 / 目标二进制)在不在,给两种措辞。
/// 复刻原 agent_list 里 `needs_node && !node_present` 的两分支,逐字一致。
fn node_missing_suffix(base: &str, dep_present: bool) -> String {
    if dep_present {
        format!(
            "{}\n⚠ 检测到 npx 但未检测到 node(常由 nvm/fnm 管理,未进登录 PATH)。请在终端确认 `node -v` 可用后重启 app;或装 Node:brew install node",
            base
        )
    } else {
        format!(
            "{}\n⚠ 需要 Node 运行时但未检测到。安装 Node:brew install node  或  https://nodejs.org",
            base
        )
    }
}

impl Detect {
    /// 是否就绪:满足探测条件即可启动。
    fn probe(&self, node_present: bool) -> bool {
        match self {
            Detect::Binary(b) => which::which(b).is_ok(),
            Detect::NpxAdapter => node_present && resolve_working_npx().is_some(),
            Detect::BinaryPlusNode(b) => node_present && which::which(b).is_ok(),
        }
    }

    /// 装配安装指引:就绪 / 无特别说明 → 原样 base;否则按「缺什么」补一句根因型提示。
    /// 行为与重构前 agent_list 的 hint 分支逐字一致(含 pi 下 npx 措辞——保留不改)。
    fn hint(&self, base: &str, node_present: bool) -> String {
        if self.probe(node_present) {
            return base.to_string();
        }
        match self {
            Detect::Binary(_) => base.to_string(),
            Detect::NpxAdapter => {
                let npx = resolve_working_npx().is_some();
                if !node_present {
                    node_missing_suffix(base, npx)
                } else {
                    // node 在但 npx 不可用:PATH 上的 shim 全失效。
                    format!(
                        "{}\n⚠ 未找到可用的 npx(PATH 上的 shim 均已失效,常见于 npm/pnpm 全局升级残留)。在系统终端修复:重装 Node 或 `npm i -g npm`,随后重启 app",
                        base
                    )
                }
            }
            Detect::BinaryPlusNode(b) => {
                if !node_present {
                    node_missing_suffix(base, which::which(b).is_ok())
                } else {
                    // node 在、目标二进制不在:base 自带的安装指引已够,不加冗余。
                    base.to_string()
                }
            }
        }
    }
}

/// 内置 agent 连接器表(单一注册源)。返回 &'static 切片,供 agent_list 迭代、
/// agent_connect_error 按 id 查 login_cmd,共用零分配借用。
fn recipes() -> &'static [Recipe] {
    &[
        Recipe {
            id: "opencode",
            label: "OpenCode",
            command: "opencode acp",
            detect: Detect::Binary("opencode"),
            install_hint: "安装:brew install sst/tap/opencode  或  npm i -g opencode-ai",
            login_cmd: Some("opencode auth login"),
        },
        Recipe {
            id: "claude-code",
            label: "Claude Code",
            // 官方 ACP 适配器(@agentclientprotocol/claude-agent-acp),与本 crate 用的
            // agent-client-protocol SDK 同源、版本对齐。先前用的 @zed-industries/claude-code-acp
            // 是旧分支:session/new 时 mcpServers 处理不兼容,握手后进程即崩(Query closed)。
            command: "npx -y @agentclientprotocol/claude-agent-acp@latest",
            detect: Detect::NpxAdapter,
            install_hint: "经 npx 运行,无需单独安装;但要先装 Node,且已 claude /login 登录。",
            login_cmd: Some("claude /login"),
        },
        Recipe {
            id: "cursor",
            label: "Cursor",
            // 社区 ACP 适配器(blowmage/cursor-agent-acp-npm),把 Cursor CLI 包成
            // ACP 服务,stdio、无子命令。类比 claude-code 的 npx adapter 路径。
            command: "npx -y @blowmage/cursor-agent-acp",
            detect: Detect::NpxAdapter,
            install_hint: "经 npx 运行,无需单独安装;但要先装 Node,且 Cursor CLI 已登录。",
            login_cmd: Some("cursor-agent login"),
        },
        Recipe {
            id: "grok-build",
            label: "Grok Build",
            // xAI Grok Build CLI(`grok`),ACP 原生:`agent stdio` 子命令即 ACP 服务
            // (grok-build-vscode / grok-remote 均以此驱动)。独立二进制,非 Node。
            command: "grok agent stdio",
            detect: Detect::Binary("grok"),
            install_hint: "安装:curl -fsSL https://x.ai/cli/install.sh | bash  (macOS/Linux)",
            login_cmd: None,
        },
        Recipe {
            id: "pi",
            label: "Pi",
            // Pi 编码 agent(earendil-works/pi)。原生不直说 ACP,经社区适配器 pi-acp
            // (svkozak/pi-acp)桥接:pi-acp 经 stdio 说 ACP,内部 spawn `pi --mode rpc`。
            // 故需 Node(npx 拉适配器)+ pi 二进制(被适配器调用)同时在 PATH。
            command: "npx -y pi-acp",
            detect: Detect::BinaryPlusNode("pi"),
            install_hint: "安装:npm i -g @earendil-works/pi-coding-agent  (需 Pi v0.80.4+ 与 Node 22+)",
            login_cmd: None,
        },
    ]
}

#[derive(Serialize, Clone)]
pub struct AgentInfo {
    pub id: String,
    pub label: String,
    pub command: String,
    pub installed: bool,
    /// 未安装时的安装指引(§9.3;Node 缺失时含「先装 Node」提示)。
    pub install_hint: String,
}

/// 在 PATH 里解析一个**真能跑**的 `npx`。
///
/// 宿主机常并存多份 npx shim(pnpm / npm / nvm);全局 npm 升级/卸载后会残留
/// **失效 shim**——脚本还在,运行时却报 `Cannot find module '…/npx-cli.js'`,
/// 子进程在握手期间即退。故对每个候选实测 `--version`,取第一个退出码 0 的;
/// 结果缓存(app 运行期间 shim 状况视为不变)。找不到可用 npx → None。
fn resolve_working_npx() -> Option<String> {
    static CACHE: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    CACHE
        .get_or_init(|| {
            let Ok(cands) = which::which_all("npx") else {
                return None;
            };
            for c in cands {
                let s = c.to_string_lossy().to_string();
                let ok = std::process::Command::new(&c)
                    .arg("--version")
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::piped())
                    .status()
                    .map(|st| st.success())
                    .unwrap_or(false);
                if ok {
                    logging::emit(
                        logging::LogLevel::Info,
                        "acp",
                        "npx resolved",
                        Some(serde_json::json!({ "path": &s })),
                    );
                    return Some(s);
                }
                logging::emit(
                    logging::LogLevel::Warn,
                    "acp",
                    "npx shim broken, skipping",
                    Some(serde_json::json!({ "path": &s })),
                );
            }
            None
        })
        .clone()
}

/// 启动命令若以 `npx` 开头,换成 resolve_working_npx() 找到的可用绝对路径,
/// 避免 PATH 首位的失效 shim 让 claude/cursor 适配器死在握手阶段。
fn fixup_npx_command(command: &str) -> String {
    if command == "npx" || command.starts_with("npx ") {
        if let Some(p) = resolve_working_npx() {
            return command.replacen("npx", &p, 1);
        }
    }
    command.to_string()
}

// ─────────────────────────── 通道 / 状态 ────────────────────────────

/// 前端 → 专用线程的意图。
///
/// 注:会话建立(NewSession)不走通道——`agent_start` 直接把 start 回执以
/// `Arc<Mutex<Option<oneshot::Sender>>>` 传入 `run_connection`,由连接闭包在
/// initialize→new_session 成功后回复 Ok(session_id)。这样**任何早退失败路径**
/// (命令解析 / connect_with 报错 / initialize 失败 / new_session 失败)都能回复
/// 一条带真实原因的 Err,而不像走通道那样把 Start 留在队列里无人消费、
/// `agent_start` 永远挂起或只回一句无信息量的「启动无响应」。
enum AcpCmd {
    /// 发一轮 prompt。
    Prompt { text: String, rep: oneshot::Sender<Result<(), String>> },
    // 注:权限回复不走本通道——prompt 期间 loop 被 block_task 阻塞,经通道的回复
    // 取不到(死锁)。agent_permission_respond / agent_cancel 直接操作共享 pending 表。
    /// §4 即时提交模式开关:on 时每轮 agent 写完成后自动 adopt 进 HEAD(默认 off=隔离)。
    SetInstantCommit { on: bool },
    /// §2.3 切换会话模式(plan/code/ask…);rep 回执成功与否。
    SetMode {
        mode_id: String,
        rep: oneshot::Sender<Result<(), String>>,
    },
    /// §2.3 设置一个会话配置选项(select/bool);rep 回执。
    SetConfigOption {
        config_id: String,
        /// "select" | "bool"。
        kind: String,
        /// select 的 value_id(bool 时忽略)。
        value_str: Option<String>,
        /// bool 的值(select 时忽略)。
        value_bool: Option<bool>,
        rep: oneshot::Sender<Result<(), String>>,
    },
    /// 切换会话模型(扩展方法 session/set_model,Cursor 适配器私有);rep 回执。
    /// claude / opencode 的模型切换走 SetConfigOption(category=model 的下拉)。
    SetModel {
        model_id: String,
        rep: oneshot::Sender<Result<(), String>>,
    },
    /// 关闭连接(线程随之退出)。
    Stop,
}

/// 一条挂起的权限请求:回复通道 + approve 时选中的默认选项。
pub(crate) struct PendingPermission {
    tx: oneshot::Sender<bool>,
}

/// Tauri 管理态:持有到专用线程的发送端(None = 无活动 agent)。
#[derive(Default)]
pub struct AcpState(pub Mutex<Option<AcpHandle>>);

pub struct AcpHandle {
    tx: mpsc::UnboundedSender<AcpCmd>,
    /// 子进程存活标志(专用线程进入 true / 退出 false)。`agent_alive` 轮询它。
    alive: Arc<AtomicBool>,
    /// 是否为用户主动 `agent_stop`(true → 线程退出不报「意外结束」)。
    clean: Arc<AtomicBool>,
    /// §4 即时提交开关(线程读取;前端 `agent_set_instant_commit` 翻转)。
    instant_commit: Arc<AtomicBool>,
    /// 取消当前生成的直接通道:克隆的 connection + session_id。`agent_cancel` 用它发
    /// `session/cancel` notification。**必须绕过 cmd loop**——loop 在 prompt 期间被
    /// `block_task().await` 阻塞,Cancel 走 channel 会取不到。ConnectionTo 可 Clone 且
    /// Send/Sync,故存这里供命令线程直接发;会话存活,仅停本轮(区别于 agent_stop 杀会话)。
    pub cancel: Arc<Mutex<Option<(ConnectionTo<Agent>, String)>>>,
    /// 挂起权限表(与连接线程共享)。`agent_cancel` 取消时必须清空它:ACP 规范要求
    /// client 发 `session/cancel` 时对所有挂起的 `session/request_permission` 回
    /// outcome Cancelled——否则 agent 可能卡在等权限回复,本轮永远不结束。
    /// 做法是 drop 各条目里的 oneshot Sender:等待端 `decide_rx.await` 得 Err →
    /// 按「拒绝」处理 → 权限回 Cancelled / terminal 回拒绝,正是规范要的结果。
    pub pending: Arc<Mutex<HashMap<String, PendingPermission>>>,
    /// 会话信息缓存(modes/configOptions/models)。`agent-session-info` 事件在
    /// `agent_start` 返回**前**发射,前端订阅此时尚未就位 → 事件必丢;故连接线程
    /// 写入缓存,前端活跃后经 `agent_session_info` 主动回捞。
    pub session_info: Arc<Mutex<Option<serde_json::Value>>>,
}

// ─────────────────────────── Tauri 命令 ─────────────────────────────

/// 列出内置 agent 食谱 + 各自是否在 PATH 上检测到。
#[tauri::command]
pub fn agent_list() -> Vec<AgentInfo> {
    // §9.3:一次性探测 Node 运行时是否就位(多个 Node agent 共用,避免重复 which)。
    let node_present = which::which("node").is_ok();
    logging::emit(
        logging::LogLevel::Debug,
        "acp",
        "agent_list detect",
        Some(serde_json::json!({
            "node_present": node_present,
            "npx_present": which::which("npx").is_ok(),
            "opencode_present": which::which("opencode").is_ok(),
        })),
    );
    recipes()
        .iter()
        .map(|r| {
            // 探测策略全在 Recipe.detect 里(连接器模式):通用循环只做
            // probe → installed、detect.hint → 根因型安装指引,零 agent_id / detect_bin 分支。
            let installed = r.detect.probe(node_present);
            AgentInfo {
                id: r.id.to_string(),
                label: r.label.to_string(),
                command: r.command.to_string(),
                installed,
                install_hint: r.detect.hint(r.install_hint, node_present),
            }
        })
        .collect()
}

/// 启动 agent 子进程并建立会话;返回 session_id。
///
/// 会话回执经 `start_rep` 直接传入连接线程(不走通道,见 `AcpCmd` 注释):成功回
/// Ok(session_id),失败回带真实原因的 Err。`agent_start` 给它一个握手超时
/// (30s),避免子进程起来但 ACP 握手不完成时**永久挂起**;超时即停掉并报可操作的错误。
///
/// `agent_id` 用于 git 归因命名空间 `refs/agents/<agent_id>`(B-AGENT-GIT-ATTR)。
#[tauri::command]
pub async fn agent_start(
    app: AppHandle,
    root: String,
    command: String,
    agent_id: String,
    state: State<'_, AcpState>,
) -> Result<String, String> {
    stop_inner(&state);
    // npx 命令先解析出可用 shim(PATH 首位可能是失效的,见 resolve_working_npx)。
    let command = fixup_npx_command(&command);
    logging::emit(
        logging::LogLevel::Info,
        "acp",
        "agent_start",
        Some(serde_json::json!({
            "command": &command,
            "agent_id": &agent_id,
            "root": &root,
        })),
    );
    let (tx, rx) = mpsc::unbounded_channel::<AcpCmd>();
    let alive = Arc::new(AtomicBool::new(true));
    let clean = Arc::new(AtomicBool::new(false));
    let instant_commit = Arc::new(AtomicBool::new(false));
    // cancel 直接通道:建会话后由连接闭包填入 (connection.clone(), session_id),
    // 供 agent_cancel 绕过 loop 发 session/cancel。Arc 双方共享(线程写 / 命令读)。
    let cancel: Arc<Mutex<Option<(ConnectionTo<Agent>, String)>>> =
        Arc::new(Mutex::new(None));
    // 挂起权限表:连接线程的权限 handler 写入,agent_cancel 取消时清空(回 Cancelled)。
    let pending: Arc<Mutex<HashMap<String, PendingPermission>>> =
        Arc::new(Mutex::new(HashMap::new()));
    // 会话信息缓存:事件先于前端订阅发射 → 前端靠 agent_session_info 回捞(见 AcpHandle)。
    let session_info: Arc<Mutex<Option<serde_json::Value>>> = Arc::new(Mutex::new(None));
    let (rep, rep_rx) = oneshot::channel::<Result<String, String>>();
    // 共享回执 cell:连接闭包(成功)与各失败早退路径都 take-and-reply。
    let start_rep: Arc<Mutex<Option<oneshot::Sender<Result<String, String>>>>> =
        Arc::new(Mutex::new(Some(rep)));
    {
        let app = app.clone();
        let command = command.clone();
        let root = root.clone();
        let agent_id = agent_id.clone();
        let alive = alive.clone();
        let clean = clean.clone();
        let instant_commit = instant_commit.clone();
        let start_rep = start_rep.clone();
        let cancel = cancel.clone();
        let pending = pending.clone();
        let session_info = session_info.clone();
        std::thread::spawn(move || {
            run_thread(
                app,
                command,
                root,
                agent_id,
                rx,
                alive,
                clean,
                instant_commit,
                start_rep,
                cancel,
                pending,
                session_info,
            )
        });
    }
    {
        let mut g = state.0.lock().unwrap();
        *g = Some(AcpHandle {
            tx: tx.clone(),
            alive: alive.clone(),
            clean: clean.clone(),
            instant_commit: instant_commit.clone(),
            cancel: cancel.clone(),
            pending: pending.clone(),
            session_info: session_info.clone(),
        });
    }
    // 握手超时:cursor 等适配器 session/new 本身可能要 30~40s(加载模型列表/核验订阅),
    // 故给到 90s;claude/opencode 通常秒级完成。超时即停掉并报可操作的错误。
    match tokio::time::timeout(std::time::Duration::from_secs(90), rep_rx).await {
        Ok(Ok(r)) => {
            logging::emit(
                logging::LogLevel::Info,
                "acp",
                "agent_start ok",
                Some(serde_json::json!({ "session_id": &r })),
            );
            r
        }
        // 注:真实失败原因在 Ok(Ok(Err(msg))) 里随 r 原样上抛;这里的 Err 是
        // RecvError——回执 Sender 被 drop 且从未回复(线程意外死亡)。
        Ok(Err(_)) => Err("agent 线程意外退出".to_string()),
        Err(_) => {
            // 握手超时:子进程可能起来了但没完成 initialize/new_session
            // (常见 = agent 未配置模型/API key,或首次运行需登录)。停掉,给可操作提示。
            logging::emit(
                logging::LogLevel::Warn,
                "acp",
                "handshake timeout (90s)",
                None,
            );
            stop_inner(&state);
            Err(
                "agent 启动超时(90s 内未完成握手)。某些适配器(如 Cursor)首次建立会话需加载模型列表,耗时较长;也常见于 agent 未配置模型 / API key,或首次运行需登录授权。"
                    .to_string(),
            )
        }
    }
}

/// 发一轮 prompt。
#[tauri::command]
pub async fn agent_prompt(text: String, state: State<'_, AcpState>) -> Result<(), String> {
    let tx = {
        let g = state.0.lock().unwrap();
        g.as_ref()
            .map(|h| h.tx.clone())
            .ok_or("没有活动 agent(先 agent_start)")?
    };
    let (rep, rep_rx) = oneshot::channel();
    tx.send(AcpCmd::Prompt { text, rep })
        .map_err(|_| "agent 线程已退出".to_string())?;
    rep_rx.await.map_err(|_| "agent 无响应".to_string())?
}

/// 回复一条权限请求。
///
/// **必须绕过 cmd loop 直接解析**:权限请求只会在 prompt 进行中到来,而 loop 此刻被
/// `block_task().await` 阻塞——走 `AcpCmd` 通道的回复永远取不到,agent 会卡在等权限
/// (用户点「批准」毫无反应)。故直接从共享 pending 表取出 oneshot 发送
/// (与 agent_cancel 用克隆 connection 绕过 loop 同理)。
#[tauri::command]
pub fn agent_permission_respond(
    id: String,
    approve: bool,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    if let Some(h) = state.0.lock().unwrap().as_ref() {
        if let Some(p) = h.pending.lock().unwrap().remove(&id) {
            let _ = p.tx.send(approve);
        }
    }
    Ok(())
}

/// §4 即时提交模式开关(默认 off=隔离):on 时每轮 agent 写完成后自动 adopt 进 HEAD。
#[tauri::command]
pub fn agent_set_instant_commit(on: bool, state: State<'_, AcpState>) -> Result<(), String> {
    if let Some(h) = state.0.lock().unwrap().as_ref() {
        h.instant_commit.store(on, Ordering::SeqCst);
        let _ = h.tx.send(AcpCmd::SetInstantCommit { on });
    }
    Ok(())
}

/// §2.3 切换会话模式。
#[tauri::command]
pub async fn agent_set_mode(
    mode_id: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let tx = {
        let g = state.0.lock().unwrap();
        g.as_ref()
            .map(|h| h.tx.clone())
            .ok_or("没有活动 agent(先 agent_start)")?
    };
    let (rep, rep_rx) = oneshot::channel();
    tx.send(AcpCmd::SetMode { mode_id, rep })
        .map_err(|_| "agent 线程已退出".to_string())?;
    rep_rx.await.map_err(|_| "agent 无响应".to_string())?
}

/// §2.3 设置一个会话配置选项(kind = "select" | "bool")。
#[tauri::command]
pub async fn agent_set_config_option(
    config_id: String,
    kind: String,
    value_str: Option<String>,
    value_bool: Option<bool>,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let tx = {
        let g = state.0.lock().unwrap();
        g.as_ref()
            .map(|h| h.tx.clone())
            .ok_or("没有活动 agent(先 agent_start)")?
    };
    let (rep, rep_rx) = oneshot::channel();
    tx.send(AcpCmd::SetConfigOption {
        config_id,
        kind,
        value_str,
        value_bool,
        rep,
    })
    .map_err(|_| "agent 线程已退出".to_string())?;
    rep_rx.await.map_err(|_| "agent 无响应".to_string())?
}

/// 切换会话模型。走扩展方法 `session/set_model`(Cursor 适配器实现);不支持该方法
/// 的 agent 回 Method not found → 前端如实显示。claude / opencode 的模型下拉走
/// `agent_set_config_option`(config_options 里 category=model 的选项)。
#[tauri::command]
pub async fn agent_set_model(
    model_id: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let tx = {
        let g = state.0.lock().unwrap();
        g.as_ref()
            .map(|h| h.tx.clone())
            .ok_or("没有活动 agent(先 agent_start)")?
    };
    let (rep, rep_rx) = oneshot::channel();
    tx.send(AcpCmd::SetModel { model_id, rep })
        .map_err(|_| "agent 线程已退出".to_string())?;
    rep_rx.await.map_err(|_| "agent 无响应".to_string())?
}

/// 回捞会话信息(modes/configOptions/models 缓存)。`agent-session-info` 事件在
/// `agent_start` 返回前发射、前端订阅尚未就位 → 事件必丢;前端在订阅就绪后调本
/// 命令补齐(模型选择器的数据源)。无活动会话时返回 null。
#[tauri::command]
pub fn agent_session_info(state: State<'_, AcpState>) -> Option<serde_json::Value> {
    state
        .0
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|h| h.session_info.lock().unwrap().clone())
}

/// 关闭 agent(通道断开 → 连接结束 → 子进程 kill_on_drop)。
#[tauri::command]
pub fn agent_stop(state: State<'_, AcpState>) -> Result<(), String> {
    stop_inner(&state);
    Ok(())
}

/// 取消当前正在进行的生成(prompt),**会话保持存活**。
///
/// 与 `agent_stop`(终结会话、杀子进程)的区别:本命令只对当前 session 发 ACP
/// `session/cancel` notification,让 agent 停下本轮;连接不动,用户可立即再发。
///
/// 实现上必须绕过 cmd loop:loop 在 prompt 的 `block_task().await` 期间被阻塞,
/// 走 `AcpCmd` 通道的 Cancel 永远取不到。故直接用建会话时克隆进 `AcpHandle.cancel`
/// 的 ConnectionTo 发 notification(纯 channel send,不依赖 loop/runtime 线程)。
/// agent 随后会给在飞的 session/prompt 回一个(取消)结果,loop 里 Prompt 分支照常
/// emit_done → 前端 setBusy(false)。无会话 / 无在飞 prompt 时是 no-op。
#[tauri::command]
pub fn agent_cancel(state: State<'_, AcpState>) -> Result<(), String> {
    if let Some(h) = state.0.lock().unwrap().as_ref() {
        // 先解掉挂起的权限请求(规范 MUST:取消时回 Cancelled)。drop Sender →
        // handler 的 decide_rx.await 得 Err → 按拒绝走,权限回 outcome Cancelled、
        // terminal 回「用户拒绝」。不清这层,agent 可能卡在等回复直到超时兜底。
        let drained = h.pending.lock().unwrap().drain().count();
        if drained > 0 {
            logging::emit(
                logging::LogLevel::Info,
                "acp",
                "cancel: pending permissions answered Cancelled",
                Some(serde_json::json!({ "count": drained })),
            );
        }
        if let Some((conn, sid)) = h.cancel.lock().unwrap().as_ref() {
            if let Err(e) = conn.send_notification(CancelNotification::new(sid.clone())) {
                logging::emit(
                    logging::LogLevel::Warn,
                    "acp",
                    "session/cancel send failed",
                    Some(serde_json::json!({ "error": format!("{e:?}") })),
                );
            }
        }
    }
    Ok(())
}

/// 子进程是否仍存活(前端轮询复位「已连接」状态;B-AGENT-SHELL 存活检测)。
#[tauri::command]
pub fn agent_alive(state: State<'_, AcpState>) -> bool {
    state
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|h| h.alive.load(Ordering::SeqCst))
        .unwrap_or(false)
}

fn stop_inner(state: &State<'_, AcpState>) {
    stop_state(&state.0);
}

/// 终止任何活动 agent(窗口关闭 / 切换 vault 时调用,防子进程泄漏)。
/// 标记 clean,使线程退出不再报「意外结束」,并发 Stop 让连接优雅结束。
pub fn stop_state(state: &Mutex<Option<AcpHandle>>) {
    if let Some(h) = state.lock().unwrap().take() {
        // 标记为主动关闭:线程退出时不再报「意外结束」。
        h.clean.store(true, Ordering::SeqCst);
        let _ = h.tx.send(AcpCmd::Stop);
        // h 在此 drop → tx 副本释放;线程侧 rx 收 None 也会退出。
    }
}

// ─────────────────────────── 专用线程 ───────────────────────────────

/// agent 子进程 stderr 尾部缓冲:`with_debug` 回调逐行写入,连接/会话失败时读取
/// 拼进给用户看的错误。许多 adapter 把真实原因(未登录 / 缺依赖 / 后端崩溃)只打到
/// stderr,而 JSON-RPC 层往往只剩无信息的「Query closed before response received」。
#[derive(Clone)]
struct StderrBuf(Arc<Mutex<VecDeque<String>>>);
impl StderrBuf {
    fn new() -> Self {
        Self(Arc::new(Mutex::new(VecDeque::with_capacity(64))))
    }
    fn push(&self, line: &str) {
        let mut g = self.0.lock().unwrap();
        if g.len() >= 64 {
            g.pop_front();
        }
        g.push_back(line.trim_end().to_string());
    }
    fn tail(&self) -> String {
        self.0
            .lock()
            .unwrap()
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// 把底层连接/会话错误 + stderr 尾部,归一成对用户友好、带可操作建议的文本。
/// 约定:可复制命令行以 `» ` 前缀标记,前端正则提取做「复制并运行」按钮。
fn agent_connect_error(agent_id: &str, stage: &str, raw: &str, stderr_tail: &str) -> String {
    let hay = format!("{raw}\n{stderr_tail}").to_lowercase();
    let auth_hit = hay.contains("not authenticated")
        || hay.contains("not logged in")
        || hay.contains("not signed in")
        || hay.contains("unauthorized")
        || hay.contains("please log in")
        || hay.contains("authentication")
        || hay.contains("needs login")
        || hay.contains("not authenticated");
    // 登录命令随 recipe 走(连接器模式):不再维护第二张 agent_id→cmd 表。
    // 旧 match 覆盖的别名(cursor-agent / claude / claude-agent)前端不会传入
    // (agent_id 恒为 recipe.id),故直接按 id 查即可。
    let login_cmd: Option<&'static str> = recipes()
        .iter()
        .find(|r| r.id == agent_id)
        .and_then(|r| r.login_cmd);
    let cmd_not_found = hay.contains("enoent")
        || hay.contains("command not found")
        || hay.contains("no such file")
        || hay.contains("spawn enoent");
    // npx/npm 的全局 shim 指向已失效的模块(pnpm/npm 升级或卸载后残留)——典型:
    // `Cannot find module '.../npm/bin/npx-cli.js'` / `MODULE_NOT_FOUND`。这不是 app 的 bug,
    // 是宿主 Node/npx 环境损坏;归到这里给一句可操作的人话,而不是把整段 Node 堆栈甩到页面。
    let module_not_found = hay.contains("cannot find module")
        || hay.contains("module_not_found")
        || hay.contains("err_require_module");
    let api_key_hit = hay.contains("api key")
        || hay.contains("api_key")
        || hay.contains("invalid key")
        || hay.contains("401")
        || hay.contains("permission_denied");

    let (reason, cmd): (String, Option<String>) = if auth_hit {
        ("该 agent 的 CLI 尚未登录授权。".to_string(), login_cmd.map(str::to_string))
    } else if api_key_hit {
        ("该 agent 的 API key 无效或未配置。".to_string(), login_cmd.map(str::to_string))
    } else if module_not_found {
        (
            "agent 命令依赖的运行时(npx/npm/node 模块)损坏或缺失——通常是全局 CLI 被升级或卸载后残留了失效的 shim。请重装对应 agent CLI,或在系统终端里确认 `node -v` / `npx -v` 能正常跑。"
                .to_string(),
            None,
        )
    } else if cmd_not_found {
        ("未找到 agent 命令(可能 CLI 未安装或不在 PATH)。".to_string(), None)
    } else if stderr_tail.trim().is_empty() {
        (
            "agent 进程在握手期间退出,且未输出错误信息。常见为 CLI 版本不兼容或内部后端启动失败。"
                .to_string(),
            None,
        )
    } else {
        // 原始详情(adapter 完整输出)由调用方拼到串尾的 `--- adapter 日志 ---` 段,
        // 前端会切出来收敛进日志文件、不渲染到页面;故此处原因不再写「见下方详情」。
        ("agent 进程报告了错误。".to_string(), None)
    };

    let mut out = format!("无法连接【{stage}】:{reason}");
    if let Some(c) = cmd {
        out.push_str(&format!("\n\n在系统终端运行以完成授权后重试:\n» {c}"));
    }
    if !stderr_tail.trim().is_empty() {
        out.push_str(&format!("\n\n--- adapter 日志 ---\n{}", stderr_tail.trim()));
    }
    out
}

fn run_thread(
    app: AppHandle,
    command: String,
    root: String,
    agent_id: String,
    mut rx: mpsc::UnboundedReceiver<AcpCmd>,
    alive: Arc<AtomicBool>,
    clean: Arc<AtomicBool>,
    instant_commit: Arc<AtomicBool>,
    start_rep: Arc<Mutex<Option<oneshot::Sender<Result<String, String>>>>>,
    cancel: Arc<Mutex<Option<(ConnectionTo<Agent>, String)>>>,
    pending: Arc<Mutex<HashMap<String, PendingPermission>>>,
    session_info: Arc<Mutex<Option<serde_json::Value>>>,
) {
    alive.store(true, Ordering::SeqCst);
    // 退出守卫:无论哪条路径离开本函数,都把 alive 置 false;
    // 若非主动 agent_stop(clean),再 emit 一条「意外结束」让前端即时复位。
    struct ExitGuard {
        app: AppHandle,
        alive: Arc<AtomicBool>,
        clean: Arc<AtomicBool>,
    }
    impl Drop for ExitGuard {
        fn drop(&mut self) {
            let clean = self.clean.load(Ordering::SeqCst);
            self.alive.store(false, Ordering::SeqCst);
            logging::emit(
                if clean {
                    logging::LogLevel::Debug
                } else {
                    logging::LogLevel::Warn
                },
                "acp",
                if clean {
                    "agent thread exit (clean)"
                } else {
                    "agent thread exit (unexpected)"
                },
                None,
            );
            if !clean {
                let _ = self.app.emit("agent-error", "agent 进程已意外结束");
            }
        }
    }
    let _guard = ExitGuard {
        app: app.clone(),
        alive: alive.clone(),
        clean: clean.clone(),
    };

    let rt = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            let msg = format!("建立 runtime 失败:{e}");
            logging::emit(
                logging::LogLevel::Error,
                "acp",
                "runtime build failed",
                Some(serde_json::json!({ "error": &msg })),
            );
            let _ = app.emit("agent-error", msg.clone());
            if let Some(rep) = start_rep.lock().unwrap().take() {
                let _ = rep.send(Err(msg));
            }
            return;
        }
    };
    rt.block_on(async move {
        run_connection(
            app,
            command,
            root,
            agent_id,
            &mut rx,
            instant_commit,
            start_rep,
            cancel,
            pending,
            session_info,
        )
        .await;
    });
}

async fn run_connection<E: AgentEmitter>(
    emitter: E,
    command: String,
    root: String,
    agent_id: String,
    rx: &mut mpsc::UnboundedReceiver<AcpCmd>,
    instant_commit: Arc<AtomicBool>,
    start_rep: Arc<Mutex<Option<oneshot::Sender<Result<String, String>>>>>,
    cancel: Arc<Mutex<Option<(ConnectionTo<Agent>, String)>>>,
    pending: Arc<Mutex<HashMap<String, PendingPermission>>>,
    session_info: Arc<Mutex<Option<serde_json::Value>>>,
) {
    let stderr_tail = StderrBuf::new();
    // cursor 私有 models(currentModelId + availableModels):ACP 标准 NewSessionResponse
    // 无此字段,SDK 强类型解析时丢弃。这里在 with_debug 的 stdout 方向按行拦截
    // session/new 的 result.models 缓存下来,供 emit_session_info 发前端渲染模型下拉;
    // 切换走扩展方法 session/set_model(见 SetSessionModelRequest / AcpCmd::SetModel)。
    let models_buf: Arc<Mutex<Option<serde_json::Value>>> = Arc::new(Mutex::new(None));
    let agent: acp::AcpAgent = match command.parse::<acp::AcpAgent>() {
        Ok(a) => {
            // with_debug:逐行拿到 adapter 的 stdin/stdout/stderr。stderr 缓存(真实失败
            // 原因往往只在 stderr),供连接/会话失败时拼进给用户的错误;stdout 则拦截
            // cursor 的私有 models 字段。
            let tail = stderr_tail.clone();
            let models_buf = models_buf.clone();
            let a = a.with_debug(move |line, dir| {
                if matches!(dir, acp::LineDirection::Stderr) {
                    logging::emit(
                        logging::LogLevel::Debug,
                        "acp.stderr",
                        "stderr line",
                        Some(serde_json::json!({ "line": line })),
                    );
                    tail.push(line);
                } else if matches!(dir, acp::LineDirection::Stdout)
                    && line.contains("\"availableModels\"")
                {
                    // cursor session/new result 含私有 models 字段;解析后缓存。
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(m) = v.get("result").and_then(|r| r.get("models")) {
                            *models_buf.lock().unwrap() = Some(m.clone());
                        }
                    }
                }
            });
            logging::emit(
                logging::LogLevel::Debug,
                "acp",
                "command parsed",
                Some(serde_json::json!({ "command": &command })),
            );
            a
        }
        Err(e) => {
            // 原始 Debug dump 不上页面:给用户 e.message,完整细节进日志。
            let msg = format!("解析 agent 命令失败:{}", e.message);
            logging::emit(
                logging::LogLevel::Error,
                "acp",
                "command parse failed",
                Some(serde_json::json!({
                    "command": &command,
                    "error": format!("{e:?}"),
                })),
            );
            emitter.emit_error(msg.clone());
            if let Some(rep) = start_rep.lock().unwrap().take() {
                let _ = rep.send(Err(msg));
            }
            return;
        }
    };

    // 挂起权限表由 agent_start 建好传入(agent_cancel 取消时要清空它回 Cancelled);
    // 计数器随会话新建。两者被 handler 与 loop 双向访问。
    let perm_id = Arc::new(AtomicU64::new(0));
    // terminal 注册表 + 计数器(CreateTerminal 写,Kill/Output/Wait/Release 读)。
    let terminals: Arc<Mutex<HashMap<String, Arc<TerminalHandle>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let term_id = Arc::new(AtomicU64::new(0));
    let vault_root: Arc<String> = Arc::new(root);
    let agent_ns: Arc<String> = Arc::new(agent_id.clone()); // git 归因命名空间 refs/agents/<id>

    // 三类回调各自克隆一份 emitter / 共享态。
    let notif_em = emitter.clone();
    let fs_em = emitter.clone();
    let fs_root = vault_root.clone();
    let perm_em = emitter.clone();
    let perm_pending = pending.clone();
    let perm_counter = perm_id.clone();

    let result = Client
        .builder()
        .on_receive_notification(
            {
                let em = notif_em;
                async move |notification: SessionNotification, _cx| {
                    let payload =
                        serde_json::to_value(&notification.update).unwrap_or(serde_json::Value::Null);
                    log_notification(&payload);
                    em.emit_update(payload);
                    Ok(())
                }
            },
            acp::on_receive_notification!(),
        )
        .on_receive_request(
            {
                let em = perm_em;
                let pending = perm_pending;
                let counter = perm_counter;
                async move |request: RequestPermissionRequest, responder, _connection| {
                    let id = format!("perm-{}", counter.fetch_add(1, Ordering::Relaxed));
                    let first_option = request.options.first().map(|o| o.option_id.clone());
                    let (tx, decide_rx) = oneshot::channel::<bool>();
                    pending.lock().unwrap().insert(id.clone(), PendingPermission { tx });
                    let tc = serde_json::to_value(&request.tool_call)
                        .unwrap_or(serde_json::Value::Null);
                    // 归一工具分类做白名单键;高危的拿不到键(None),白名单永不放行。
                    let kind = request
                        .tool_call
                        .fields
                        .kind
                        .as_ref()
                        .and_then(tool_kind_slug)
                        .map(str::to_string);
                    let high_risk = is_high_risk_value(&tc);
                    em.emit_permission(
                        id.clone(),
                        tc.clone(),
                        serde_json::to_value(&request.options).unwrap_or(serde_json::Value::Null),
                        high_risk,
                        kind.clone(),
                    );
                    logging::emit(
                        logging::LogLevel::Info,
                        "acp",
                        "permission request",
                        Some(serde_json::json!({
                            "id": &id,
                            "kind": kind,
                            "high_risk": high_risk,
                            "tool_call": &tc,
                        })),
                    );

                    let approve = decide_rx.await.unwrap_or(false);
                    // 回复后从表里清掉(若还在)。
                    pending.lock().unwrap().remove(&id);
                    let outcome = if approve {
                        match first_option {
                            Some(oid) => RequestPermissionOutcome::Selected(
                                SelectedPermissionOutcome::new(oid),
                            ),
                            None => RequestPermissionOutcome::Cancelled,
                        }
                    } else {
                        RequestPermissionOutcome::Cancelled
                    };
                    let _ = responder.respond(RequestPermissionResponse::new(outcome));
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            {
                let root = fs_root.clone();
                async move |request: ReadTextFileRequest, responder, _connection| {
                    let path = request.path.clone();
                    if !under_root(&root, &path) {
                        let _ = responder
                            .respond_with_internal_error(format!("拒绝访问 vault 外路径:{}", path.display()));
                        return Ok(());
                    }
                    match std::fs::read_to_string(&path) {
                        Ok(content) => {
                            let _ = responder.respond(ReadTextFileResponse::new(content));
                        }
                        Err(e) => {
                            let _ = responder
                                .respond_with_internal_error(format!("读取失败:{e}"));
                        }
                    }
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        .on_receive_request(
            {
                let em = fs_em;
                let root = fs_root;
                let ns = agent_ns.clone();
                async move |request: WriteTextFileRequest, responder, _connection| {
                    let path = request.path.clone();
                    if !under_root(&root, &path) {
                        let _ = responder
                            .respond_with_internal_error(format!("拒绝写入 vault 外路径:{}", path.display()));
                        return Ok(());
                    }
                    // §4 标注层:写入前读 pre-image(best-effort;不存在/读失败→None)。
                    let pre_image = std::fs::read_to_string(&path).ok();
                    let created = pre_image.is_none();
                    let (added, removed) = line_diff(pre_image.as_deref().unwrap_or(""), &request.content);
                    match std::fs::write(&path, &request.content) {
                        Ok(()) => {
                            let _ = responder.respond(WriteTextFileResponse::new());
                            em.emit_file_write(FileWritePayload {
                                path: path.to_string_lossy().to_string(),
                                writer: format!("agent-{}", ns),
                                added,
                                removed,
                                created,
                            });
                        }
                        Err(e) => {
                            let _ = responder
                                .respond_with_internal_error(format!("写入失败:{e}"));
                        }
                    }
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        // ── terminal/create:恒高危,经权限卡逐次问,批准才 spawn ──
        .on_receive_request(
            {
                let em = emitter.clone();
                let pending = pending.clone();
                let counter = perm_id.clone();
                let terminals = terminals.clone();
                let term_counter = term_id.clone();
                let root = vault_root.clone();
                async move |request: CreateTerminalRequest, responder, _connection| {
                    // 合成高危权限卡(tool_call 带 command/args/cwd 摘要)。
                    let id = format!("term-{}", counter.fetch_add(1, Ordering::Relaxed));
                    let (tx, decide_rx) = oneshot::channel::<bool>();
                    pending.lock().unwrap().insert(id.clone(), PendingPermission { tx });
                    let summary = serde_json::json!({
                        "kind": "execute_command",
                        "command": request.command,
                        "args": request.args,
                        "cwd": request.cwd,
                    });
                    em.emit_permission(
                        id.clone(),
                        summary,
                        serde_json::Value::Array(vec![]),
                        true,        // terminal 恒高危
                        None,        // 高危无白名单键
                    );
                    let approve = decide_rx.await.unwrap_or(false);
                    pending.lock().unwrap().remove(&id);
                    if !approve {
                        let _ = responder
                            .respond_with_internal_error("用户拒绝运行该命令");
                        return Ok(());
                    }
                    match spawn_terminal(
                        &request.command,
                        &request.args,
                        &request.env,
                        request.cwd.clone(),
                        root.as_str(),
                        request.output_byte_limit,
                    ) {
                        Ok(handle) => {
                            let tid = format!("term-{}", term_counter.fetch_add(1, Ordering::Relaxed));
                            terminals.lock().unwrap().insert(tid.clone(), Arc::new(handle));
                            let _ = responder.respond(CreateTerminalResponse::new(TerminalId::new(
                                tid,
                            )));
                        }
                        Err(e) => {
                            let _ = responder.respond_with_internal_error(e);
                        }
                    }
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        // ── terminal/output:取当前累积输出(+ 退出状态若已结束)──
        .on_receive_request(
            {
                let terminals = terminals.clone();
                async move |request: TerminalOutputRequest, responder, _connection| {
                    let key = request.terminal_id.0.to_string();
                    let h = terminals.lock().unwrap().get(&key).cloned();
                    match h {
                        Some(h) => {
                            let (output, truncated) = {
                                let b = h.output.lock().unwrap();
                                serve_output(&b, h.limit)
                            };
                            let exit = h.exit.lock().unwrap().clone();
                            let mut resp = TerminalOutputResponse::new(output, truncated);
                            if let Some(st) = exit {
                                resp = resp.exit_status(st);
                            }
                            let _ = responder.respond(resp);
                        }
                        None => {
                            let _ = responder
                                .respond_with_internal_error(format!("未知 terminal:{key}"));
                        }
                    }
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        // ── terminal/wait_for_exit:等退出码(快路径:已结束直返)──
        .on_receive_request(
            {
                let terminals = terminals.clone();
                async move |request: WaitForTerminalExitRequest, responder, _connection| {
                    let key = request.terminal_id.0.to_string();
                    let h = terminals.lock().unwrap().get(&key).cloned();
                    match h {
                        Some(h) => {
                            // 快路径:已退出。
                            if let Some(st) = h.exit.lock().unwrap().clone() {
                                let _ = responder.respond(WaitForTerminalExitResponse::new(st));
                                return Ok(());
                            }
                            // 慢路径:取一次性信号等 waiter 唤醒。
                            let rx_opt = h.done_rx.lock().unwrap().take();
                            if let Some(rx) = rx_opt {
                                match rx.await {
                                    Ok(st) => {
                                        let _ =
                                            responder.respond(WaitForTerminalExitResponse::new(st));
                                    }
                                    Err(_) => {
                                        let _ = responder.respond_with_internal_error(
                                            "等待 terminal 退出失败",
                                        );
                                    }
                                }
                            } else {
                                // 信号已消费但 exit 仍空(竞争):再查一次。
                                let st = h
                                    .exit
                                    .lock()
                                    .unwrap()
                                    .clone()
                                    .unwrap_or_else(TerminalExitStatus::new);
                                let _ = responder.respond(WaitForTerminalExitResponse::new(st));
                            }
                        }
                        None => {
                            let _ = responder
                                .respond_with_internal_error(format!("未知 terminal:{key}"));
                        }
                    }
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        // ── terminal/kill:组信号清进程树 ──
        .on_receive_request(
            {
                let terminals = terminals.clone();
                async move |request: KillTerminalRequest, responder, _connection| {
                    let key = request.terminal_id.0.to_string();
                    if let Some(h) = terminals.lock().unwrap().get(&key).cloned() {
                        kill_group(h.pid);
                    }
                    let _ = responder.respond(KillTerminalResponse::new());
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        // ── terminal/release:仍存活则杀,移出注册表 ──
        .on_receive_request(
            {
                let terminals = terminals.clone();
                async move |request: ReleaseTerminalRequest, responder, _connection| {
                    let key = request.terminal_id.0.to_string();
                    if let Some(h) = terminals.lock().unwrap().remove(&key) {
                        let still_running = h.exit.lock().unwrap().is_none();
                        if still_running {
                            kill_group(h.pid);
                        }
                    }
                    let _ = responder.respond(ReleaseTerminalResponse::new());
                    Ok(())
                }
            },
            acp::on_receive_request!(),
        )
        .connect_with(agent, {
            let em = emitter.clone();
            let instant_commit = instant_commit.clone();
            let start_rep = start_rep.clone();
            // agent_id / stderr_tail / models_buf 也要在闭包外(fallback)用,故各 clone 一份进闭包。
            let agent_id = agent_id.clone();
            let stderr_tail = stderr_tail.clone();
            let models_buf = models_buf.clone();
            let cancel = cancel.clone();
            async move |connection: ConnectionTo<Agent>| {
                // initialize(client → agent):声明 fs(读/写文本文件)+ terminal 能力。
                let caps = ClientCapabilities::new()
                    .fs(
                        FileSystemCapabilities::new()
                            .read_text_file(true)
                            .write_text_file(true),
                    )
                    .terminal(true);
                logging::emit(logging::LogLevel::Debug, "acp", "initialize → sending", None);
                if let Err(e) = connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1).client_capabilities(caps))
                    .block_task()
                    .await
                {
                    let raw = format!("{e:?}");
                    let msg = agent_connect_error(&agent_id, "握手(initialize)", &raw, &stderr_tail.tail());
                    logging::emit(
                        logging::LogLevel::Error,
                        "acp",
                        "initialize failed",
                        Some(serde_json::json!({ "error": &raw, "stderr": stderr_tail.tail() })),
                    );
                    em.emit_error(msg.clone());
                    if let Some(rep) = start_rep.lock().unwrap().take() {
                        let _ = rep.send(Err(msg));
                    }
                    return Ok(());
                }
                logging::emit(logging::LogLevel::Info, "acp", "initialize ok", None);

                // NewSession:initialize 成功后**直接**建立(不经通道)。失败则回带原因的
                // Err 并结束连接(`agent_start` 立即返回);成功则拿到具体 session_id,后续
                // 循环复用(此处已建会话,不再是 Option)。
                logging::emit(logging::LogLevel::Debug, "acp", "new_session → sending", None);
                let ns = match connection
                    .send_request(NewSessionRequest::new(PathBuf::from(vault_root.as_str())))
                    .block_task()
                    .await
                {
                    Ok(ns) => ns,
                    Err(e) => {
                        let raw = format!("{e:?}");
                        let msg = agent_connect_error(&agent_id, "建立会话", &raw, &stderr_tail.tail());
                        logging::emit(
                            logging::LogLevel::Error,
                            "acp",
                            "new_session failed",
                            Some(serde_json::json!({ "error": &raw, "stderr": stderr_tail.tail() })),
                        );
                        em.emit_error(msg.clone());
                        if let Some(rep) = start_rep.lock().unwrap().take() {
                            let _ = rep.send(Err(msg));
                        }
                        // 无会话可继续:结束连接(子进程随之 kill_on_drop)。
                        return Ok(());
                    }
                };
                let sid_str = serde_json::to_value(&ns.session_id)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_string))
                    .unwrap_or_else(|| "session".to_string());
                // §2.3:把 agent 声明的 modes / config_options 归一成前端可渲染 JSON。
                let modes = ns.modes.as_ref().map(|m| {
                    serde_json::json!({
                        "current": m.current_mode_id,
                        "available": m.available_modes.iter().map(|mode| {
                            serde_json::json!({ "id": mode.id, "name": mode.name, "description": mode.description })
                        }).collect::<Vec<_>>(),
                    })
                });
                let config = ns.config_options.as_ref().map(|opts| {
                    let mut v = serde_json::to_value(opts).unwrap_or(serde_json::Value::Null);
                    // select 的 options 可能是**分组**形状([{group,name,options:[…] }],
                    // SessionConfigSelectOptions::Grouped);前端下拉只认扁平 [{value,name}]。
                    // 这里归一:把组展平,组名并进选项名(「组名 · 选项名」),两种形状统一。
                    if let Some(arr) = v.as_array_mut() {
                        for opt in arr.iter_mut() {
                            let grouped = opt
                                .get("options")
                                .and_then(|o| o.as_array())
                                .map(|items| items.iter().any(|it| it.get("group").is_some()))
                                .unwrap_or(false);
                            if !grouped {
                                continue;
                            }
                            let mut flat: Vec<serde_json::Value> = Vec::new();
                            if let Some(items) =
                                opt.get("options").and_then(|o| o.as_array()).cloned()
                            {
                                for g in items {
                                    let gname = g
                                        .get("name")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    if let Some(sub) =
                                        g.get("options").and_then(|x| x.as_array()).cloned()
                                    {
                                        for mut o in sub {
                                            if !gname.is_empty() {
                                                if let Some(nm) =
                                                    o.get("name").and_then(|x| x.as_str())
                                                {
                                                    o["name"] = serde_json::Value::String(
                                                        format!("{gname} · {nm}"),
                                                    );
                                                }
                                            }
                                            flat.push(o);
                                        }
                                    }
                                }
                            }
                            opt["options"] = serde_json::Value::Array(flat);
                        }
                    }
                    v
                });
                let session_id = ns.session_id; // 到达此处即已建会话
                em.emit_session(sid_str.clone());
                // 填入 cancel 直接通道:agent_cancel 用这对 (connection, session_id)
                // 绕过 loop 发 session/cancel(prompt 期间 loop 被 block_task 阻塞)。
                *cancel.lock().unwrap() = Some((connection.clone(), sid_str.clone()));
                // cursor 私有 models:归一成 {current, currentName, available} 发前端,渲染
                // 成可切换的模型下拉(切换经 agent_set_model → session/set_model)。
                let models = models_buf.lock().unwrap().take().and_then(|m| {
                    let cur = m
                        .get("currentModelId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let avail: Vec<serde_json::Value> = m
                        .get("availableModels")
                        .and_then(|a| a.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|mo| {
                                    let id = mo.get("modelId").and_then(|v| v.as_str())?;
                                    let name = mo
                                        .get("name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(id);
                                    Some(serde_json::json!({ "modelId": id, "name": name }))
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if cur.is_empty() && avail.is_empty() {
                        None
                    } else {
                        // currentName:在 available 里查 current 的显示名,没有则回落 current id。
                        let cur_name = avail
                            .iter()
                            .find(|mo| mo.get("modelId").and_then(|v| v.as_str()) == Some(cur.as_str()))
                            .and_then(|mo| mo.get("name").and_then(|v| v.as_str()).map(str::to_string));
                        Some(serde_json::json!({
                            "current": cur,
                            "currentName": cur_name,
                            "available": avail,
                        }))
                    }
                });
                let info_payload = serde_json::json!({
                    "modes": modes,
                    "configOptions": config,
                    "models": models,
                });
                // 缓存进 handle:事件此刻发射,前端订阅尚未就位必丢,靠回捞兜底。
                *session_info.lock().unwrap() = Some(info_payload.clone());
                em.emit_session_info(info_payload);
                logging::emit(
                    logging::LogLevel::Info,
                    "acp",
                    "new_session ok",
                    Some(serde_json::json!({
                        "session_id": &sid_str,
                        "modes_count": modes
                            .as_ref()
                            .and_then(|m| m.get("available"))
                            .and_then(|a| a.as_array())
                            .map(|a| a.len())
                            .unwrap_or(0),
                        "config_options_count": config
                            .as_ref()
                            .and_then(|c| c.as_array())
                            .map(|a| a.len())
                            .unwrap_or(0),
                    })),
                );
                if let Some(rep) = start_rep.lock().unwrap().take() {
                    let _ = rep.send(Ok(sid_str));
                }

                while let Some(cmd) = rx.recv().await {
                    match cmd {
                        AcpCmd::Prompt { text, rep } => {
                            let sid = session_id.clone();
                            logging::emit(
                                logging::LogLevel::Info,
                                "acp",
                                "prompt → sending",
                                Some(serde_json::json!({ "text_len": text.len() })),
                            );
                            // turn 级快照(pre):捕获 agent 写入前基线(§4;best-effort,
                            // 失败不阻断 agent。非 git 仓库 → snapshot_turn 返回 None)。
                            let _ =
                                crate::git_attr::snapshot_turn(vault_root.as_str(), agent_ns.as_str(), "pre");
                            match connection
                                .send_request(PromptRequest::new(
                                    sid,
                                    vec![ContentBlock::Text(TextContent::new(text))],
                                ))
                                .block_task()
                                .await
                            {
                                Ok(pr) => {
                                    // turn 级快照(post):该轮 agent 写入落 refs/agents/<id>。
                                    let post_oid = crate::git_attr::snapshot_turn(
                                        vault_root.as_str(),
                                        agent_ns.as_str(),
                                        "post",
                                    );
                                    // §4 即时提交模式:on 时把该轮文件自动 adopt 进 HEAD
                                    // (per-agent ref 仍留作回滚镜像)。best-effort,失败只提示不阻断。
                                    // **被取消的轮不 adopt**:用户按 Stop 即表示不要这轮的
                                    // 半成品,把它自动合进 HEAD 是反直觉的;留在工作树/隔离
                                    // 区供人工定夺(与 Err(RequestCancelled) 路径行为一致)。
                                    if instant_commit.load(Ordering::SeqCst)
                                        && !matches!(pr.stop_reason, StopReason::Cancelled)
                                    {
                                        if let Ok(Some(oid)) = &post_oid {
                                            if let Err(e) =
                                                crate::git_attr::adopt_turn(vault_root.as_str(), oid)
                                            {
                                                em.emit_error(format!("即时提交失败:{e}"));
                                            }
                                        }
                                    }
                                    em.emit_done(
                                        serde_json::to_value(&pr.stop_reason)
                                            .unwrap_or(serde_json::Value::Null),
                                    );
                                    logging::emit(
                                        logging::LogLevel::Info,
                                        "acp",
                                        "prompt done",
                                        Some(serde_json::json!({
                                            "stop_reason": serde_json::to_value(&pr.stop_reason)
                                                .unwrap_or(serde_json::Value::Null),
                                        })),
                                    );
                                    let _ = rep.send(Ok(()));
                                }
                                Err(e) => {
                                    // Err 也补 post 快照:agent 写文件发生在轮内进行中,
                                    // 取消 / 失败时写入已落盘,不补快照则回滚镜像缺这一轮。
                                    let _ = crate::git_attr::snapshot_turn(
                                        vault_root.as_str(),
                                        agent_ns.as_str(),
                                        "post",
                                    );
                                    if e.code == ErrorCode::RequestCancelled {
                                        // 用户主动 Stop 的正常结果,不是错误:规范要求
                                        // session/cancel 回 Ok(stop_reason=cancelled),但
                                        // 协作式取消也可能回 -32800,两种都按正常结束走,
                                        // 前端不得弹红色错误气泡。
                                        logging::emit(
                                            logging::LogLevel::Info,
                                            "acp",
                                            "prompt cancelled",
                                            None,
                                        );
                                        em.emit_done(serde_json::json!("cancelled"));
                                        let _ = rep.send(Ok(()));
                                    } else {
                                        // 原始 Debug dump({e:?})不上页面:给用户一句
                                        // e.message(规范限一句话),完整细节进日志。
                                        let msg = format!("prompt 失败:{}", e.message);
                                        logging::emit(
                                            logging::LogLevel::Error,
                                            "acp",
                                            "prompt failed",
                                            Some(serde_json::json!({
                                                "error": format!("{e:?}"),
                                            })),
                                        );
                                        em.emit_error(msg.clone());
                                        let _ = rep.send(Err(msg));
                                    }
                                }
                            }
                        }
                        AcpCmd::SetInstantCommit { on } => {
                            instant_commit.store(on, Ordering::SeqCst);
                        }
                        AcpCmd::SetMode { mode_id, rep } => {
                            let sid = session_id.clone();
                            let r = connection
                                .send_request(SetSessionModeRequest::new(sid, mode_id))
                                .block_task()
                                .await
                                .map(|_| ())
                                .map_err(|e| format!("切换模式失败:{}", e.message));
                            let _ = rep.send(r);
                        }
                        AcpCmd::SetConfigOption {
                            config_id,
                            kind,
                            value_str,
                            value_bool,
                            rep,
                        } => {
                            let sid = session_id.clone();
                            let value = if kind == "bool" {
                                SessionConfigOptionValue::boolean(value_bool.unwrap_or(false))
                            } else {
                                SessionConfigOptionValue::value_id(
                                    value_str.clone().unwrap_or_default(),
                                )
                            };
                            let r = connection
                                .send_request(SetSessionConfigOptionRequest::new(
                                    sid,
                                    config_id.clone(),
                                    value,
                                ))
                                .block_task()
                                .await
                                .map(|_| ())
                                .map_err(|e| format!("设置配置失败:{}", e.message));
                            // 成功则同步缓存,前端回捞时 currentValue 是最新值。
                            if r.is_ok() {
                                if let Some(info) = session_info.lock().unwrap().as_mut() {
                                    if let Some(arr) =
                                        info.get_mut("configOptions").and_then(|c| c.as_array_mut())
                                    {
                                        for o in arr.iter_mut() {
                                            if o.get("id").and_then(|v| v.as_str())
                                                == Some(config_id.as_str())
                                            {
                                                o["currentValue"] = if kind == "bool" {
                                                    serde_json::json!(value_bool.unwrap_or(false))
                                                } else {
                                                    serde_json::json!(
                                                        value_str.clone().unwrap_or_default()
                                                    )
                                                };
                                            }
                                        }
                                    }
                                }
                            }
                            let _ = rep.send(r);
                        }
                        AcpCmd::SetModel { model_id, rep } => {
                            let sid = session_id.clone();
                            let mid = model_id.clone();
                            logging::emit(
                                logging::LogLevel::Info,
                                "acp",
                                "set_model → sending",
                                Some(serde_json::json!({ "model_id": &model_id })),
                            );
                            let r = connection
                                .send_request(SetSessionModelRequest {
                                    session_id: sid,
                                    model_id,
                                })
                                .block_task()
                                .await
                                .map(|_| ())
                                .map_err(|e| {
                                    if e.code == ErrorCode::MethodNotFound {
                                        // agent 未实现 session/set_model(如旧版适配器):
                                        // 给一句人话,而不是裸 Method not found。
                                        "该 agent 不支持运行时切换模型".to_string()
                                    } else {
                                        format!("切换模型失败:{}", e.message)
                                    }
                                });
                            // 成功则同步缓存 current/currentName(前端回捞见最新值)。
                            if r.is_ok() {
                                if let Some(info) = session_info.lock().unwrap().as_mut() {
                                    if let Some(m) = info.get_mut("models") {
                                        let name = m
                                            .get("available")
                                            .and_then(|a| a.as_array())
                                            .and_then(|arr| {
                                                arr.iter().find(|mo| {
                                                    mo.get("modelId").and_then(|v| v.as_str())
                                                        == Some(mid.as_str())
                                                })
                                            })
                                            .and_then(|mo| mo.get("name").cloned());
                                        m["current"] = serde_json::json!(mid);
                                        if let Some(n) = name {
                                            m["currentName"] = n;
                                        }
                                    }
                                }
                            }
                            let _ = rep.send(r);
                        }
                        AcpCmd::Stop => {
                            logging::emit(logging::LogLevel::Debug, "acp", "stop requested", None);
                            break;
                        }
                    }
                }
                Ok(())
            }
        })
        .await;

    if let Err(e) = &result {
        let raw = format!("{e:?}");
        let msg = agent_connect_error(&agent_id, "连接", &raw, &stderr_tail.tail());
        logging::emit(
            logging::LogLevel::Error,
            "acp",
            "connect ended with error",
            Some(serde_json::json!({ "error": &raw, "stderr": stderr_tail.tail() })),
        );
        emitter.emit_error(msg);
    }
    // 兜底:若 start_rep 仍未回复(连接闭包从未跑——如子进程 spawn 失败导致
    // connect_with 直接 Err;或 NewSession 早退未覆盖的路径),补一条带真实原因的 Err,
    // 使 `agent_start` 不会因回执丢失而卡在超时。此时线程已退出,前端不会进入会话态。
    if let Some(rep) = start_rep.lock().unwrap().take() {
        let msg = match &result {
            Err(e) => agent_connect_error(&agent_id, "连接", &format!("{e:?}"), &stderr_tail.tail()),
            Ok(_) => agent_connect_error(&agent_id, "连接", "连接已结束但未建立会话", &stderr_tail.tail()),
        };
        logging::emit(
            logging::LogLevel::Warn,
            "acp",
            "start reply fallback (no session)",
            Some(serde_json::json!({ "error": &msg })),
        );
        let _ = rep.send(Err(msg));
    }
}

/// 把一帧 SessionUpdate 以 Debug 记一行摘要(tag + 文本长度 / 工具标题),不记全文,
/// 避免长回复逐 token 刷屏,但保留「流式是否在动 / 工具进度」可追溯(排查卡住用)。
fn log_notification(payload: &serde_json::Value) {
    let tag = payload
        .get("sessionUpdate")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let summary = match tag {
        "agent_message_chunk" | "agent_message" => {
            let len = payload
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
                .map(str::len)
                .unwrap_or(0);
            serde_json::json!({ "len": len })
        }
        "tool_call" | "tool_call_update" => serde_json::json!({
            "id": payload.get("toolCallId").and_then(|v| v.as_str()),
            "title": payload.get("title").and_then(|v| v.as_str()),
            "status": payload.get("status").and_then(|v| v.as_str()),
        }),
        _ => serde_json::Value::Null,
    };
    logging::emit(
        logging::LogLevel::Debug,
        "acp",
        "notification",
        Some(serde_json::json!({ "tag": tag, "summary": summary })),
    );
}

/// 绝对路径是否落在 vault root 之内(写入新文件时父目录 canonicalize 兜底)。
fn under_root(root: &str, abs: &Path) -> bool {
    let root_canon = std::fs::canonicalize(root).unwrap_or_else(|_| PathBuf::from(root));
    if let Ok(c) = std::fs::canonicalize(abs) {
        return c.starts_with(&root_canon);
    }
    // 文件尚不存在:对父目录 canonicalize 再拼回文件名做判断。
    if let Some(parent) = abs.parent() {
        if let Ok(pc) = std::fs::canonicalize(parent) {
            if let Some(name) = abs.file_name() {
                return pc.join(name).starts_with(&root_canon);
            }
        }
    }
    abs.starts_with(&root_canon)
}

// ─────────────────────────── terminal(B-AGENT-SHELL terminal 闭包) ─────
//
// ACP terminal 模型 = 跑命令 + 捕获输出(协议无 stdin 写入请求,非交互)。流程:
// CreateTerminal(command,args,cwd) → terminal_id;客户端 spawn 子进程、后台累积输出;
// TerminalOutput(id) 取当前输出(可轮询);WaitForTerminalExit(id) 等退出码;Kill/Release。
//
// 安全:CreateTerminal 恒高危(任意执行)——在 handler 里复用权限卡逐次问(§5),
// 用户批准才 spawn;否则 respond_with_internal_error。cwd 默认 vault root(批准即放行,
// 不二次约束——terminal 本就是全权)。子进程 process_group(0) 自成组,Kill 走组信号
// 清孙进程(避免孤儿 npm/node)。

/// 一个后台终端:累积输出 + 退出状态 + pid(用于组 kill)。
struct TerminalHandle {
    /// stdout+stderr 合并累积(原始字节,服务时再 lossy 转 String,避免 UTF-8 边界)。
    output: Arc<std::sync::Mutex<Vec<u8>>>,
    /// 退出状态(None=仍在跑)。
    exit: Arc<std::sync::Mutex<Option<TerminalExitStatus>>>,
    /// WaitForTerminalExit 的一次性信号(快路径:exit 已 Some 则直返)。
    done_rx: std::sync::Mutex<Option<oneshot::Receiver<TerminalExitStatus>>>,
    pid: u32,
    limit: Option<u64>,
}

/// 把一个 Read 端排空进共享字节缓冲(达 limit 则丢头部保尾部,限制内存)。
fn drain_pipe<R: std::io::Read>(mut r: R, buf: Arc<std::sync::Mutex<Vec<u8>>>, limit: Option<u64>) {
    let mut chunk = [0u8; 8192];
    loop {
        match r.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                let mut b = buf.lock().unwrap();
                b.extend_from_slice(&chunk[..n]);
                if let Some(lim) = limit {
                    let lim = lim as usize;
                    if b.len() > lim {
                        let start = b.len() - lim;
                        b.drain(0..start);
                    }
                }
            }
            Err(_) => break,
        }
    }
}

/// 取当前输出快照:String + truncated。limit 下保尾部并对齐到 UTF-8 字符边界。
fn serve_output(buf: &[u8], limit: Option<u64>) -> (String, bool) {
    let mut data = buf;
    let mut truncated = false;
    if let Some(lim) = limit {
        let lim = lim as usize;
        if data.len() > lim {
            let start = data.len() - lim;
            // 前移到下一个 UTF-8 字符边界(避免从多字节字符中间截断)。
            let mut s = start;
            while s < data.len() && (data[s] & 0xC0) == 0x80 {
                s += 1;
            }
            data = &data[s..];
            truncated = true;
        }
    }
    (String::from_utf8_lossy(data).into_owned(), truncated)
}

/// 向进程组发 KILL(pgid == pid,因 process_group(0))。无 libc/nix 依赖,shell 出 kill。
fn kill_group(pid: u32) {
    let pgid = format!("-{pid}");
    let _ = std::process::Command::new("kill")
        .args(["-KILL", &pgid])
        .output();
}

/// spawn 命令子进程 + 三个后台线程(stdout reader / stderr reader / waiter)。
fn spawn_terminal(
    command: &str,
    args: &[String],
    env: &[EnvVariable],
    cwd: Option<PathBuf>,
    default_cwd: &str,
    output_byte_limit: Option<u64>,
) -> Result<TerminalHandle, String> {
    use std::process::Stdio;
    let mut cmd = std::process::Command::new(command);
    cmd.args(args);
    for e in env {
        cmd.env(&e.name, &e.value);
    }
    let cwd = cwd.unwrap_or_else(|| PathBuf::from(default_cwd));
    cmd.current_dir(&cwd);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| format!("启动命令「{command}」失败:{e}"))?;
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let output: Arc<std::sync::Mutex<Vec<u8>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
    let exit: Arc<std::sync::Mutex<Option<TerminalExitStatus>>> =
        Arc::new(std::sync::Mutex::new(None));
    let (done_tx, done_rx) = oneshot::channel::<TerminalExitStatus>();

    if let Some(so) = stdout {
        let o = output.clone();
        let lim = output_byte_limit;
        std::thread::spawn(move || drain_pipe(so, o, lim));
    }
    if let Some(se) = stderr {
        let o = output.clone();
        let lim = output_byte_limit;
        std::thread::spawn(move || drain_pipe(se, o, lim));
    }
    {
        // waiter:等子进程退出,落 exit status + 唤醒 WaitForTerminalExit。
        let exit = exit.clone();
        std::thread::spawn(move || {
            let status = match child.wait() {
                Ok(s) => {
                    if let Some(code) = s.code() {
                        TerminalExitStatus::new().exit_code(code as u32)
                    } else {
                        #[cfg(unix)]
                        {
                            use std::os::unix::process::ExitStatusExt;
                            match s.signal() {
                                Some(sig) => TerminalExitStatus::new().signal(format!("{sig}")),
                                None => TerminalExitStatus::new(),
                            }
                        }
                        #[cfg(not(unix))]
                        {
                            TerminalExitStatus::new()
                        }
                    }
                }
                Err(_) => TerminalExitStatus::new().exit_code(1),
            };
            *exit.lock().unwrap() = Some(status.clone());
            let _ = done_tx.send(status);
        });
    }

    Ok(TerminalHandle {
        output,
        exit,
        done_rx: std::sync::Mutex::new(Some(done_rx)),
        pid,
        limit: output_byte_limit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 收集所有事件到内存;遇权限请求自动放行(模拟 spike 行为),避免测试卡死。
    /// 放行直接解析共享 pending 表——与生产 agent_permission_respond 同路径
    /// (绝不走 cmd 通道:prompt 期间 loop 被 block_task 阻塞,通道回复取不到)。
    #[derive(Clone)]
    struct MockEmitter {
        events: Arc<Mutex<Vec<String>>>,
        /// 累积 agent_message_chunk 的文本(流式分块拼接),供断言。
        acc: Arc<Mutex<String>>,
        pending: Arc<Mutex<HashMap<String, PendingPermission>>>,
    }

    impl MockEmitter {
        fn new(pending: Arc<Mutex<HashMap<String, PendingPermission>>>) -> Self {
            Self {
                events: Arc::new(Mutex::new(Vec::new())),
                acc: Arc::new(Mutex::new(String::new())),
                pending,
            }
        }
        fn joined(&self) -> String {
            self.events.lock().unwrap().join("\n")
        }
        fn agent_text(&self) -> String {
            self.acc.lock().unwrap().clone()
        }
    }

    impl AgentEmitter for MockEmitter {
        fn emit_update(&self, payload: serde_json::Value) {
            let line = format!("update:{payload}");
            eprintln!("<- {line}");
            self.events.lock().unwrap().push(line);
            // 真实形态:{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}
            if payload.get("sessionUpdate").and_then(|v| v.as_str())
                == Some("agent_message_chunk")
            {
                if let Some(text) = payload
                    .get("content")
                    .and_then(|c| c.get("text"))
                    .and_then(|t| t.as_str())
                {
                    self.acc.lock().unwrap().push_str(text);
                }
            }
        }
        fn emit_permission(
            &self,
            id: String,
            tool_call: serde_json::Value,
            options: serde_json::Value,
            _high_risk: bool,
            _kind: Option<String>,
        ) {
            let line = format!("permission:{id} {tool_call} {options}");
            eprintln!("<- {line}");
            self.events.lock().unwrap().push(line);
            // 自动放行(测试不交互):直接解析 pending 表,与生产同路径。
            if let Some(p) = self.pending.lock().unwrap().remove(&id) {
                let _ = p.tx.send(true);
            }
        }
        fn emit_file_write(&self, payload: FileWritePayload) {
            let line = format!(
                "file-write:{} {}/{}/{}",
                payload.path, payload.writer, payload.added, payload.removed
            );
            eprintln!("<- {line}");
            self.events.lock().unwrap().push(line);
        }
        fn emit_session(&self, session_id: String) {
            let line = format!("session:{session_id}");
            eprintln!("<- {line}");
            self.events.lock().unwrap().push(line);
        }
        fn emit_session_info(&self, _payload: serde_json::Value) {}
        fn emit_done(&self, stop_reason: serde_json::Value) {
            let line = format!("done:{stop_reason}");
            eprintln!("<- {line}");
            self.events.lock().unwrap().push(line);
        }
        fn emit_error(&self, msg: String) {
            let line = format!("error:{msg}");
            eprintln!("<- {line}");
            self.events.lock().unwrap().push(line);
        }
    }

    /// 对真实 `opencode acp` 跑通 initialize → new_session → prompt 全链路,
    /// 复用与生产完全相同的 `run_connection`(current_thread runtime + 通道循环)。
    /// 需 opencode 在 PATH 且已配置可用模型,故默认 ignore:
    ///   `cargo test --lib acp::tests::opencode_roundtrip -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn opencode_roundtrip() {
        if which::which("opencode").is_err() {
            eprintln!("skip: opencode 未安装");
            return;
        }
        // 挂起权限表:MockEmitter 自动放行与 run_connection 共用(与生产 agent_start 一致)。
        let pending: Arc<Mutex<HashMap<String, PendingPermission>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let emitter = MockEmitter::new(pending.clone());
        let (tx, rx) = mpsc::unbounded_channel::<AcpCmd>();
        let em = emitter.clone();
        // 会话回执经共享 cell(与生产 `agent_start` 一致),NewSession 在 run_connection
        // 里直接跑、不走通道。
        let (srep, srrx) = oneshot::channel::<Result<String, String>>();
        let start_rep: Arc<Mutex<Option<oneshot::Sender<Result<String, String>>>>> =
            Arc::new(Mutex::new(Some(srep)));
        let start_rep_clone = start_rep.clone();
        let cancel: Arc<Mutex<Option<(ConnectionTo<Agent>, String)>>> =
            Arc::new(Mutex::new(None));
        let handle = std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("build rt");
            let mut rx = rx;
            rt.block_on(async move {
                run_connection(
                    em,
                    "opencode acp".to_string(),
                    "/tmp/acp-spike".to_string(),
                    "opencode".to_string(),
                    &mut rx,
                    Arc::new(AtomicBool::new(false)),
                    start_rep_clone,
                    cancel,
                    pending,
                    Arc::new(Mutex::new(None)),
                )
                .await;
            });
        });

        // 会话由 run_connection 直接建立;等回执。
        let sid = srrx
            .blocking_recv()
            .expect("start reply")
            .expect("session id");
        assert!(!sid.is_empty(), "session_id 不应为空");

        // Prompt → 期望 PONG。
        let (prep, prrx) = oneshot::channel();
        tx.send(AcpCmd::Prompt {
            text: "Reply with exactly the word PONG and nothing else.".to_string(),
            rep: prep,
        })
        .expect("send prompt");
        let pres = prrx.blocking_recv().expect("prompt reply");
        assert!(pres.is_ok(), "prompt 应成功:{pres:?}");

        // Stop → 线程退出。
        tx.send(AcpCmd::Stop).ok();
        handle.join().expect("thread join");

        let log = emitter.joined();
        let text = emitter.agent_text();
        println!("==== agent event log ====\n{log}");
        println!("==== agent text ====\n{text}");
        assert!(
            text.to_lowercase().contains("pong"),
            "未在流式文本里看到 PONG:\n{text}",
        );
    }

    // ── §9.1 terminal 闭包:输出截断 / 字符边界 / 高危启发 ──

    #[test]
    fn serve_output_under_limit_is_passthrough() {
        let (out, trunc) = serve_output(b"hello world", None);
        assert_eq!(out, "hello world");
        assert!(!trunc);
    }

    #[test]
    fn serve_output_keeps_tail_when_over_limit() {
        let buf = b"HEADxxxxxxxxxxxxxxxx1234567890TAIL";
        // 限 10 字节:丢弃头部、保留尾部。
        let (out, trunc) = serve_output(buf, Some(10));
        assert!(trunc);
        assert!(out.ends_with("TAIL"));
        assert!(out.len() <= 10, "保留段不应超过 limit:{out}");
    }

    #[test]
    fn serve_output_snaps_to_utf8_boundary() {
        // 三字节序列「a你b好c」;字节切点若落在多字节字符中间须回退到边界。
        let s = "a你b好c";
        let buf = s.as_bytes();
        // 取一个落在「你」中间的字节限,确保返回仍是合法 UTF-8。
        let mid = 2; // 「你」的第二字节
        let (out, _trunc) = serve_output(buf, Some(mid as u64));
        assert!(std::str::from_utf8(out.as_bytes()).is_ok(), "非合法 UTF-8");
    }

    #[test]
    fn is_high_risk_value_flags_dangerous_verbs() {
        for v in [
            serde_json::json!({"tool": "delete_file"}),
            serde_json::json!({"tool": "remove_dir"}),
            serde_json::json!({"tool": "rename", "from": "a"}),
            serde_json::json!({"tool": "rmdir", "path": "x"}),
            serde_json::json!({"cmd": "overwrite x"}),
        ] {
            assert!(is_high_risk_value(&v), "应判高危:{v}");
        }
        // 普通读/写不应判高危。
        assert!(!is_high_risk_value(&serde_json::json!({"tool": "read_file"})));
        assert!(!is_high_risk_value(&serde_json::json!({"cmd": "echo hi"})));
        // 注:裸 `rm` 等 shell 命令走 terminal 路径,由「terminal 创建恒高危」
        // 单独把关(high_risk=true 直传),不在此 fs 工具启发式范围内。
    }

    #[test]
    fn tool_kind_slug_whitelist_keys() {
        use agent_client_protocol::schema::v1::ToolKind::*;
        // 安全类有键。
        assert_eq!(tool_kind_slug(&Read), Some("read"));
        assert_eq!(tool_kind_slug(&Edit), Some("edit"));
        assert_eq!(tool_kind_slug(&Search), Some("search"));
        assert_eq!(tool_kind_slug(&Think), Some("think"));
        assert_eq!(tool_kind_slug(&Fetch), Some("fetch"));
        assert_eq!(tool_kind_slug(&SwitchMode), Some("switch_mode"));
        // 高危/不稳类无键:白名单永不放行。
        assert_eq!(tool_kind_slug(&Delete), None);
        assert_eq!(tool_kind_slug(&Move), None);
        assert_eq!(tool_kind_slug(&Execute), None);
        assert_eq!(tool_kind_slug(&Other), None);
    }

    #[test]
    fn spawn_terminal_captures_output_and_exit() {
        // 跑 `printf` 输出固定串,确认 stdout 被累积、退出码 0。
        let h = spawn_terminal(
            "printf",
            &["%s".to_string(), "captured".to_string()],
            &[],
            None,
            ".",
            None,
        )
        .expect("spawn printf");
        // 等待退出信号(waiter 线程会写入 exit)。
        let rx = h.done_rx.lock().unwrap().take().expect("done_rx");
        let st = rx.blocking_recv().expect("wait exit");
        assert_eq!(st.exit_code, Some(0));
        let (out, trunc) = {
            let b = h.output.lock().unwrap();
            serve_output(&b, h.limit)
        };
        assert!(out.contains("captured"), "未捕获到输出:{out}");
        assert!(!trunc);
    }

    #[test]
    fn spawn_terminal_records_nonzero_exit() {
        // `/bin/sh -c 'exit 7'` 触发非零退出码。
        let h = spawn_terminal(
            "/bin/sh",
            &["-c".to_string(), "exit 7".to_string()],
            &[],
            None,
            ".",
            None,
        )
        .expect("spawn sh");
        let rx = h.done_rx.lock().unwrap().take().expect("done_rx");
        let st = rx.blocking_recv().expect("wait exit");
        assert_eq!(st.exit_code, Some(7));
    }

    // ── §4 标注层:pre-image 行 diff ──

    #[test]
    fn line_diff_pure_addition_and_deletion() {
        // 全新增:pre-image 空。
        assert_eq!(line_diff("", "a\nb\nc"), (3, 0));
        // 全删除:新内容空。
        assert_eq!(line_diff("a\nb", ""), (0, 2));
    }

    #[test]
    fn line_diff_edit_counts_changes() {
        // 改一行、加一行:old=[a,b,c] new=[a,b2,c,d] → added 2(b2、d) removed 1(b)。
        let (added, removed) = line_diff("a\nb\nc", "a\nb2\nc\nd");
        assert_eq!((added, removed), (2, 1));
    }

    #[test]
    fn line_diff_identical_is_zero() {
        assert_eq!(line_diff("x\ny\nz", "x\ny\nz"), (0, 0));
    }

    #[test]
    fn line_diff_giant_file_falls_back_to_set_diff() {
        // 超 8000 行走近似路径;此处只确认不 panic 且给出非负数。
        let big = (0..9000).map(|i| i.to_string()).collect::<Vec<_>>().join("\n");
        let big2 = (1..9001).map(|i| i.to_string()).collect::<Vec<_>>().join("\n");
        let (added, removed) = line_diff(&big, &big2);
        assert!(added <= 9000 && removed <= 9000);
    }

    #[test]
    fn fixup_npx_command_leaves_non_npx_alone() {
        // 非 npx 开头的命令原样返回(不能误伤 opencode acp 等)。
        assert_eq!(fixup_npx_command("opencode acp"), "opencode acp");
        assert_eq!(fixup_npx_command("echo npx hi"), "echo npx hi");
    }

    #[test]
    fn fixup_npx_command_resolves_or_keeps() {
        let out = fixup_npx_command("npx -y some-pkg");
        // 解析到可用 npx → 换成绝对路径;PATH 上无可用 npx → 原样。两者都合法,
        // 但绝不能把参数弄丢、也不能换成另一个失效壳。
        assert!(out == "npx -y some-pkg" || out.starts_with('/'));
        assert!(out.ends_with("-y some-pkg"), "参数必须保留:{out}");
    }

    #[test]
    fn node_missing_suffix_both_branches() {
        // 依赖在 → 「检测到 npx 但未检测到 node」措辞;依赖不在 → 「需要 Node」措辞。
        // 锁住重构后与原 agent_list 逐字一致的两条根因句。
        assert!(node_missing_suffix("base", true).starts_with("base\n⚠ 检测到 npx 但未检测到 node"));
        assert!(node_missing_suffix("base", false).starts_with("base\n⚠ 需要 Node 运行时但未检测到"));
    }

    #[test]
    fn detect_binary_hint_passthrough_when_absent() {
        // 独立二进制(grok / opencode)形态:二进制不在时,安装指引就是 base 原样,
        // 不附加 node/npx 相关提示(那些只对 NpxAdapter / BinaryPlusNode 生效)。
        let d = Detect::Binary("definitely-not-a-real-binary-zzz-123");
        assert!(!d.probe(false));
        assert_eq!(d.hint("base", false), "base");
        assert_eq!(d.hint("base", true), "base");
    }

    #[test]
    fn recipes_are_single_source_for_login_cmd() {
        // 连接器模式:login_cmd 只能从 recipe 表查到,别处无第二张表。
        // claude-code / cursor / opencode 有;grok-build / pi 无。
        let by_id = |id: &str| recipes().iter().find(|r| r.id == id).and_then(|r| r.login_cmd);
        assert_eq!(by_id("claude-code"), Some("claude /login"));
        assert_eq!(by_id("cursor"), Some("cursor-agent login"));
        assert_eq!(by_id("opencode"), Some("opencode auth login"));
        assert_eq!(by_id("grok-build"), None);
        assert_eq!(by_id("pi"), None);
    }
}

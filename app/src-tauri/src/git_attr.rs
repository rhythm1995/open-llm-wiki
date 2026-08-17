//! Agent 写入的 git 归因(B-AGENT-GIT-ATTR / doc 11 §4)。
//!
//! ## 安全模型(§4「默认隔离 / quarantine」)
//!
//! - 每个 agent 的 turn 快照提交进 **`refs/agents/<agent-id>`** —— 一条独立前进的
//!   命名空间引用。**绝不动 HEAD / 主工作树历史**;`git push`(无显式 refspec)
//!   默认不外传,故也不泄漏。
//! - 快照用**临时 index 文件**(`GIT_INDEX_FILE`)构建,绝不污染用户真实暂存区。
//! - 撤销 = 把该 turn 的 diff **逆向 apply 回工作树**(`git apply --reverse`),
//!   只动工作树,不是 `git revert` 动 HEAD。用户对工作树完全掌控。
//! - 采纳 = 把该 turn 的 diff **提交进 HEAD**(`commit-tree` + `update-ref HEAD`),
//!   默认隔离 → 用户在活动面板显式点「采纳」才合入真实历史;不动用户暂存区。
//! - 非 git 仓库:**影子仓库**(§4)——`<vault>/.open-llm-wiki/agent-shadow.git` 独立
//!   git 目录镜像 vault 工作树,零污染用户文件(vault 内无 `.git`)。两条路径透明。
//!
//! ## 归因口径
//!
//! 每轮 turn **前后各打一次快照**(pre / post):post 的 diff(对相邻的 pre)= 该轮
//! agent 的纯写入(假设 turn 期间用户未编辑,否则混入用户改动 —— v1 已知局限)。
//! 活动面板列 post 提交,点开看 diff,一键撤销。

use serde::Serialize;

/// git 空树对象的固定 oid(所有仓库一致),用于「无父提交」基线比较。
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// 进程内单调计数器,给临时 index 一个**每次调用唯一**的文件名,避免并发快照
/// (多 agent / 多测试)撞上 git 的 `<index>.lock`。
static CALL_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// `refs/agents/<agent-id>` —— agent_id 是受控词表,仍 sanitize 一道防注入。
fn ref_name(agent_id: &str) -> String {
    let safe: String = agent_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    format!("refs/agents/{safe}")
}

/// 在 vault 根下跑 git,可带额外 env(临时 index / 提交身份)。失败返回 trimmed stderr。
/// 非 git vault 自动挂影子仓库 env(见 `repo_env`),对调用方透明。
fn run(root: &str, args: &[&str], env: &[(String, String)]) -> Result<String, String> {
    let mut full_env = repo_env(root)?;
    full_env.extend_from_slice(env);
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(root).args(args);
    for (k, v) in &full_env {
        cmd.env(k, v);
    }
    let out = cmd.output().map_err(|e| format!("无法运行 git:{e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(if stderr.trim().is_empty() {
            format!("git 退出码 {}", out.status.code().unwrap_or(-1))
        } else {
            stderr.trim().to_string()
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn is_repo(root: &str) -> bool {
    std::process::Command::new("git")
        .current_dir(root)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 非 git vault 的影子仓库路径:`<vault>/.open-llm-wiki/agent-shadow.git`。
/// 放在 app 私有目录里,vault 本身不被 `.git` 污染。
fn shadow_dir(root: &str) -> std::path::PathBuf {
    std::path::Path::new(root)
        .join(".open-llm-wiki")
        .join("agent-shadow.git")
}

/// 决定一次 git 调用该挂什么 env overlay。
/// - vault 本身是 git 仓库 → 空 overlay(`run` 在 root 原生跑)。
/// - 非 git vault → 惰性初始化**影子仓库**(bare),返回
///   `GIT_DIR=<shadow>`、`GIT_WORK_TREE=<vault>`,让 git 把 vault 当工作树、把
///   对象/refs 写进影子库。两条路径对调用方透明。
///
/// `is_repo` 走裸 git(不经 `run`),`repo_env` 的 init 也走裸 git,故无递归。
fn repo_env(root: &str) -> Result<Vec<(String, String)>, String> {
    if is_repo(root) {
        return Ok(vec![]);
    }
    let shadow = shadow_dir(root);
    if !shadow.exists() {
        if let Some(parent) = shadow.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("建影子目录失败:{e}"))?;
        }
        let out = std::process::Command::new("git")
            .args(["init", "--bare", shadow.to_string_lossy().as_ref()])
            .output()
            .map_err(|e| format!("init 影子仓库失败:{e}"))?;
        if !out.status.success() {
            return Err(format!(
                "init 影子仓库失败:{}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
    }
    Ok(vec![
        ("GIT_DIR".into(), shadow.to_string_lossy().into_owned()),
        ("GIT_WORK_TREE".into(), root.into()),
    ])
}

/// 解析一个 ref / oid 是否存在(不存在或不可解析 → None)。
fn resolve(root: &str, refname: &str) -> Option<String> {
    match run(root, &["rev-parse", "--verify", "--quiet", refname], &[]) {
        Ok(o) => {
            let t = o.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }
        Err(_) => None,
    }
}

fn head_oid(root: &str) -> Option<String> {
    resolve(root, "HEAD")
}

fn tree_of(root: &str, refname: &str) -> Result<String, String> {
    Ok(run(root, &["rev-parse", &format!("{refname}^{{tree}}")], &[])?
        .trim()
        .to_string())
}

/// agent 提交身份(避免无 user.name 时 commit-tree 失败,且明确归因来源)。
fn identity_env() -> Vec<(String, String)> {
    vec![
        ("GIT_AUTHOR_NAME".into(), "open-llm-wiki-agent".into()),
        ("GIT_AUTHOR_EMAIL".into(), "agent@openllmwiki.local".into()),
        ("GIT_COMMITTER_NAME".into(), "open-llm-wiki-agent".into()),
        ("GIT_COMMITTER_EMAIL".into(), "agent@openllmwiki.local".into()),
    ]
}

/// 把当前工作树打成一次快照提交,挂到 `refs/agents/<agent_id>`(不动 HEAD、不污染
/// 用户 index)。`phase` = "pre" | "post"。无变化返回 Ok(None)。
pub fn snapshot_turn(
    root: &str,
    agent_id: &str,
    phase: &str,
) -> Result<Option<String>, String> {
    let rf = ref_name(agent_id);
    let prev = resolve(root, &rf);
    // 父提交:有前一次快照则接它,否则接 HEAD(让首张快照挂在真实历史下,diff 干净)。
    let parent = prev.clone().or_else(|| head_oid(root));
    let base_tree = match &parent {
        Some(p) => tree_of(root, p)?,
        None => EMPTY_TREE.to_string(),
    };

    // 临时 index:read-tree 基线 → add -A 工作树 → write-tree。事后删除。
    let seq = CALL_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = std::env::temp_dir().join(format!(
        "open-llm-wiki-agent-idx-{agent_id}-{phase}-{}-{seq}",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(format!("{}.lock", tmp.to_string_lossy()));
    let env_index: Vec<(String, String)> = vec![(
        "GIT_INDEX_FILE".into(),
        tmp.to_string_lossy().into_owned(),
    )];
    if let Some(p) = &parent {
        run(root, &["read-tree", p.as_str()], &env_index)?;
    }
    run(root, &["add", "-A"], &env_index)?;
    let new_tree = run(root, &["write-tree"], &env_index)?
        .trim()
        .to_string();
    // 清理临时 index 及可能残留的 .lock(git 写失败时会留下)。
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_file(format!("{}.lock", tmp.to_string_lossy()));

    if new_tree == base_tree {
        return Ok(None); // 工作树相对基线无变化。
    }

    // commit-tree:new_tree [-p parent];身份 env 明确归因。
    let msg = format!("agent {agent_id} {phase} turn");
    let mut args: Vec<String> = vec!["commit-tree".into(), new_tree, "-m".into(), msg];
    if let Some(p) = &parent {
        args.push("-p".into());
        args.push(p.clone());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let id_env = identity_env();
    let commit = run(root, &refs, &id_env)?.trim().to_string();

    // update-ref:只动命名空间引用,绝不动 HEAD。
    run(root, &["update-ref", rf.as_str(), commit.as_str()], &[])?;
    Ok(Some(commit))
}

#[derive(Serialize)]
pub struct ActivityEntry {
    pub oid: String,
    /// "pre" | "post" | ""(从 subject 解析)。
    pub phase: String,
    /// 含时分(`%m-%d %H:%M`):同一天多轮才可区分。
    pub date: String,
    pub subject: String,
    /// 一行汇总,如「3 文件 +12/-3」。
    pub stat: String,
    /// 该轮触及的文件路径(面板展示「改了什么」的主要信息;最多 10 条)。
    pub files: Vec<String>,
    /// 该轮是否已合入 HEAD(手动「采纳」或即时提交自动采纳;按 adopt 提交消息匹配)。
    pub adopted: bool,
}

/// 单提交的 numstat 解析:一次 `git show --numstat` 同时得汇总(文件数 / 增 / 删)
/// 与文件清单(numstat 每行本就带路径)。二进制行(-\t-\t…)计入文件数不计行数。
fn stat_and_files(root: &str, oid: &str) -> Result<(String, Vec<String>), String> {
    let raw = run(root, &["show", "--numstat", "--format=", oid], &[])?;
    let (mut add, mut del, mut n) = (0i64, 0i64, 0usize);
    let mut files: Vec<String> = Vec::new();
    for line in raw.lines() {
        let mut f = line.splitn(3, '\t');
        let (a, d, p) = (f.next(), f.next(), f.next());
        if let (Some(a), Some(d), Some(p)) = (a, d, p) {
            if let Ok(v) = a.parse::<i64>() {
                add += v;
            }
            if let Ok(v) = d.parse::<i64>() {
                del += v;
            }
            if !p.is_empty() {
                n += 1;
                if files.len() < 10 {
                    files.push(p.to_string());
                }
            }
        }
    }
    Ok((format!("{n} 文件 +{add}/-{del}"), files))
}

/// HEAD 历史里已采纳的 turn 短 oid 集合:adopt_turn 的提交消息恒为
/// `adopt agent turn <short-oid>`,一条 `git log --grep` 全取出。失败 → 空集
/// (面板按未采纳显示,采纳按钮点了会如实报错)。
fn adopted_set(root: &str) -> std::collections::HashSet<String> {
    let mut s = std::collections::HashSet::new();
    if let Ok(raw) = run(
        root,
        &[
            "log",
            "HEAD",
            "--format=%s",
            "--grep=adopt agent turn",
            "--fixed-strings",
        ],
        &[],
    ) {
        for line in raw.lines() {
            if let Some(short) = line.strip_prefix("adopt agent turn ") {
                s.insert(short.trim().to_string());
            }
        }
    }
    s
}

/// 列出某 agent 的活动(最近 100 条快照,新→旧)。无 ref(含影子仓库未建) → 空。
pub fn activity(root: &str, agent_id: &str) -> Result<Vec<ActivityEntry>, String> {
    let rf = ref_name(agent_id);
    if resolve(root, &rf).is_none() {
        return Ok(vec![]);
    }
    let raw = run(
        root,
        &[
            "log",
            rf.as_str(),
            "--format=%H%x09%ad%x09%s",
            "--date=format:%m-%d %H:%M",
            "-n100",
        ],
        &[],
    )?;
    // 一次 log 取全部「已采纳」短 oid,供逐条标记(避免每条 entry 各跑一次 git)。
    let adopted = adopted_set(root);
    let mut out = Vec::new();
    for line in raw.lines() {
        let mut parts = line.splitn(3, '\t');
        let oid = parts.next().unwrap_or("").to_string();
        let date = parts.next().unwrap_or("").to_string();
        let subject = parts.next().unwrap_or("").to_string();
        if oid.is_empty() {
            continue;
        }
        let phase = if subject.contains(" pre turn") {
            "pre".into()
        } else if subject.contains(" post turn") {
            "post".into()
        } else {
            String::new()
        };
        let (stat, files) = stat_and_files(root, &oid).unwrap_or_default();
        // 短 oid 与 git 默认展示一致(7 位);adopt 提交消息里用的也是这个。
        // (先算出 adopted 再把 oid 移进结构体,避免借用冲突。)
        let is_adopted = adopted.contains(if oid.len() >= 7 { &oid[..7] } else { oid.as_str() });
        out.push(ActivityEntry {
            oid,
            phase,
            date,
            subject,
            stat,
            files,
            adopted: is_adopted,
        });
    }
    Ok(out)
}

/// 某提交的 unified diff(含精简头)。前端 <pre> 直接展示。
pub fn commit_diff(root: &str, oid: &str) -> Result<String, String> {
    Ok(run(
        root,
        &["show", oid, "--no-color", "--format=%H%n%ad %s%n", "--date=short"],
        &[],
    )?)
}

/// 撤销一个 turn:把该提交相对其父的 diff **逆向 apply 回工作树**(不动 index / HEAD)。
/// 工作树已变导致无法干净回滚时,git apply 非零退出 → 返回错误交前端提示。
pub fn revert_turn(root: &str, oid: &str) -> Result<(), String> {
    let has_parent = resolve(root, &format!("{oid}^")).is_some();
    let diff = if has_parent {
        run(root, &["diff", &format!("{oid}^"), oid], &[])?
    } else {
        // 根提交:用 show 取全量 diff(相对空树)。
        run(root, &["show", oid, "--format="], &[])?
    };
    if diff.trim().is_empty() {
        return Ok(());
    }
    let tmp = std::env::temp_dir().join(format!("open-llm-wiki-revert-{oid}.diff"));
    std::fs::write(&tmp, &diff).map_err(|e| e.to_string())?;
    let r = run(
        root,
        &["apply", "--reverse", tmp.to_string_lossy().as_ref()],
        &[],
    );
    let _ = std::fs::remove_file(&tmp);
    match r {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("逆向应用失败(工作树可能已变):{e}")),
    }
}

/// 采纳一个 agent turn:把该 turn 改动的文件**提交进 HEAD**(默认隔离 → 用户在活动
/// 面板显式点「采纳」才合入真实历史)。只 stage 该 turn 触及的文件(pathspec 精确范围),
/// 随即 `commit -- <paths>` 只提交这些路径 —— **不带走用户暂存的其它改动,不动工作树**
/// (工作树本就有该轮写入),且提交后索引对这些文件即干净。
///
/// 改动已入 HEAD(commit 报「nothing to commit」)→ 报错交前端提示。
pub fn adopt_turn(root: &str, oid: &str) -> Result<String, String> {
    let has_turn_parent = resolve(root, &format!("{oid}^")).is_some();
    // 该 turn 触及的文件清单(精确范围,只采纳这些)。
    let names: Vec<String> = if has_turn_parent {
        run(root, &["diff", "--name-only", &format!("{oid}^"), oid], &[])?
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        // 根提交:列出它引入的全部文件。
        run(root, &["show", "--name-only", "--format=", oid], &[])?
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    };
    if names.is_empty() {
        return Err("该 turn 无改动,无需采纳".into());
    }

    // stage 这些文件的工作树版本(-A 兼顾删除)进真实索引。
    let mut add_args: Vec<String> = vec!["add".into(), "-A".into(), "--".into()];
    add_args.extend(names.iter().cloned());
    let add_ref: Vec<&str> = add_args.iter().map(|s| s.as_str()).collect();
    run(root, &add_ref, &[])?;

    // 只提交这些路径(用户暂存的其它改动原样保留)。
    let short = if oid.len() >= 7 { &oid[..7] } else { oid };
    let mut commit_args: Vec<String> =
        vec!["commit".into(), "-m".into(), format!("adopt agent turn {short}")];
    commit_args.push("--".into());
    commit_args.extend(names.iter().cloned());
    let commit_ref: Vec<&str> = commit_args.iter().map(|s| s.as_str()).collect();
    match run(root, &commit_ref, &identity_env()) {
        Ok(_) => head_oid(root).ok_or_else(|| "采纳后取 HEAD 失败".into()),
        Err(e) => Err(format!("采纳提交失败(改动可能已入 HEAD):{e}")),
    }
}

// ───────────────────────── Tauri 命令 ──────────────────────────────

#[tauri::command]
pub fn agent_activity(root: String, agent_id: String) -> Result<Vec<ActivityEntry>, String> {
    activity(&root, &agent_id)
}

#[tauri::command]
pub fn agent_diff(root: String, oid: String) -> Result<String, String> {
    commit_diff(&root, &oid)
}

#[tauri::command]
pub fn agent_revert(root: String, oid: String) -> Result<(), String> {
    revert_turn(&root, &oid)
}

#[tauri::command]
pub fn agent_adopt(root: String, oid: String) -> Result<String, String> {
    adopt_turn(&root, &oid)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 在临时目录建一个 git 仓库(有初始提交),返回其路径。
    fn tmp_repo(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("open-llm-wiki-gitattr-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let run = |args: &[&str]| {
            std::process::Command::new("git")
                .current_dir(&dir)
                .args(args)
                .output()
                .map(|o| (o.status.success(), String::from_utf8_lossy(&o.stdout).into_owned()))
                .unwrap()
        };
        // 设身份避免 commit 失败。
        run(&["config", "user.email", "test@openllmwiki.local"]);
        run(&["config", "user.name", "test"]);
        run(&["init"]);
        run(&["add", "-A"]);
        // 初始提交:一个基线文件。
        std::fs::write(dir.join("base.md"), "# base\n").unwrap();
        run(&["add", "-A"]);
        run(&["commit", "-m", "init"]);
        dir
    }

    /// 快照捕获工作树改动并落到 refs/agents/<id>;ref 与 HEAD 解耦。
    #[test]
    fn snapshot_records_change_on_namespace_ref() {
        let dir = tmp_repo("snap");
        let root = dir.to_string_lossy().to_string();

        // 模拟 agent 写入。
        std::fs::write(dir.join("note-a.md"), "agent wrote\n").unwrap();

        let pre = snapshot_turn(&root, "opencode", "pre").unwrap();
        let post = snapshot_turn(&root, "opencode", "post").unwrap();
        // pre:工作树相对 HEAD 有 note-a.md → 有变化。
        assert!(pre.is_some(), "pre 应捕获到 note-a.md");
        // post:pre 之后无新写入 → 无变化 → None。
        assert!(post.is_none(), "post 紧跟 pre 且无新写,应为 None");

        // ref 存在且指向 pre;HEAD 未变(仍指向 init)。
        let rf = resolve(&root, "refs/agents/opencode");
        assert!(rf.is_some(), "refs/agents/opencode 应已创建");
        let head = head_oid(&root).unwrap();
        assert_ne!(rf.as_deref(), Some(head.as_str()), "命名空间 ref 不应等于 HEAD");

        // 活动列表含 pre 一条。
        let act = activity(&root, "opencode").unwrap();
        assert!(act.iter().any(|e| e.phase == "pre"), "活动应含 pre 条目");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// pre→(agent 写)→post:post 的 diff 应只含该轮新增文件。
    #[test]
    fn post_diff_is_pure_agent_write() {
        let dir = tmp_repo("diff");
        let root = dir.to_string_lossy().to_string();

        let _ = snapshot_turn(&root, "opencode", "pre").unwrap(); // 基线(无改动→None)
        // agent 写入。
        std::fs::write(dir.join("new.md"), "fresh\n").unwrap();
        let post = snapshot_turn(&root, "opencode", "post").unwrap().unwrap();

        let diff = commit_diff(&root, &post).unwrap();
        assert!(diff.contains("new.md"), "post diff 应含 new.md");
        assert!(diff.contains("+fresh"), "post diff 应含新增内容");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// revert 把 agent 新增的改动逆向 apply 回工作树(文件内容回到写入前)。
    #[test]
    fn revert_reverses_agent_write() {
        let dir = tmp_repo("revert");
        let root = dir.to_string_lossy().to_string();

        let _ = snapshot_turn(&root, "opencode", "pre").unwrap();
        std::fs::write(dir.join("gone.md"), "will be reverted\n").unwrap();
        let post = snapshot_turn(&root, "opencode", "post").unwrap().unwrap();

        // 撤销前文件存在。
        assert!(dir.join("gone.md").exists());
        revert_turn(&root, &post).unwrap();
        // 撤销后文件被移除(reverse-apply 一个「新增文件」patch = 删除)。
        assert!(!dir.join("gone.md").exists(), "revert 应移除 agent 新增文件");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 非 git 仓库 → 影子仓库:快照照常落进 `<vault>/.open-llm-wiki/agent-shadow.git`,
    /// vault 本身无 `.git`;活动可查;撤销逆向 apply 工作树。两条路径透明(§4)。
    #[test]
    fn non_git_vault_uses_shadow_repo() {
        let dir = std::env::temp_dir().join(format!(
            "open-llm-wiki-gitattr-shadow-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().to_string();

        // vault 内无 .git。
        assert!(!dir.join(".git").exists());

        // agent 写入后快照:应建影子仓库并返回 Some。
        std::fs::write(dir.join("shadow-note.md"), "shadow write\n").unwrap();
        let snap = snapshot_turn(&root, "opencode", "post").unwrap();
        assert!(snap.is_some(), "影子仓库下快照应成功");

        // vault 仍无 .git(零污染),影子仓库已建。
        assert!(!dir.join(".git").exists(), "vault 不应被 .git 污染");
        assert!(
            dir.join(".open-llm-wiki/agent-shadow.git").exists(),
            "影子仓库应已建"
        );

        // 活动可查。
        let act = activity(&root, "opencode").unwrap();
        assert!(!act.is_empty(), "影子仓库下活动应非空");

        // 撤销把 shadow-note.md 从工作树移除。
        let oid = snap.unwrap();
        revert_turn(&root, &oid).unwrap();
        assert!(!dir.join("shadow-note.md").exists(), "撤销应移除 agent 写入");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 采纳:把 turn 触及的文件提交进 HEAD,且只提交这些路径 —— 不带走用户暂存的
    /// 其它改动,提交后索引对这些文件即干净。
    #[test]
    fn adopt_commits_only_turn_files_into_head() {
        let dir = tmp_repo("adopt");
        let root = dir.to_string_lossy().to_string();

        let _ = snapshot_turn(&root, "opencode", "pre").unwrap();
        // agent 写入(将被采纳)。
        std::fs::write(dir.join("adopted.md"), "to be adopted\n").unwrap();
        let post = snapshot_turn(&root, "opencode", "post").unwrap().unwrap();

        // 用户另暂存一个**无关**文件(采纳不应带走它)。
        std::fs::write(dir.join("user-staged.md"), "user\n").unwrap();
        let _ = std::process::Command::new("git")
            .current_dir(&dir)
            .args(["add", "user-staged.md"])
            .status();

        let head_before = head_oid(&root).unwrap();
        let adopted = adopt_turn(&root, &post).unwrap();

        // HEAD 前进,正是采纳提交。
        let head_after = head_oid(&root).unwrap();
        assert_ne!(head_after, head_before, "采纳应使 HEAD 前进");
        assert_eq!(head_after, adopted, "HEAD 应指向采纳提交");

        // HEAD 树含 adopted.md(已被采纳)。
        let tree = std::process::Command::new("git")
            .current_dir(&dir)
            .args(["ls-tree", "-r", "--name-only", "HEAD"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap();
        assert!(tree.contains("adopted.md"), "采纳后 HEAD 应含 adopted.md");
        assert!(
            !tree.contains("user-staged.md"),
            "user-staged.md 不应被采纳带走"
        );

        // 暂存区:adopted.md 已干净入历史(不再待提交);user-staged.md 仍在。
        let staged = std::process::Command::new("git")
            .current_dir(&dir)
            .args(["diff", "--cached", "--name-only"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap();
        assert!(
            !staged.contains("adopted.md"),
            "adopted.md 应已入历史,不再待提交"
        );
        assert!(
            staged.contains("user-staged.md"),
            "user-staged.md 应原样保留在暂存区"
        );

        // 活动条目:采纳后该 turn 应标 adopted;文件清单含触及文件;日期含时分。
        let act = activity(&root, "opencode").unwrap();
        let entry = act
            .iter()
            .find(|e| e.oid == post)
            .expect("应有 post turn 对应条目");
        assert!(entry.adopted, "采纳后活动应把该轮标为 adopted");
        assert!(
            entry.files.iter().any(|f| f == "adopted.md"),
            "活动文件清单应含 adopted.md"
        );
        assert!(entry.date.contains(':'), "活动日期应含时分");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

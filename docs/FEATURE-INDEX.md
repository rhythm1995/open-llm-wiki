# 功能索引(已落地 · 给 AI / 人类快查)

> **只列已实现能力**。未做见 [plan.md](./plan.md) + [backlog.md](./backlog.md)。  
> 用法:按功能名搜 → 跳到代码 / 规格。

## 如何用本索引

1. 改功能前先在此表定位**入口文件**与 **backlog ID**。  
2. 纯逻辑优先 `core/` 或 `ui/src/lib/*`(TDD);IO 在 `app/src-tauri`。  
3. 媒体与笔记索引**分轨**:笔记 → `VaultIndex`;附件 → `MediaIndex`。

---

## 内核 / 索引

| 功能 | ID / 规格 | 代码入口 |
|---|---|---|
| Markdown + FM + wikilink 解析 | Phase1 / 03 | `core/src/parse.rs` |
| Note enrich / 标签 / 关系 | Phase1 | `core/src/index.rs` |
| 图谱 Wiki+Relation | Phase1 / F-GRAPH | `core/src/graph.rs` |
| QQL 求值(引擎) | F-QUERY | `core/src/query.rs` + `qql.rs` |
| 全文检索 | F-SEARCH | `core/src/search.rs` |
| VaultIndex 聚合 | — | `core/src/vault.rs` |
| **内容级 lint L1**(结构启发式,只产候选) | B-WIKI-LINT-CORE / -MCP | `core/src/lint.rs`(`contradiction_consistency` / `duplicate_names` / `summaries_on_superseded` / `refs_to_superseded` + `lint_all` 报告层);消费面 MCP `lint_vault` + app `lint_vault` 命令(B-WIKI-LINT-MCP);规格 [14](./14-llm-wiki-workflow.md) §3.2.2 |
| **MediaIndex**(附件文件表+引用正排/倒排) | B-ED-MEDIA-INDEX | `core/src/media.rs` |
| Live 增量索引 | — | `app/src-tauri/src/lib.rs`(`LiveVault`) |

## 附件 / 媒体

| 功能 | ID | 代码入口 |
|---|---|---|
| 粘贴/拖入/按钮插图 → vault 文件 + `![](…)` | B-ED-MEDIA / IMAGE-BUTTON / WYSIWYG-IMG | `ui/src/lib/attachments.ts`,`wysiwyg-media.ts`,`Editor.tsx`,`WysiwygView.tsx` |
| 附件布局 folder / date / **folder-note(默认)** / note-folder | B-ED-MEDIA-ORG | `attachments.ts` + Settings |
| 可读时间戳文件名 + 中文名消毒 | B-ED-MEDIA-ORG | `attachments.ts` |
| `attachment_exists` / `list_attachments` / data URL 读图 | — | `app` IPC + `ipc.ts` |
| 阅读侧相对路径 img 改写 | B-ED-MEDIA | `ReadingPane.tsx`,`rewriteHtmlImageSrcs` |
| 本笔记附件(Inspector) | B-ED-MEDIA-INDEX | `Inspector.tsx` tab media |
| 孤儿清理 → `.openobsidian/media-trash/` | B-ED-MEDIA-GC | ⌘K `clean-orphan-media`,`trash_attachments` |
| 并排阅读 | B-ED-READING | `editorLayout` + `ReadingPane` |
| Wiki 嵌入图 `![[img]]` 阅读渲染 + 短名解析 | B-ED-MEDIA-WIKI | `render.ts` wikiImageEmbed*;`ReadingPane` |
| 迁笔记受限搬图(同目录 / stem 桶,refcount==1) | B-ED-MEDIA-MOVE | `core/media.rs` plan+rewrite;`rename_note` |
| 规格 | — | [08-media-and-split-preview.md](./08-media-and-split-preview.md) |

## 编辑器

| 功能 | ID | 代码入口 |
|---|---|---|
| Source(CM6) + WYSIWYG(BlockNote) 双模 | B-ED-MODE-UX | `Editor.tsx`,`WysiwygView.tsx`,`edit-mode.ts` |
| 格式条 / 右键 | B-ED-FMT-BAR / CTX-MENU | `Editor.tsx` |
| ⌘F 查找替换 | B-ED-FIND-* | `FindBar.tsx`,`find-in-doc.ts` |
| 大纲 | B-ED-OUTLINE | Inspector outline + `scrollToLine` |
| wikilink 补全/跳转 | F-WIKILINK | `wikilink.ts`,两侧编辑器 |
| 阅读渲染 + sanitize | F-READING | `ui/src/lib/render.ts` |
| WYSIWYG 格式条(粗斜/标题/列表/引用/链接/图) | B-ED-WYSIWYG-FMT | `WysiwygView.tsx` fmt bar |
| 当前笔记断链提示 | B-ED-BROKEN-LINKS | `broken-links.ts` + Inspector 黄条 |
| **双模保真契约**(安全样例 + app/引擎双层门禁) | B-BN-FIDELITY + DEEP ✅ | `blocknote-fidelity.ts` + `blocknote-engine-roundtrip.ts`;WysiwygView 读写路径 |

## 图谱

| 功能 | ID | 代码入口 |
|---|---|---|
| force-graph Canvas 渲染 + d3-force / preset | Phase6 栈 | `GraphView.tsx`,`ForceGraphLayer.tsx` |
| 过滤 / 健康 / 分层 / 时间轴 | B-GRAPH-* | `graph-*.ts` |
| 布局落盘 `.openobsidian/graph-layout.json` | B-GRAPH-POS-PERSIST | IPC `read/save_graph_layout` |
| 规划(未完项) | §I | [12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md) |

## 导航 / 命令 / 设置

| 功能 | ID | 代码入口 |
|---|---|---|
| 文件树 / 标签 / 类型视图 | — | `Nav.tsx`,`nav-filter.ts` |
| 命令注册表 + ⌘K / 菜单 | B-CMD-* / 10 | `ui/src/lib/commands/*` |
| 三层搜索 ⌘P / ⌘⇧F | 10 | CommandPalette modes |
| Settings(主题/语言/附件/布局/日志) | — | `SettingsPanel.tsx`,`settings.ts` |
| 规格 | — | [10-menus-and-search.md](./10-menus-and-search.md) |

## 大件

| 功能 | ID | 代码入口 |
|---|---|---|
| 表格 F-SHEET | B-SHEET | `SheetView.tsx`,`sheet.ts` |
| 画布 Excalidraw MIT | F-CANVAS | `CanvasView.tsx` |
| 插件宿主(不深化) | B-PLUGIN ⛔ | 保留宿主 |
| MCP server v1 + 图工具(links / brief / write 审计;8 tools,含 `lint_vault`) | B-MCP / §I-B / §I-D | `mcp/` |
| Agent 一键接入(CLI `setup`/`doctor`/`init` + 桌面 Settings「Agent 记忆接入」) | B-MCP-ONBOARD | `mcp/src/onboard.rs`(lib 共用);`app/src-tauri/src/onboarding.rs`;`ui/src/components/AgentOnboardingSection.tsx`;`mcp/README.md` §Agent onboarding |
| LLM Wiki 脚手架(5 类型契约 + Health QQL **11** 条) | B-WIKI-STARTER / HEALTH-QQL | `templates/wiki-starter/`;`core/tests/wiki_health_qql.rs`;规格 [14](./14-llm-wiki-workflow.md) |
| provenance / reviewed / trust 软字段约定(P0 L1) | B-WIKI-PROVENANCE | `templates/wiki-starter/types/*` + `health/agent-unreviewed` 等;规格 [14](./14-llm-wiki-workflow.md) §3.1 / [research/trust-provenance-frontmatter.md](./research/trust-provenance-frontmatter.md) |
| 对话→vault 蒸馏 L2a(零代码工作流 + 提示词) | B-WIKI-AGENT-DOC | [14](./14-llm-wiki-workflow.md) §1.1;`templates/wiki-starter/prompts/ingest-distill.md` |
| 内容级 lint L2 工作流(agent-in-the-loop,零新工具) | B-WIKI-AGENT-DOC | [14](./14-llm-wiki-workflow.md) §3.2.3;调研 [research/content-lint-contradiction.md](./research/content-lint-contradiction.md) |
| OWF-1 格式规范(**档 1** ✅:装订现状 + 钉版本,零新词汇) | B-WIKI-FORMAT | 规格 [15](./15-owf-format.md);`format: owf/1` 声明在 `templates/wiki-starter/index.md`;宽容规则测试锁 `core/tests/owf_conformance.rs` |
| 规格 | — | [09-big-features-v1.md](./09-big-features-v1.md) |

## 应用内 Agent(ACP 托管 · Phase 7 ✅)

| 功能 | ID | 代码入口 |
|---|---|---|
| ACP 主线(专用线程 + 进程组 kill + 存活检测 + PATH 修正) | B-AGENT-SDK / SHELL / PATHFIX | `app/src-tauri/src/acp.rs` |
| 配方 picker(opencode / claude-code 等)+ 探测置灰 | B-AGENT-PICKER | `AgentPanel.tsx`(配方注册表见 `acp.rs`) |
| 流式对话 + tool_call 折叠卡 + inline 权限卡 | B-AGENT-THREADVIEW | `AgentPanel.tsx`,`ToolCard.tsx` |
| Composer:Send/Stop/Queue + `@`-笔记上下文药丸 | B-AGENT-COMPOSER | `AgentPanel.tsx` |
| 权限三档(逐次 / 宽松琥珀点 / 高危恒门控)+ 工具白名单 | B-AGENT-PERM | `acp.rs` + `AgentPanel.tsx` |
| Model C 跨 agent 移交(归一化 seed) | B-AGENT-CTX-MODELC | `agent-session.ts`(`normalizeForHandoff`) |
| 转录持久化(每 vault 一 SQLite + WAL + 历史回放) | B-AGENT-TRANSCRIPT | `app/src-tauri/src/transcript.rs` |
| git 归因活动面板(turn 快照 `refs/agents/*` + 影子仓库 + 采纳/撤销 + 即时提交) | B-AGENT-GIT-ATTR | `app/src-tauri/src/git_attr.rs`,`AgentActivity.tsx` |
| 区4 Inspector｜Agent tab + 三栏宽度拖拽 | B-AGENT-RIGHTCOL-TABS / B-COL-RESIZE | `Inspector.tsx`,`ColResizeHandle.tsx` |
| 规格 / 实施状态 | — | [11-in-app-agent-roadmap.md](./11-in-app-agent-roadmap.md) §10 |

## Git / 归档

| 功能 | 说明 | 代码入口 |
|---|---|---|
| 结构自动 commit | 建/删/改名 | `app` `git_commit_paths` |
| 归档=git 历史还原 | 无 `.trash/` 笔记机制 | `ArchiveView.tsx`,`git_*` IPC |
| 正文手动提交 | GitPanel | `GitPanel.tsx` |

## 诊断

| 功能 | ID | 代码入口 |
|---|---|---|
| 客户端文件日志(NDJSON + profile)+ 导出 bundle | B-LOG-BUS / UI / IPC-SPANS | `app/src-tauri/src/logging.rs`,`ui/src/lib/logger.ts` |
| TCP 日志端口(`OPENOBS_LOG_PORT`,`nc` 实时看 NDJSON;默认关) | B-LOG-PORT | `logging.rs` PortSink |
| 规格 | — | [13-client-logging.md](./13-client-logging.md) |

## 架构总览

| 文档 | 用途 |
|---|---|
| [02-architecture.md](./02-architecture.md) | 分层 / IPC |
| [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) | 实现真相 + mermaid |
| [01-vision.md](./01-vision.md) | 产品原则 |
| [04-features.md](./04-features.md) | 功能目录规格(含未做叙事,以 backlog 为准) |
| [05-tdd-strategy.md](./05-tdd-strategy.md) | 测试策略 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事(历史+前瞻) |

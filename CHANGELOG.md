# Changelog

本项目所有 notable 变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

v0.1.0 tag 之后的变更(开发于 `release/v0.1.0`)。

### ✨ 功能

#### 图谱

- **图渲染换代(force-graph)**:Cytoscape → `force-graph` Canvas 主路径;OpenWiki 气质 glow 节点 / 有向粒子边 / 邻域 dim / 选中不抢镜头;克制类型色板;工具条减料(过滤+更多)+ 当前笔记摘要卡。数据管线(filter/model/modes/落盘)保留。

#### 面向 AI(应用内 Agent)

- **应用内侧栏 Agent(ACP 托管)**:配方 picker(opencode / claude-code 等,运行时探测)+ 流式对话 + tool_call 折叠卡;Composer 单一动作槽(Send / Stop / Queue)+ `@`-笔记上下文药丸;权限三档(逐次 / 宽松琥珀点 / 高危恒门控)+ 工具分类白名单;Model C 跨 agent 移交;每 vault 一 SQLite 转录 + 历史会话回放。
- **git 归因活动面板**:agent 每轮写入打 turn 级快照进 `refs/agents/*`(不动 HEAD;非 git vault 走影子仓库),面板看 diff、采纳入 HEAD 或撤销;即时提交模式可选。

#### LLM Wiki

- **Wiki starter 脚手架**:`templates/wiki-starter/`(Source / Summary / Entity / Concept / Query 五类型契约 + index + 示例链)+ Health QQL **11** 条(`type: Query` 笔记;`core/tests/wiki_health_qql.rs` 锁语法与语义)+ 工作流文档(docs/14:ingest / research / consolidate)。
- **provenance 软字段约定(P0 L1)**:`provenance: human|agent|ingested` + `reviewed` + 可选 `trust` 进类型契约与示例;Health 增 agent-unreviewed / stale-agent-notes / unreviewed-pages / knowledge-mix 等溯源/漂移查询(字段可选、永不校验)。
- **内容级 lint L1(core)**:`core/src/lint.rs` 四条结构启发式(contradicts↔Contested 一致性、归一化撞名、Summary 挂废源、Active 引废源);只产候选、不自动改 status。消费面(MCP/UI)未接通。
- **蒸馏 L2a + lint L2 工作流(文档)**:docs/14 §1.1 对话→vault 零代码 ingest 路径 + `templates/wiki-starter/prompts/ingest-distill.md`;§3.2 分层 lint(链接/L1/L2 agent 五分类/L3 远期)。

#### 诊断

- **TCP 日志端口**:`OPENOBS_LOG_PORT=<port>` 在 127.0.0.1 起 PortSink,`nc` 实时看 NDJSON 流(默认关)。
- 日志按 target 级别 override(must-debug targets)。

#### 构建

- **universal DMG 脚本**:`scripts/build-universal-dmg.sh`(`--target universal-apple-darwin --bundles dmg`,自动补双架构 rust target);`build-app.sh` 仍为日常默认。

### 📚 文档

- 设计文档重编号(11 应用内 Agent / 12 图+Agent / 13 日志);README 双语重写(中 / 英);新增 agent 长期记忆调研(`docs/research/agent-memory-survey.md`)。
- 四篇专项调研:对话蒸馏 / provenance / 内容 lint / 语义检索(`docs/research/*`);survey §7.4 优先级与品味依赖排序。
- docs/14 扩写:蒸馏 L2a、结构 lint L1 索引、内容级 lint L2 agent 工作流;plan「评估后不做」:core+mcp 抽独立库(技术可行、人否决)。
- FEATURE-INDEX / backlog 对齐:Health 11 条、lint core、LINT-MCP/UI 暂不做、MCP 工具数 7。

## [0.1.0] — 2026-08-03

首个可发布版本（技术 beta）。本地优先、文件即真相的知识库：双模编辑器 + Cytoscape 图谱 + Excalidraw 画布 + Sheet 表格 + git 集成，全部跑在你自己的机器上，无需账号、无云同步。

### ✨ 功能

#### 编辑器

- **双模编辑**：CodeMirror 6 源码模式 + BlockNote 所见即所得(WYSIWYG)；二者间 BlockNote↔Markdown 高保真往返（真引擎门禁 + 23 例诊断套件）。
- source 格式工具条（粗 / 斜 / 标题 / 列表 / 引用 / wikilink / 任务 / 图片）+ WYSIWYG 对齐格式条。
- ⌘F 文内查找 + 替换（双模对齐）；大纲(headings) 跳转；source｜reading 并排预览（布局持久化）。
- 图片：粘贴 / 拖入 / 插入按钮 / `![[img]]` wiki 嵌入，统一进 `attachments/`；MediaIndex 一等索引 + 孤儿附件清理(media-trash)。
- 当前笔记断链提示（Inspector 黄条）；迁笔记受限搬图（refcount==1 同目录桶 + 改正文）。

#### 图谱

- Cytoscape 渲染 wikilink + frontmatter 关系图；按 type 分层 / 时间轴(created·modified) / 力导向布局切换；过滤面板；布局坐标暖启动。

#### 画布与表格

- Excalidraw 画布（MIT）。
- Sheet 嵌入式表格（v2）；⛔ 暂不做 XLSX 全量互通 / 实时协作。

#### 命令 / 搜索 / 菜单

- ⌘K 命令面板（命令 + 附带文件）、⌘P 快开、⌘⇧F 库内全文检索（含 canvas / sheet，排序纯函数）。
- 系统应用菜单栏(File / Edit / View)；右键覆盖：笔记列表行 / 图谱节点 / 编辑器正文 / Nav 文件夹·类型·标签 / Tab 栏。
- Nav 树：文件夹新建、类型 / 标签筛选、拖拽移动。

#### 数据与同步

- Live 索引 + 文件 watcher + 刷新自愈。
- git 集成：status / log / commit / pull / push / init / restore + 自动提交；集中结构化打点。

#### 诊断 / 设置 / i18n

- LogBus 日志（dev / verbose / prod profile）+ 打开日志目录 + 导出 bundle；panic hook。
- 设置：主题 / 语言 / 默认编辑模式 / 图设置 / 日志 profile。
- zh / en 国际化；恢复上次笔记；标签循环。

#### 面向 AI（MCP）

- 内置 MCP server（6 tools）：`list_notes` / `read_note` / `write_note` / `search_notes` / `run_qql` / `vault_info`，供 Claude Desktop 等 agent 读写库。

### ⚠️ 已知限制

- **图谱打磨推迟**：本期不做布局坐标落盘序列化、力参数面板、最短路径高亮、隐藏悬空节点、图健康 UI 增强（整期转远期）。图谱主路径可用，但未达商业级精致。
- **未签名 / 未公证**：macOS 构建未签名（凭证门），首次运行被 Gatekeeper 拦截 —— 右键「打开」，或终端执行 `xattr -dr com.apple.quarantine /path/to/OpenObsidian.app`。需 macOS 10.15+。
- **无自动更新**（凭证门）。
- **QQL 用户面已移除**：仅保留 Rust core + MCP `run_qql`（程序化 / agent 用），无 GUI 查询界面。
- **插件系统**：宿主保留，v1 不做插件商店 / vault 扫描 / 签名。
- **BlockNote 保真边界**：嵌套任务 / HTML(表格+行内) / 全 GFM 字节身份不在字节级保真范围。
- **universal DMG**：当前按架构分别打包，暂无 universal 二合一。

### 🔧 技术栈

Tauri v2 + Rust core · React 19 + Vite 7 + TypeScript · CodeMirror 6 + BlockNote · Cytoscape + Excalidraw · MIT 许可。

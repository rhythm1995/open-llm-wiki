# Changelog

本项目所有 notable 变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] — 2026-08-18

首个可发布版本（技术 beta）。本地优先、文件即真相的知识库：双模编辑器 + force-graph 图谱 + Excalidraw 画布 + Sheet 表格 + git 集成 + 应用内 Agent + LLM Wiki 工作流，全部跑在你自己的机器上，无需账号、无云同步。

> 合并说明:tag `v0.1.0` 于发布前移至 `b537f74`,原记在 [Unreleased] 的变更(开发于 `release/v0.1.0`)全部包含在本次发布产物中,故并入本节。

### ✨ 功能

#### 编辑器

- **双模编辑**:CodeMirror 6 源码模式 + BlockNote 所见即所得(WYSIWYG);二者间 BlockNote↔Markdown 高保真往返(真引擎门禁 + 31 例诊断套件)。
- source 格式工具条(粗 / 斜 / 标题 / 列表 / 引用 / wikilink / 任务 / 图片)+ WYSIWYG 对齐格式条。
- ⌘F 文内查找 + 替换(双模对齐);大纲(headings)树形折叠 + 点击跳转(双模);source｜reading 并排预览(布局持久化)。
- 图片:粘贴 / 拖入 / 插入按钮 / `![[img]]` wiki 嵌入,统一进 `attachments/`;MediaIndex 一等索引 + 孤儿附件清理(media-trash)。
- 当前笔记断链提示(Inspector 黄条);迁笔记受限搬图(refcount==1 同目录桶 + 改正文)。
- **卸载 flush 所有权回写**:修复 WYSIWYG 编辑后快速切 tab 把旧内容写进新笔记的竞态(`writeScoped` + rename 别名重定向)。
- **IME 组合期 Enter 守卫**:拼音候选确认不再误发送 / 误提交(9 处受控输入)。

#### 图谱

- **force-graph Canvas 渲染 + d3-force-3d 力导向**(换代自 Cytoscape):glow 节点 / 有向粒子边 / 邻域 dim / 克制类型色板;布局冻结(点选不 reheat)+ path 坐标记忆;相机软边界 + 空视口「回到图」;聚焦可退出(双击/右键/Esc/芯片 ×)。
- 按 type 分层 / 时间轴(created·modified) / 力导向布局切换;过滤面板;布局坐标落盘(`.open-llm-wiki/graph-layout.json`,默认 gitignore)。

#### 画布与表格

- Excalidraw 画布(MIT)。孤立白板(与图谱/QQL/搜索解耦);「新建」入口默认隐藏,已有 `.canvas` 仍可编辑。
- Sheet 嵌入式表格(v2);⛔ 暂不做 XLSX 全量互通 / 实时协作。

#### 命令 / 搜索 / 菜单

- ⌘K 命令面板(命令 + 附带文件)、⌘P 快开、⌘⇧F 库内全文检索(含 canvas / sheet,排序纯函数)。
- 系统应用菜单栏(File / Edit / View);右键覆盖:笔记列表行 / 图谱节点 / 编辑器正文 / Nav 文件夹·类型·标签 / Tab 栏。
- Nav 树:文件夹新建、类型 / 标签筛选、拖拽移动;空文件夹不画展开三角。

#### 数据与同步

- Live 索引 + 文件 watcher + 刷新自愈。
- git 集成:status / log / commit / pull / push / init / restore + 自动提交;集中结构化打点。
- 打开笔记不再误保存(相同字节不落盘、不冲列表顶)。

#### 应用内 Agent(ACP 托管)

- **Agent 侧栏**:配方 picker(opencode / claude-code 等)+ 流式对话 + tool_call 折叠卡;Composer Send / Stop / Queue + `@`-笔记上下文药丸;权限三档(逐次 / 宽松琥珀点 / 高危恒门控)+ 工具白名单;Model C 跨 agent 移交;每 vault 一 SQLite 转录 + 历史回放。
- **git 归因活动面板**:turn 级快照进 `refs/agents/*`(不动 HEAD;非 git vault 走影子仓库),看 diff、采纳入 HEAD 或撤销;即时提交模式可选。
- **MCP 注入**:ACP 会话自动注入本机 `open-llm-wiki-mcp`;活会话切栏再回来不冷启动。

#### LLM Wiki(库即 Agent 记忆)

- **Wiki starter 脚手架**:`templates/wiki-starter/`(Source / Summary / Entity / Concept / Query 五类型契约 + index + 示例链)+ Health QQL **11 条**(`core/tests/wiki_health_qql.rs` 锁语法与语义)+ 工作流文档(docs/14)。
- **库健康看板**:第四主视图一键跑 11 条锁定 QQL + 总览六格分数(来源消化 / 主张达标 / 争议 / 孤儿 / 单源)+ 饥饿目标 + 前沿打分;「问 Agent」NL→QQL 短指令(不重建 QueryPanel)。
- **提炼进 Wiki**:`type: Source` / 未分类笔记顶栏一键预填 ingest 指令给 Agent;wiki 操作系统文件(AGENTS/skills/prompts)不当原料。
- **hot.md 会话缓存**:Agent 首轮 / 每 6 回合静默注入;写过库则提醒覆写。
- **OWF-1 格式规范**(档 1):`format: owf/1` vault 自描述 + 宽容规则测试锁(`owf_conformance.rs`)。
- **provenance 软字段约定**:`provenance / reviewed / trust`(可选、永不校验)+ 溯源 / 漂移 Health 查询。
- **内容级 lint L1**(core 四条结构启发式,只产候选)+ MCP `lint_vault` 工具 + ACP 轮次结束检查提示。

#### 面向 AI(MCP)与接入

- 内置 MCP server(**8 tools**):`list_notes` / `read_note` / `write_note` / `links` / `search_notes` / `run_qql` / `vault_info` / `lint_vault`;read 附 graph 简报,write 返回 broken_links。
- **一键接入**:`open-llm-wiki-mcp setup / doctor / init`(CLI)或桌面设置面板一次点击,自动探测 7 家 agent 并写用户级配置(备份 / 原子写 / dry-run);MCP 二进制作 sidecar 随包嵌入。
- `open-llm-wiki-skills` npx 安装器(skill + hooks 模板,GitHub 源)。

#### 桌面体验

- **首次启动欢迎台**:打开文件夹 / 示例知识库 / 最近 MRU / 拖放文件夹;首次理念 MG 动画。
- **菜单栏 tray 图标**:关窗收起不退出,左键唤起,右键 Quit。
- Inspector 改知识卡片(反链按来源合并、类型说明折叠、属性分组)。
- 问题反馈 / 用户指南入口(帮助手册、⌘K、设置→诊断、Help 菜单)。

#### 诊断 / 设置 / i18n

- LogBus 日志(dev / verbose / prod profile)+ 打开日志目录 + 导出 bundle;panic hook;可选 TCP PortSink(`OPEN_LLM_WIKI_LOG_PORT`)。
- 设置:主题 / 语言 / 默认编辑模式 / 附件布局 / Agent 记忆接入 / 日志 profile。
- zh / en 国际化;恢复上次笔记;标签循环。

#### 构建与官网

- universal DMG 脚本:`scripts/build-universal-dmg.sh`(自动补双架构 rust target)。
- 官网 `site/`(Vite + React):首页 + 渲染 `docs/user` 为 `/docs`(双语),GitHub Pages 部署。

### 🐛 修复

- **提炼/查询种子残留**:指令发出后即消费,换笔记/换库清空;面板卸载再挂不误武装。
- **Help 菜单开多窗**:订阅泄漏改单次订阅 + URL 去重。
- **类型展示**:Concept 中文「主张」;Query 展示「查询笔记」;TYPES 图标按类型区分。`type:` 词表不动。

### 📚 文档

- 双语 README(英/中)+ Diátaxis 用户文档(`docs/user/`,教程/指南/参考/概念,实机截图)。
- agent 长期记忆调研 + 四篇专项调研(对话蒸馏 / provenance / 内容 lint / 语义检索)。
- docs/14 工作流扩写(蒸馏 L2a、lint L1/L2);docs/15 OWF-1;docs/16 首次启动理念 MG。

### ⚠️ 已知限制

- **发布产物缺 Linux + macOS x64**(release run 被取消,`B-RELEASE-ASSETS`);现有:macOS aarch64 + Windows x64。
- **图谱打磨推迟**:力参数面板、最短路径高亮、隐藏悬空节点、图健康 UI 增强整期转远期。图谱主路径可用(帧率已真机验收),未达商业级精致。
- **未签名 / 未公证**:macOS 构建 ad-hoc 签名(凭证门),首次运行被 Gatekeeper 拦截 —— 右键「打开」,或 `xattr -cr /path/to/Open LLM Wiki.app`。Windows 未签名。
- **无自动更新**(凭证门)。
- **QQL 用户面已移除**:仅保留 Rust core + MCP `run_qql`(程序化 / agent 用),无 GUI 查询界面。
- **插件系统**:宿主保留,v1 不做插件商店 / vault 扫描 / 签名。
- **BlockNote 保真边界**:嵌套任务 / HTML(表格+行内) / 全 GFM 字节身份不在字节级保真范围。

### 🔧 技术栈

Tauri v2 + Rust core · React 19 + Vite 7 + TypeScript · CodeMirror 6 + BlockNote · force-graph + Excalidraw · Apache-2.0 许可。

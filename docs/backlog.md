# 未完成清单(Backlog)

> **单一事实来源**:「还没做 / 还要做」看本文。  
> 实施切片见 [plan.md](./plan.md);已做功能索引见 [FEATURE-INDEX.md](./FEATURE-INDEX.md);路线图叙事见 [06-roadmap.md](./06-roadmap.md)。  
> 状态:⏳ 未做 · 🟡 部分 · ✅ 已做 · 🧪 真机验收 · 🔑 凭证门  
> 难度:🟢 易 · 🟡 中 · 🔴 硬

**边界变更(2026-07-30)**:原「v1 刻意不做」三项改为正式交付目标并已落地(§A ✅)。软类型原则不变:`type` 永不强制校验、永不阻止保存。  
**优先级(2026-08-02)**:图 / Agent(§I)降优;主线 **§C 编辑器** + 非图杂项。切片见 [plan.md](./plan.md)。

---

## A. 原 v1 边界 → **已全部落地** ✅

| ID | 项 | 状态 | 说明 |
|---|---|---|---|
| B-TYPE-DOC | 类型文档 | ✅ | `types/{Type}.md` / `type: TypeDoc`;Inspector「类型说明」仅提示 |
| B-GRAPH-LAYER | 图谱按 type 分层 | ✅ | `graph-modes.layoutByTypeLayer` |
| B-GRAPH-TIME | 图谱时间轴 | ✅ | `layoutByTimeline`(created/modified) |
| B-GRAPH-LAYOUT-UI | 布局切换 UI | ✅ | GraphView 右上角 select |
| B-QQL-EXPAND | QQL 常用子集扩展 | ✅ | `CONTAINS`/`STARTSWITH`/`ENDSWITH`/`IN` 在 Rust core;~~mock-qql 同步~~ 🗑️ 已删(2026-08-02 随 QQL 用户面) |

---

## B. 产品大件

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SHEET | **F-SHEET 嵌入式表格** | 🔴 | ✅ | v2 齐;⛔ 不做 XLSX 全量互通 / 实时协作(对照 Obsidian 核心亦非主路径;git 即可) |
| B-PLUGIN | **F-PLUGIN 插件系统** | 🔴 | ⛔ | v1 宿主保留;产品决定**不再深化**(无商店/vault 扫描 UI/签名) |
| B-MCP | **完整 MCP server(AI 写侧)** | 🔴 | 🟡 | v1 6 tools:`list_notes`/`read_note`/`write_note`/`search_notes`/`run_qql`/`vault_info` ✅;图工具化见 **§I-B** |
| B-BN-FIDELITY | **BlockNote ↔ Markdown 保真** | 🟡 | ✅ | 安全样例表 + app 层 wikilink/fm;与 DEEP 共用 `safeFixtureHolds` |
| B-QQL-TS | ~~**QQL 求值器移植到 TS**~~ | 🔴 | 🗑️ 已删 | 2026-08-02 随 QQL 用户面删除:`ui/src/lib/qql/*` + `mock-qql` 全清。引擎仅留 Rust core + MCP `run_qql`(见 [04](./04-features.md) F-QUERY) |

---

## C. 编辑器体验

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-ED-FMT-BAR | Source 格式工具条 | 🟡 | ✅ | |
| B-ED-CTX-MENU | Source 正文右键 | 🟢 | ✅ | |
| B-ED-FIND-PARITY | ⌘F 双模对齐 | 🟡 | ✅ | 切 source + CM 高亮 |
| B-ED-QQL-WYSIWYG | ~~WYSIWYG 内联 qql~~ | 🟡 | 🗑️ 已删 | 2026-08-02 随 QQL 用户面删除 |
| B-ED-MODE-UX | 双模切换心智 | 🟢 | ✅ | 保真提示 + ⌘K/菜单/设置默认模式 |
| B-ED-MEDIA | 图片粘贴/拖入/预览 | 🟡 | ✅ | source+**wysiwyg** 粘贴/拖入→`attachments/`;阅读改写 img |
| B-ED-MEDIA-ORG | 附件组织 v1.5 | 🟡 | ✅ | layout(folder-note 默认)/可读 stamp/`attachment_exists`+`list_attachments`/md 引用索引+orphan 纯函数;Settings 可改布局 |
| B-ED-MEDIA-INDEX | MediaIndex 一等索引 | 🟡 | ✅ | core `media` + live 增量 + IPC + Inspector 附件 tab + ⌘K 确认清理孤儿→media-trash;删笔记不自动 GC |
| B-ED-READING | 并排预览 | 🟢 | ✅ | v1:source 左编辑\|右 ReadingPane;`editorLayout` 持久化;非 Live Preview |
| B-ED-OUTLINE | 大纲(headings) | 🟢 | ✅ | Inspector headings 列表 → `onJumpToLine` → `Editor.scrollToLine` |
| B-ED-FIND-REPLACE | 查找替换 | 🟢 | ✅ | FindBar 展开替换行;replace / replace all;纯逻辑 `replaceAllInDocument` |
| B-ED-IMAGE-BUTTON | 插入图片按钮 | 🟢 | ✅ | source 格式条 + WYSIWYG 条;`input type=file` → 既有 attachments 管线 |
| B-ED-WYSIWYG-IMG | WYSIWYG 图片路径一致性 | 🟡 | ✅ | `uploadFile`→attachments 相对路径;`resolveFileUrl` 显示;与粘贴/拖入/按钮同管线 |
| B-ED-MEDIA-GC | 附件孤儿清理 UI | 🟡 | ✅ | ⌘K 确认清理 + media-trash;与 MediaIndex 同批收口 |
| B-ED-MEDIA-WIKI | `![[img]]` wiki 嵌入图 | 🟡 | ✅ | 阅读 render+短名 resolve;插入默认仍 `![](…)`;`![[Note]]` 降级 wikilink |
| B-ED-MEDIA-MOVE | 迁笔记受限搬图 | 🟡 | ✅ | rename_note:refcount==1 + 同目录/stem 桶 + 改正文;core plan+rewrite |
| B-ED-WYSIWYG-FMT | WYSIWYG 格式条对齐 source | 🟢 | ✅ | 粗/斜/H1–3/列表/引用/wikilink + 图片 |
| B-BN-FIDELITY-DEEP | 真引擎 md↔blocks 往返门禁 | 🔴 | ✅ | `blocknote-engine-roundtrip`+双层 `safeFixtureHolds`;列表 `-/*` + hr 三写法规范化;⛔ 嵌套任务/HTML(表+行内)/全 GFM 字节身份(风险清单);`blocknote-fidelity-sweep.test` 23 例诊断 |
| B-ED-BROKEN-LINKS | 当前笔记断链提示 | 🟢 | ✅ | Inspector 黄条;纯逻辑 `broken-links.ts` |
| B-ED-TASK-BTN | source 任务列表按钮 | 🟢 | ✅ | 格式条 `ListChecks` → `toggleTaskList`(纯逻辑 `md-format`);已是任务项剥 checkbox,否则加 `- [ ] ` |

---

## D. 菜单与命令

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-APP-MENU | 系统应用菜单栏 | 🟡 | ✅ | Tauri File/Edit/View → `menu-action` 事件 |
| B-PALETTE-EXPAND | ⌘K 命令扩面 | 🟢 | ✅ | + 设置入口 |
| B-NAV-CTX | Nav 树右键 | 🟢 | ✅ | 文件夹新建;类型/标签筛选+复制 |
| B-TAB-CTX | 标签页右键 | 🟢 | ✅ | |
| B-SETTINGS | 设置页 | 🟡 | ✅ | 主题/语言/默认编辑模式 |

**右键覆盖**:

| 区域 | 状态 |
|---|---|
| 笔记列表行 | ✅ |
| 图谱节点 | ✅ |
| 编辑器正文(source) | ✅ |
| Nav 文件夹/类型/标签 | ✅ |
| Tab 栏 | ✅ |
| 画布 | Excalidraw 自带 |

---

## E. 图谱 / 查询(剩余)

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-GRAPH-FPS | 万级帧率验收 | 🟡 | 🧪 | Cytoscape 主路径;生成器有;fps 数字仍靠本机 GUI(旧 Barnes-Hut 冒烟已随栈退役) |
| B-QQL-MOCK-GAP | ~~mock 与 core 语义~~ | 🟡 | 🗑️ 已删 | mock `run_qql`→QQL-TS 随 QQL 用户面删除(2026-08-02) |
| B-QQL-PARITY-CI | ~~TS↔Rust 同批查询差分~~ | 🟡 | 🗑️ 已删 | `qql/parity.test.ts` 随 QQL 用户面删除(2026-08-02);Rust core 单测仍在 |

---

## F. 分发与工程

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SIGN-MAC | macOS 签名 + 公证 | 🟢 | 🔑 | 需 APPLE_* secrets |
| B-SIGN-WIN | Windows 安装包签名 | 🟢 | 🔑 | 需证书 |
| B-UPDATER | 自动更新 | 🟡 | 🔑 | 需密钥 + 是否上线决策 |
| B-UNIVERSAL-DMG | universal `.dmg` | 🟢 | ✅ | `scripts/build-universal-dmg.sh`(--target universal-apple-darwin --bundles dmg;自动补双 rust target);`build-app.sh` 仍为默认日常 .app |
| B-AGENTS-TLDRAW | ~~AGENTS.md tldraw 叙述~~ | 🟢 | ✅ | tldraw 引用已从 AGENTS.md 移除(画布=Excalidraw MIT) |
| B-MERGE-MAIN | `feat/phase1-core` → main | 🟢 | ✅ | 已合入 main(`84accb0`);后续开发在 `release/v0.1.0`(v0.1.0 tag 已打,领先 main) |

---

## G. 已完成(勿重复开坑)

- F-GRAPH 主路径(Cytoscape + cose/preset)+ 多布局(力导向/分层/时间轴)+ 过滤/健康/落盘  
- F-QUERY 引擎(Rust core + MCP `run_qql`)+ CONTAINS/STARTSWITH/ENDSWITH/IN + histogram;~~内联 qql(source)+ saved query~~ 用户面 2026-08-02 已删  
- Live 索引 + watcher + 刷新索引自愈  
- Excalidraw 画布;⌘F/⌘P;Nav TAGS;拖拽移动;git pull/push;类型文档提示  
- zh/en i18n;标签循环;恢复上次笔记;CI + 本地 dmg  
- 应用内 Agent 侧栏(§K,Phase 7);LLM wiki 脚手架(§I-D);客户端日志(§J)  

---

## H. 菜单 · 命令面板 · 搜索(见 [10](./10-menus-and-search.md)) ✅

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-CMD-REGISTRY | 单一命令注册表 + `runCommand` | 🟡 | ✅ | `ui/src/lib/commands/*` |
| B-APP-MENU-V2 | 系统菜单补齐 + ⌘O=Open Vault | 🟡 | ✅ | File/Edit/View 扩;menu-action→dispatch |
| B-PALETTE-V2 | 面板三 mode:commands/files/search | 🟡 | ✅ | ⌘K/⌘P/⌘⇧F;⌘O=开 vault |
| B-SEARCH-UI | 库内全文 UI 接 `searchNotes` | 🟡 | ✅ | Palette mode=search |
| B-SEARCH-RANK | 快开排序纯函数 | 🟢 | ✅ | `rankFiles` + canvas/sheet |
| B-CMD-TEST | 注册表/过滤 + 面板 + e2e | 🟡 | ✅ | commands.test 20; CommandPalette.test 7; e2e palette-search 5 |

---

## I. 图谱打磨 → Agent（远期 · 本期不做）

> **产品拍板(2026-08-02)**:**§I 图谱 polish(6A)整期推迟到很后**——图打磨 ROI 低、实现成本高(「图不好做」),本期不再开。引擎保留待远期。完整规格见 **[12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md)**。  
> **例外(已落地)**:6B 的 **agent 侧 MCP 图工具**(`links` / read 简报 / write 审计 / 客户端配置)已随 MCP server 交付,见 §I-B ✅;**6D wiki 脚手架已交付**(2026-08-05),见 §I-D ✅;§I 真正剩余的是**人侧**——6A 图 polish 全部 + `B-GRAPH-HEALTH-UI`(+ 6C 语义可选)。  
> **历史(2026-08-01)**:曾规划先图再 agent;**已被 2026-08-02 决策覆盖**。  
> 引擎保留 **Cytoscape** + graph-* 纯逻辑 + QQL(IR/MCP) + Rust core;若远期重启,剩余默认顺序 **6A → 6C**(6B MCP 侧 / 6D 已交付)。

### I-A · 6A 传统图 polish（人侧 · 本期推迟）

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-GRAPH-POS-PERSIST | 布局坐标**落盘** | 🟡 | ✅ | `read/save_graph_layout` IPC + GraphView 读写 `.openobsidian/graph-layout.json`;写盘不走结构自动 commit(P6-7) |
| B-GRAPH-FORCES | 力参数 + Recalculate | 🟡 | ⏳ | center/repel/link/distance;Reset 默认 |
| B-GRAPH-SETTINGS-UI | 图设置分组面板 | 🟡 | ⏳ | Filters / Display / Text / Forces |
| B-GRAPH-HIDE-UNRESOLVED | 隐藏悬空/phantom | 🟢 | ⏳ | ghost 边一键 hide |
| B-GRAPH-PATH | 最短路径高亮 | 🟡 | ⏳ | 可选 BFS;不绑 6B links(更近 6C 路径可视化) |

### I-B · 6B 图健康 + Agent 面

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-MCP-LINKS | MCP `links` 多 kind | 🔴 | ✅ | `links`:backlinks/forward/dead/orphans/hubs/suggest;可数组 audit(`mcp/src/main.rs`) |
| B-MCP-READ-BRIEF | read 附带图上下文 | 🟡 | ✅ | `links_brief`:in/out 边 + dead + degree(`read_note.graph`) |
| B-MCP-WRITE-FEEDBACK | **MCP** write 返回 broken_links | 🟡 | ✅ | `write_note` 返回 `broken_links[]`+`orphan_hint`;提示不阻断保存 |
| B-GRAPH-HEALTH-UI | Orphans / Hubs UI | 🟡 | ⏳ | Explore\|Orphans\|Hubs 模式(MCP 侧已能算,缺人侧 UI) |
| B-MCP-CONFIG | MCP 客户端配置样例 | 🟢 | ✅ | Claude Code / Cursor 配置见 `mcp/README.md` §Client configuration |
| B-ED-BROKEN-LINKS | ~~见 §C~~ | 🟢 | →§C | 与编辑器断链提示合并 |

### I-C · 6C 语义发现（可选,后置）

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-GRAPH-SEMANTIC | 语义边管道 | 🔴 | ⏳ | **core EdgeKind 扩展级联**+embedding(P6-5);开前 schema 评审 |
| B-GRAPH-SUGGEST-UI | 建议链接 Accept/Dismiss | 🟡 | ⏳ | 虚线 semantic 边 |
| B-GRAPH-INSIGHTS | 跨社区枢纽 / 孤岛 | 🔴 | ⏳ | 非图论 edge-bridge;社区/介数量级,v1 可近似 |

### I-D · 6D LLM Wiki 工作流

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-WIKI-STARTER | starter vault 脚手架 | 🟡 | ✅ | `templates/wiki-starter/`:5 类型契约 + index + 示例链;文件夹不承载语义,`status` 为唯一状态真相 |
| B-WIKI-HEALTH-QQL | Health **QQL 模板** | 🟢 | ✅ | `templates/wiki-starter/health/` 5 条 `type: Query`;语法+语义由 `core/tests/wiki_health_qql.rs` 锁住;doc 07 §Health 已对齐 |
| B-WIKI-AGENT-DOC | Agent 流程说明 | 🟢 | ✅ | `docs/14-llm-wiki-workflow.md`:ingest/research/consolidate 飞轮 + MCP 工具速查 |

---

## J. 客户端日志与诊断（见 [13-client-logging.md](./13-client-logging.md)）

> **已全部落地**(L1 LogBus + 导出 + TCP PortSink + IPC/git 打点)。原目标:文件落盘 + 可选端口 + profile 一键瘦身(prod 只 error/fatal),用户导出供排查。

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-LOG-BUS | LogBus + Filter + File/Stderr + panic hook | 🟡 | ✅ | L1:`logging.rs`;NDJSON;dev/verbose/prod;panic hook |
| B-LOG-UI | 设置:profile / 打开日志目录 / 导出 | 🟡 | ✅ | profile+打开目录+`log_export_bundle` 单文件 txt(非 zip) |
| B-LOG-PORT | TCP PortSink(`OPENOBS_LOG_PORT`) | 🟢 | ✅ | app 做 server(127.0.0.1),`nc 127.0.0.1 <port>` 实时看 NDJSON 流;默认关,仅 env 开;接入 `init`/`emit_raw` |
| B-LOG-IPC-SPANS | 关键 IPC 结构化打点 | 🟢 | ✅ | index/write/pick_vault + **git 集中**(`run_git` 一处覆盖 status/log/commit/pull/push/init/restore/自动提交;成功 debug、失败 error 含 cmd+code+stderr) |

## K. 应用内侧栏 Agent(ACP 托管,见 [11](./11-in-app-agent-roadmap.md))

> **2026-08-04 Phase 7 完工**:第一版 Tier 1 + 完整 Tier 2 全部落代码、自测通过,**无推迟项**。完整实施状态见 doc 11 §10。状态图例:✅ 完整 · ⛔ 不在第一版。

| ID | Tier | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-AGENT-SDK | 2 | 🔴 | ✅ | `agent-client-protocol` v2.0.0;fs/permission/notification 闭包齐全 |
| B-AGENT-SHELL | 2 | 🔴 | ✅ | 专用线程 + `AcpAgent`(spawn+进程组 kill+kill_on_drop);**存活检测** `agent_alive`(`AtomicBool` + 脏退出 emit + 前端轮询)+ resume 边界文档 |
| B-AGENT-PATHFIX | 2 | 🟢 | ✅ | `acp::augment_path()`;登录 shell PATH + 常见目录 + Node 探测 |
| B-AGENT-PICKER | 2 | 🟡 | ✅ | 配方表(opencode/claude-code)+ 探测置灰 |
| B-AGENT-THREADVIEW | 2 | 🟡 | ✅ | 流式增量气泡 + **tool_call 折叠卡(`ToolCard`,失败自动展开 + 二级折叠)** + inline 权限卡 |
| B-AGENT-COMPOSER | 2 | 🟡 | ✅ | 单一动作槽(Send/Stop/**Queue**)+ **`@`-context 药丸**(附当前笔记 + 邻居正文) |
| B-AGENT-TRANSCRIPT | 2 | 🟡 | ✅ | 每 vault 一 SQLite(app data);**threads 表 + messages + raw_blob + WAL**;回放最近线程 |
| B-AGENT-PERM | 2 | 🟡 | ✅ | **三档**(正常逐次 / 宽松非高危自动 + 琥珀点 / 高危恒门控) |
| B-AGENT-GIT-ATTR | 1 | 🔴 | ✅ | turn 快照→`refs/agents/<id>`(不动 HEAD)+ 活动面板 + diff + **采纳(入 HEAD)/ 撤销(reverse-apply)** + **影子仓库(非 git vault)** |
| B-AGENT-RIGHTCOL-TABS | 2 | 🟢 | ✅ | 区4 Inspector \| Agent tab |
| B-COL-RESIZE | 2 | 🟢 | ✅ | 三栏拖拽 + 持久化(`ColResizeHandle`) |
| B-AGENT-CTX-MODELC | 2 | 🔴 | ✅ | Model C 跨 agent 移交:线程绑 agent + 显式移交(归一化 seed,`normalizeForHandoff`)+ 转录多线程 |
| B-AGENT-TIER0-TERM | 0 | 🔴 | ⛔ | 停靠终端;不在第一版 |

## 建议实现顺序(产品向)

1. ~~功能主路径 / 大件 v1 / 菜单搜索 / 媒体~~ ✅(QQL 差分 CI 随用户面删除,不再需要)  
2. ~~§I · 6A 图 polish~~ — **本期不做,推迟到很后**(2026-08-02:图打磨 ROI 低 / 图不好做)  
3. §I 部分落地:**6B agent 侧 MCP** ✅ · **6D wiki 脚手架** ✅(2026-08-05);剩人侧 `B-GRAPH-HEALTH-UI` 与 6C 随 §I 远期  
4. **本期收尾**:B-GRAPH-FPS 真机 · 应用内 Agent 真机端到端 · 签名/Updater(凭证门) · `release/v0.1.0` 发布收口(合 main 已完成 `84accb0`)  
5. **远期重启 §I**:6A → 6C(6B MCP 侧 / 6D 已交付;顺序待产品再定)  

完整竖切与验收见 **[12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md)**(阶段名统一 **6A–6D**)。

### 三项核实(2026-07-31)

> ⚠️ 2026-07-31 快照;**部分结论已被后续决策覆盖**(QQL 差分已删、§I 已推迟),以本文 §B/§E/§I 正文为准。

| 说法 | 是否成立 | 结论 |
|---|---|---|
| QQL TS↔Rust 差分 CI | **已废** | B-QQL-PARITY-CI 🗑️ 已删(2026-08-02 随 QQL 用户面);Rust core 单测仍在 |
| 04/06「最大缺口=编辑器菜单」 | **文案过时** | §C/§D/§H 已 ✅;§I 图→agent 已**推迟**(2026-08-02),6B 的 MCP 工具另随 MCP 落地 |
| 图谱 1k/5k 帧率 | **半成立** | 渲染/布局代码齐 + 生成器有;缺**测得的帧率数据**与 CI |

---

## 与其它文档的关系

| 文档 | 角色 |
|---|---|
| **本文 backlog.md** | 未做清单总表(含 §I 图→agent ID) |
| [**12-graph-and-agent-roadmap.md**](./12-graph-and-agent-roadmap.md) | §I 远期规划(6A–6D;6B MCP 侧 / 6D 已交付) |
| [plan.md](./plan.md) | 未完成实施计划 |
| [FEATURE-INDEX.md](./FEATURE-INDEX.md) | 已落地功能 → 代码 |
| [04-features.md](./04-features.md) | 功能规格与状态 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事 |
| [open-questions.md](./open-questions.md) | 待拍板决策 |

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
| B-SHEET | **F-SHEET 嵌入式表格** | 🔴 | ✅ | v2 齐;⛔ 不做 XLSX 全量互通 / 实时协作(对照 T/O 核心亦非主路径;git 即可) |
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

## I. 图谱打磨 → Agent（下一阶段主线 · Phase 6）

> **产品拍板(2026-08-01)**:先优化图,再 AI agent。完整规格见 **[11-graph-and-agent-roadmap.md](./11-graph-and-agent-roadmap.md)**。  
> 概念参考:varshithm7x(图 UX,MIT) + inkeep OpenKnowledge(agent/`links` 语义,**GPL 仅概念零代码**)。  
> 引擎保留 **Cytoscape** + graph-* 纯逻辑 + QQL(IR/MCP) + Rust core;顺序默认 **6A → 6B → 6D → 6C**。

### I-A · 6A 传统图 polish（人侧）

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-GRAPH-POS-PERSIST | 布局坐标**落盘** | 🟡 | ⏳ | 内存暖启动**已有**;本项=序列化+path-stable+与暖启动合流;默认 gitignore(P6-7) |
| B-GRAPH-FORCES | 力参数 + Recalculate | 🟡 | ⏳ | center/repel/link/distance;Reset 默认 |
| B-GRAPH-SETTINGS-UI | 图设置分组面板 | 🟡 | ⏳ | Filters / Display / Text / Forces |
| B-GRAPH-HIDE-UNRESOLVED | 隐藏悬空/phantom | 🟢 | ⏳ | ghost 边一键 hide |
| B-GRAPH-PATH | 最短路径高亮 | 🟡 | ⏳ | 可选 BFS;不绑 6B links(更近 6C 路径可视化) |

### I-B · 6B 图健康 + Agent 面

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-MCP-LINKS | MCP `links` 多 kind | 🔴 | ⏳ | backlinks/forward/dead/orphans/hubs/(suggest);可数组 audit |
| B-MCP-READ-BRIEF | read 附带图上下文 | 🟡 | ⏳ | in/out 边 + orphan/hub 标志 |
| B-MCP-WRITE-FEEDBACK | **MCP** write 返回 broken_links | 🟡 | ⏳ | 仅 MCP 契约;提示不阻断保存 |
| B-GRAPH-HEALTH-UI | Orphans / Hubs UI | 🟡 | ⏳ | Explore\|Orphans\|Hubs 模式 |
| B-MCP-CONFIG | MCP 客户端配置样例 | 🟢 | ⏳ | Claude Desktop 等;非 skills 商店 |
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
| B-WIKI-STARTER | starter vault 脚手架 | 🟡 | ⏳ | 目录仅约定;`status` frontmatter 为唯一状态真相 |
| B-WIKI-HEALTH-QQL | Health **QQL 模板** | 🟢 | ⏳ | 引擎已有;交付模板+文档 |
| B-WIKI-AGENT-DOC | Agent 流程说明 | 🟢 | ⏳ | ingest/research/consolidate 文档 |

---

## J. 客户端日志与诊断（见 [12-client-logging.md](./12-client-logging.md)）

> 现状:仅 `diag_log`→stderr。目标:文件落盘 + 可选端口 + profile 一键瘦身(prod 只 error/fatal),用户导出供排查。

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-LOG-BUS | LogBus + Filter + File/Stderr + panic hook | 🟡 | ✅ | L1:`logging.rs`;NDJSON;dev/verbose/prod;panic hook |
| B-LOG-UI | 设置:profile / 打开日志目录 / 导出 | 🟡 | ✅ | profile+打开目录+`log_export_bundle` 单文件 txt(非 zip) |
| B-LOG-PORT | TCP PortSink(`OPENOBS_LOG_PORT`) | 🟢 | ⏳ | 仍可选;非本批 |
| B-LOG-IPC-SPANS | 关键 IPC 结构化打点 | 🟢 | 🟡 | index_vault/write_note/pick_vault 已打;git 等可续 |

## F. 分发与工程

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SIGN-MAC | macOS 签名 + 公证 | 🟢 | 🔑 | 需 APPLE_* secrets |
| B-SIGN-WIN | Windows 安装包签名 | 🟢 | 🔑 | 需证书 |
| B-UPDATER | 自动更新 | 🟡 | 🔑 | 需密钥 + 是否上线决策 |
| B-UNIVERSAL-DMG | universal `.dmg` | 🟢 | ⏳ | 现分架构各打 |
| B-AGENTS-TLDRAW | **AGENTS.md tldraw 叙述** | 🟢 | ⏳ | 人类改:Excalidraw / 纯 MIT(agent 不改 AGENTS.md) |
| B-MERGE-MAIN | `feat/phase1-core` → main | 🟢 | 🧪 | 已 push;合 main 由你操作 |

---

## G. 已完成(勿重复开坑)

- F-GRAPH 主路径(Cytoscape + cose/preset)+ 多布局(力导向/分层/时间轴)+ 过滤/健康/落盘  
- F-QUERY + CONTAINS/STARTSWITH/ENDSWITH/IN + histogram + 内联 qql(source)+ saved query  
- Live 索引 + watcher + 刷新索引自愈  
- Excalidraw 画布;⌘F/⌘P;Nav TAGS;拖拽移动;git pull/push;类型文档提示  
- zh/en i18n;标签循环;恢复上次笔记;CI + 本地 dmg  

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

## 建议实现顺序(产品向)

1. ~~功能主路径 / 大件 v1 / 菜单搜索 / QQL 差分 / 媒体~~ ✅  
2. **§I · 6A** — 图 polish(坐标**落盘** atop 暖启动 / 力参数 / 设置面板 / hide unresolved)  
3. **§I · 6B** — MCP `links` + 读写图反馈 + Orphans/Hubs UI(**agent 主刀**)  
4. **§I · 6D** — LLM wiki 脚手架 + QQL Health 模板  
5. **§I · 6C**(可选) — 语义边 / 建议链接(embedding + EdgeKind 评审后)  
6. 工程并行:合 main · B-GRAPH-FPS 真机 · AGENTS.md 叙事(人类) · 签名/Updater  

完整竖切与验收见 **[11-graph-and-agent-roadmap.md](./11-graph-and-agent-roadmap.md)**(阶段名统一 **6A–6D**)。

### 三项核实(2026-07-31)

| 说法 | 是否成立 | 结论 |
|---|---|---|
| QQL TS↔Rust 差分 CI | **已落地** | B-QQL-PARITY-CI ✅(`fixtures/qql-parity`) |
| 04/06「最大缺口=编辑器菜单」 | **文案过时** | §C/§D/§H 已 ✅;下一主线=§I 图→agent |
| 图谱 1k/5k 帧率 | **半成立** | 渲染/布局代码齐 + 生成器有;缺**测得的帧率数据**与 CI |

---

## 与其它文档的关系

| 文档 | 角色 |
|---|---|
| **本文 backlog.md** | 未做清单总表(含 §I 图→agent ID) |
| [**11-graph-and-agent-roadmap.md**](./11-graph-and-agent-roadmap.md) | **下一阶段主规划**(A→B→D→C) |
| [plan.md](./plan.md) | 未完成实施计划 |
| [FEATURE-INDEX.md](./FEATURE-INDEX.md) | 已落地功能 → 代码 |
| [04-features.md](./04-features.md) | 功能规格与状态 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事 |
| [open-questions.md](./open-questions.md) | 待拍板决策 |

# 未完成清单(Backlog)

> **单一事实来源**:「还没做 / 还要做」看本文。  
> 难点拆解与前置细节仍在 [deferred.md](./deferred.md);路线图阶段叙事在 [06-roadmap.md](./06-roadmap.md)。  
> 状态:⏳ 未做 · 🟡 部分 · ✅ 已做 · 🧪 真机验收 · 🔑 凭证门  
> 难度:🟢 易 · 🟡 中 · 🔴 硬

**边界变更(2026-07-30)**:原「v1 刻意不做」三项改为正式交付目标并已落地(§A ✅)。软类型原则不变:`type` 永不强制校验、永不阻止保存。

---

## A. 原 v1 边界 → **已全部落地** ✅

| ID | 项 | 状态 | 说明 |
|---|---|---|---|
| B-TYPE-DOC | 类型文档 | ✅ | `types/{Type}.md` / `type: TypeDoc`;Inspector「类型说明」仅提示 |
| B-GRAPH-LAYER | 图谱按 type 分层 | ✅ | `graph-modes.layoutByTypeLayer` |
| B-GRAPH-TIME | 图谱时间轴 | ✅ | `layoutByTimeline`(created/modified) |
| B-GRAPH-LAYOUT-UI | 布局切换 UI | ✅ | GraphView 右上角 select |
| B-QQL-EXPAND | QQL 常用子集扩展 | ✅ | `CONTAINS`/`STARTSWITH`/`ENDSWITH`/`IN`;mock-qql 同步 |

---

## B. 产品大件

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SHEET | **F-SHEET 嵌入式表格** | 🔴 | ✅ | v2 齐;⛔ 不做 XLSX 全量互通 / 实时协作(对照 T/O 核心亦非主路径;git 即可) |
| B-PLUGIN | **F-PLUGIN 插件系统** | 🔴 | ⛔ | v1 宿主保留;产品决定**不再深化**(无商店/vault 扫描 UI/签名) |
| B-MCP | **完整 MCP server(AI 写侧)** | 🔴 | ✅ | v1:`openobs-mcp` stdio JSON-RPC;list/read/write/search/qql |
| B-BN-FIDELITY | **BlockNote ↔ Markdown 保真** | 🟡 | ✅ | 轻量门禁:`blocknote-fidelity` 安全样例 + 风险清单 + wikilink/fm 往返测 |
| B-QQL-TS | **QQL 求值器移植到 TS** | 🔴 | ✅ | v1:`ui/src/lib/qql/*` 全量 parse+eval;mock `run_qql` 走 TS |

---

## C. 编辑器体验

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-ED-FMT-BAR | Source 格式工具条 | 🟡 | ✅ | |
| B-ED-CTX-MENU | Source 正文右键 | 🟢 | ✅ | |
| B-ED-FIND-PARITY | ⌘F 双模对齐 | 🟡 | ✅ | 切 source + CM 高亮 |
| B-ED-QQL-WYSIWYG | WYSIWYG 内联 qql | 🟡 | ✅ | `collectWysiwygQqlJobs` + `run_qql` 结果面板 |
| B-ED-MODE-UX | 双模切换心智 | 🟢 | ✅ | 保真提示 + ⌘K/菜单/设置默认模式 |
| B-ED-MEDIA | 图片粘贴/拖入/预览 | 🟡 | ✅ | v1:`save_attachment`+mock;粘贴/拖入→`attachments/`;阅读改写 img;`docs/08` |
| B-ED-READING | 并排预览 | 🟢 | ✅ | v1:source 左编辑\|右 ReadingPane;`editorLayout` 持久化;非 Live Preview |

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
| B-GRAPH-FPS | 万级帧率验收 | 🟡 | 🧪 | **代码齐**;`gen-benchmark-vault.mjs` 有;缺本机测得的 fps 数字 |
| B-QQL-MOCK-GAP | mock 与 core 语义 | 🟡 | ✅ | mock `run_qql`→QQL-TS;各侧单测齐 |
| B-QQL-PARITY-CI | TS↔Rust 同批查询差分 | 🟡 | ⏳ 可选 | **核实:不存在**共享 fixture CI;要防漂移可另加 golden 查询集 |

---

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

- F-GRAPH 主路径 + 多布局(力导向/分层/时间轴)+ WebGL/Worker/BH/LOD/标签避让  
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

1. ~~功能主路径 / 大件 v1 / 菜单搜索~~ ✅  
2. **合 main** + AGENTS.md 叙事(人类)  
3. 可选:WYSIWYG 插图 / 保真加深 / B-QQL-PARITY-CI  
4. 真机:B-GRAPH-FPS;`node tools/gen-benchmark-vault.mjs`  
5. 对外:签名/Updater 凭证  

### 三项核实(2026-07-31)

| 说法 | 是否成立 | 结论 |
|---|---|---|
| QQL TS↔Rust 差分 CI | **问题存在** | 无共享 golden 查询自动比对;TS `qql.test` 与 Rust `query`/`qql` 测试**各自**覆盖。防漂移=可选新开 B-QQL-PARITY-CI |
| 04/06「最大缺口=编辑器菜单」 | **文案过时** | 已改:§C/§D/§H 已 ✅ |
| 图谱 1k/5k 帧率 | **半成立** | 渲染/布局代码齐 + 生成器有;缺**测得的帧率数据**与 CI |

---

## 与其它文档的关系

| 文档 | 角色 |
|---|---|
| **本文 backlog.md** | 未做清单总表 |
| [deferred.md](./deferred.md) | 难点/前置/编辑器菜单诚实评估 |
| [04-features.md](./04-features.md) | 功能规格与状态 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事 |
| [open-questions.md](./open-questions.md) | 待拍板决策 |

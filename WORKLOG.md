# WORKLOG

> **Append-only 工作日志**。任何 agent:**开工前读最近 ~10 条**,**收工后追加一条**。格式:
>
> ```
> ### YYYY-MM-DD <agent> — <一句话摘要>
> - **branch**: <branch>(已 / 未 push,已 / 未合并 main)
> - **做了**: …
> - **理由 / 影响**: …
> - **下一步 / 接手注意**: …
> ```
>
> **永不修改历史条目**。**新条目加在最上方**(倒序),让最新交接是读者第一眼看到的。
> 本日志是可读叙事,不是状态机;结构化任务用 GitHub Issues。

---

### 2026-07-30 Grok — 附件媒体 v1 + 并排阅读预览(B-ED-MEDIA / B-ED-READING)

- **branch**: `feat/phase1-core`。
- **做了**:
  1. 产品方案 [docs/08-media-and-split-preview.md](docs/08-media-and-split-preview.md)(Tolaria 落盘 + Obsidian 粘贴/并排习惯)。
  2. **媒体**:`save_attachment` IPC + mock data URL;`Editor` 粘贴/拖入 → `attachments/` + `![alt](path)`;`ReadingPane` 改写相对 img。
  3. **并排**:source 下 `editorLayout` edit|split;左 Editor / 右 ReadingPane;设置项 + ⌘K + 工具栏切换。
  4. Settings:`attachmentsDir` / `editorLayout`;backlog 标 ✅。
- **理由 / 影响**:补齐笔记插图与阅读对照;非 Live Preview、无相册。
- **验证**:`pnpm --dir ui typecheck` + `test`;`cargo test -p openobs-app` 相关单测。
- **下一步 / 接手注意**:真机粘贴 PNG 验收;WYSIWYG 插图后续;大件仍 F-SHEET/F-PLUGIN/MCP/QQL-TS。

### 2026-07-30 Grok — 非大件收口:设置/WYSIWYG qql/原生菜单/保真门禁

- **branch**: `feat/phase1-core`。
- **做了**:
  1. Settings 面板 + settings.ts;⌘K「设置」;默认编辑模式可配。
  2. source→wysiwyg 保真提示条;palette/菜单模式切换。
  3. Wysiwyg 内联 ```qql → run_qql 结果面板。
  4. Tauri File/Edit/View 菜单 emit `menu-action`。
  5. Nav type/tag 右键;mock-qql AND/OR;blocknote-fidelity 轻量门禁。
  6. backlog 非大件项标 ✅。
- **验证**:typecheck;ui 450 tests;cargo check openobs-app。

### 2026-07-30 Grok — 编辑器/菜单打磨:⌘K 扩面、格式条、右键

- **branch**: `feat/phase1-core`。
- **做了**:
  1. `palette-commands` 扩:保存/查找/双模/归档/Reveal/主题/语言 + shortcut 展示。
  2. Source `md-format` + Editor 格式栏 + 正文右键(格式/剪贴板)。
  3. Tab 右键关闭/关闭其它/复制路径;Nav 文件夹右键新建笔记/复制路径。
  4. backlog §C/D 状态更新。
- **验证**:ui typecheck + test。

### 2026-07-30 Grok — 文档同步:§A 收口 + 编辑器/菜单缺口入 backlog

- **branch**: `feat/phase1-core`。
- **做了**(仅文档):
  1. `backlog.md` 重写:§A 全 ✅;新增 **§C 编辑器** / **§D 菜单与命令**;删过时「LAYOUT-UI ⏳」;建议顺序改为菜单+编辑器优先。
  2. `deferred.md`:§A 标已落地;新增「编辑器与菜单」诚实评估。
  3. `04-features` / `06-roadmap` / `02` / `docs/README`:F-EDITOR/PALETTE/菜单状态改为 🟡 并指 backlog。
- **下一步**:实现 B-PALETTE-EXPAND + B-ED-CTX-MENU 等(若产品开干)。

### 2026-07-30 Grok — backlog §A 全落地(类型文档/图谱多布局/QQL 扩展)

- **branch**: `feat/phase1-core`。
- **做了**:
  1. **B-TYPE-DOC**:`type-doc.ts` + Inspector「类型说明」(`types/X.md` / TypeDoc)。
  2. **B-GRAPH-LAYER/TIME/UI**:`graph-modes.ts` + GraphView 布局下拉(力导向/分层/时间轴)。
  3. **B-QQL-EXPAND**:core `CONTAINS`/`STARTSWITH`/`ENDSWITH`/`IN`;mock-qql 同步。
  4. backlog §A 标 ✅。
- **验证**:cargo test -p openobs-core;pnpm ui typecheck/test。

### 2026-07-30 Grok — 文档:v1 边界改待办 + backlog 总表

- **branch**: `feat/phase1-core`。
- **做了**:
  1. 产品决策落档:原「v1 刻意不做」三项 **要做**——类型文档(UI only)、图谱 type 分层/时间轴、QQL 向 Dataview 常用子集扩展。
  2. 新增 [docs/backlog.md](docs/backlog.md) 为未完成清单单一事实来源(§A–E + 建议顺序)。
  3. 同步 04-features / deferred / 06-roadmap / open-questions / docs README。
- **不做本轮**:未写实现代码(仅文档梳理)。
- **下一步**:按 backlog 建议顺序实现 B-TYPE-DOC / B-GRAPH-* / B-QQL-EXPAND。

### 2026-07-30 Grok — 打磨收口:标签避让 / 增量布局 / mock-qql + 文档对齐

- **branch**: `feat/phase1-core`(已 push;本批再 commit/push)。
- **做了**:
  1. `graph-label.ts` 屏坐标贪心标签避让;SVG + WebGL 共用。
  2. `graph-layout-budget.ts` 结构/新节点/尺寸驱动的 FR 迭代预算。
  3. `mock-qql.ts` 浏览器 QQL 子集(type/status/tag/LIMIT/COUNT/GROUP/histogram)。
  4. 文档对齐:04-features / 01 / 02 / 06 / deferred / open-questions(去掉过时 ⏳)。
- **不做**:真机 1k/5k 帧率验收(用户测)、签名/插件/表格/MCP 等 deferred 大件。
- **验证**:typecheck · **413** 单测绿。

### 2026-07-30 Grok — 图谱全功能打磨(Barnes-Hut / LOD 边 / WebGL 交互齐)

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:
  1. **Barnes-Hut** 四叉树斥力(`graph-layout.ts`);n≥280 或显式 `repulsion:"barnes-hut"`;Worker/client 透传。
  2. **LOD 完整**:`projectLodEdges` 簇间边合并 weight;点簇 → 相机飞入 + 聚焦成员 hops=2。
  3. **WebGL 交互对齐 SVG**:节点拖拽+自动 pin、Shift 框选、缩放/fit 按钮、悬停邻域压暗、悬空边 ghost 红桩、右键菜单。
  4. WebGL 有 GL 即优先(`WEBGL_MIN_NODES=1`);`GraphSigmaLayer` 独立 chunk ~165kB。
  5. docs deferred/roadmap/02/04 同步;单测补齐。
- **验证**:typecheck clean · **397** 单测绿 · `pnpm --dir ui build` OK(含 GraphSigmaLayer chunk)。
- **下一步**:真机 1k/5k vault 帧率门禁;AGENTS.md tldraw 叙述仍待人类改;未 commit。

### 2026-07-30 Grok — 文档同步 + 图谱 WebGL 重构 + Excalidraw 收口

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:
  1. **文档同步**:README/02/04/06/07/deferred 对齐 live-index、⌘F/⌘P 无搜索视图、**Excalidraw MIT 画布**、图谱 WebGL 目标;代码注释去 tldraw 残留(App/mock/lib.rs/StatusBar)。AGENTS.md 仍写 tldraw——**人类维护,未改**。
  2. **画布**:确认 Excalidraw 已落地(schema/`CanvasView`/licenses 无 tldraw);`THIRD_PARTY_NOTICES` 以 Excalidraw 为准。
  3. **图谱重构(架构落地)**:
     - `graph-model.ts` path-stable 主键 / degree / structureSig / topK / pin path 往返
     - `graph-lod.ts` 低缩放网格聚类 + 单测
     - `graph-layout.worker.ts` + `graph-layout-client.ts` Worker FR(失败同步回退)
     - `graph-webgl.ts` + `GraphSigmaLayer`(sigma 3 + graphology,MIT)懒加载 chunk
     - `GraphView`:≥80 节点且 WebGL 可用 → WebGL;否则 SVG(框选/拖节点完整)。角标显示 WebGL/LOD。
  4. 依赖:`sigma` `graphology` 入 `package.json` + THIRD_PARTY_NOTICES。
- **验证**:`pnpm --dir ui typecheck` clean · **389** 单测绿 · `pnpm --dir ui build` OK。
- **下一步 / 接手注意**:
  - 真机大 vault(1k+)验帧率与 Worker;点集群 → 聚焦 1 跳已接,簇间边简化未画。
  - AGENTS.md 仍提 tldraw 隔离条款,需人类改成 Excalidraw/纯 MIT 叙述。
  - 未 commit;需要时再 commit/push。

### 2026-07-30 Grok — ⌘K「刷新索引」绑定 force 自愈

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:`palette-commands.ts` 增加 `refresh-index`;CommandPalette 调用 `actions.refreshIndex`(force=true)。单测断言列表含该 id 且 `run()` 调到 refreshIndex。i18n zh/en。
- **验证**:palette-commands + full ui tests;static-refresh-heal.txt。

### 2026-07-30 Grok — watcher 切 vault 清 timer / gen 串行 / refresh force 自愈

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:skeptic 三修 —— (1) `stopWatch` 清 timer+pending+bump gen,防 A 定时器写 B;(2) `canCommitWatchResult(gen,root)` 丢弃过期异步 setState;(3) `actions.refreshIndex` **force=true** 用户可达自愈(保存仍 force=false)。`vault-watch` 单测 9 项。
- **验证**:ui 358 · typecheck · cargo core/app 绿。

### 2026-07-30 Grok — watcher debounce 路径并集 + force 自愈

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:修 skeptic 两项 —— (1) `vault-watch.ts` 多帧 `vault-changed` **并集**路径,禁止 last-wins 丢 delta;(2) apply 失败或空批 → `index_vault(force=true)` 自愈,无需 re-open。单测 5 项。
- **验证**:ui 354 · typecheck clean · core vault + app tests 绿。

### 2026-07-30 Grok — 索引增量 live index + QQL 全形态验收

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:
  1. **core**:`apply_entry_deltas` / `build_from_map`;单测 delta≡全量 build + QQL List/Table/Count/Sum/Groups/Histogram 真实 ResultSet。
  2. **app LiveVault**:打开 vault WalkDir 一次;写/删/改名/restore 路径级更新; `run_qql`/`search_notes` **只读 live.index**;`apply_vault_changes` + watcher emit 路径列表。
  3. **UI**:`indexVault(root, force)` / `applyVaultChanges`; open force=true; watcher 走路径 delta。
  4. **docs/02-architecture**:索引刷新改为增量路径描述。
  5. **example** `core/examples/qql_smoke.rs` 双跑一致性。
- **验证**:core 113 · app 13 · ui 349 typecheck clean。
- **下一步**:可选 e2e;图谱 WebGL 另轨。

### 2026-07-30 Grok — 记录安装覆盖旧版 + 重新打包

- **branch**: `feat/phase1-core`(未 commit)。
- **做了**:
  1. README 补「安装与覆盖旧版」:固定 bundle id `dev.openobsidian.desktop`,安装时**替换**同名 app,附 dmg 拖装 / `rm + cp` 命令行覆盖、数据与 Gatekeeper 说明。
  2. 清理 `target/release/bundle` 旧产物后 **`tauri build` 重打** macOS `.app` + `.dmg`。
- **安装产物**:
  - `target/release/bundle/macos/OpenObsidian.app`
  - `target/release/bundle/dmg/OpenObsidian_0.1.0_aarch64.dmg`
- **下一步**:用户用 dmg 或 cp 覆盖 `/Applications/OpenObsidian.app` 做真机验收(⌘F / ⌘P / 标签 / 拖拽 / 图谱 / histogram / git pull)。

### 2026-07-30 Grok — 第 1 类打磨全落地(快捷键/标签/拖拽/图谱/QQL 直方/git pull)

- **branch**: `feat/phase1-core`(未 commit / 未 push;工作区有本批改动)。
- **做了**:
  1. **editMode 一次性迁移**(`edit-mode.ts`):旧默认 `source` 在 `openobs.editMode.migratedV2` 未写时 → `wysiwyg`;之后用户手切 source 会保留。
  2. **⌘F**:source 走 `@codemirror/search`(`EditorHandle.find`);wysiwyg 仍 `window.find()`。真机 WKWebView 需你验。
  3. **⌘P / ⌘O 快速打开**:`CommandPalette` 分 `commands` / `quickOpen` 模式(仅笔记)。
  4. **F-TAGS**:Nav `TAGS` 分组 + `NavSelection.kind:"tag"` + 列表过滤。
  5. **文件拖拽移动**:列表行 draggable → 丢到 Nav 文件夹/根;`moveNote` + `resolveMoveTarget` 纯逻辑;复用 `rename_note` IPC。
  6. **图谱过滤**:status 过滤 + 文本 query 高亮(`textHits`);原有 type/tag/relation/hops 保留。
  7. **图谱交互**:悬停预览浮层、拖拽后自动 pin、右键 pin/unpin、Shift+框选多选高亮。
  8. **QQL histogram**:core `Render::Histogram` + `ResultSet::Histogram` + 面板条形图 + `qql-block` HTML。
  9. **Git pull/push**:`git_pull` / `git_push` 命令 + 冲突横幅(`UU` 等)提示手改后 commit。
  10. **打包**:`target/release/bundle/macos/OpenObsidian.app` + `…/dmg/OpenObsidian_0.1.0_aarch64.dmg`。
- **验证**:core 110 · app 10 · UI 343 · typecheck clean · e2e 12/12 · tauri build OK。
- **下一步 / 接手注意(需人类真机)**:
  - 打开 dmg/app 验:⌘F(source + wysiwyg)、⌘P、标签区、拖拽移动、图谱 status/文本/框选/pin、`RENDER histogram(type)`、有 remote 的 vault 上 pull/冲突。
  - 未 commit;需要时再 `git add` / commit / push。

### 2026-07-30 Claude Code — 搜索三 scope 重构 / 默认 wysiwyg / 笔记右键菜单

- **branch**: `feat/phase1-core`(本地 3 commits `23dafce` `467c6da` `6f77c9a`,已 push origin 该分支更早的提交,这 3 个新 commit **尚未 push**)。
- **做了**:
  1. 第二栏表头从静态「全部笔记」标签改成**即时过滤框**(title+preview 子串),顺带消除「点 search 后第二栏仍高亮全部笔记」的残留态 bug。
  2. `editMode` 默认 `source` → **`wysiwyg`**(新用户即开即所见即所得)。
  3. 搜索分三 scope:第二栏过滤(小)/ ⌘F FindBar(`window.find()`,source + wysiwyg 双模式通用)/ ⌘⇧F 全库(现有 `ipc.searchNotes`)。⌘K 命令面板按钮图标放大镜 → Command,去掉「两个放大镜」。
  4. 第二栏笔记行**右键菜单**:重命名 / 复制 `[[wikilink]]` / 切 status(Active/Contested/Superseded/Draft + 清除)/ 归档(confirm)/ Reveal in Finder(桌面专用,mock 隐藏)。
- **顺手修的真 bug**:inline 重命名提交后列表标题不刷新——新 H1 落盘发生在 `renameNote` 的 `refreshIndex` 之后,索引里 body 仍是占位 H1。给 `commitDraftRename` 末尾补 `await refreshIndex(root)`。
- **新后端命令**:`reveal_in_finder`(macOS `open -R` / Windows `explorer /select,` / Linux `xdg-open <parent>`),已注册进 `generate_handler!`。
- **CI 门**:typecheck clean · `test:cov` 67.84% · e2e 12/12 · `cargo test -p openobs-core` + `-p openobs-app` 绿 · `pnpm --dir ui build` OK。
- **下一步 / 接手注意**:
  - ⌘F 的 `window.find()` 是非标准 API,**Tauri WKWebView 真机需验证**;若不稳,fallback = 给 source 模式加 `@codemirror/search`(后置,未做)。
  - `editMode` 存 localStorage;老设备若之前存过 `"source"`,需手动切一次或清 `openobs.editMode` 才看得到 wysiwyg 默认。
  - 本批 3 commits 未 push;接手前先 `git pull` / 确认是否要我 push。

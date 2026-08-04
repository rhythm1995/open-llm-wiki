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

### 2026-08-02 Claude — 非图杂项收口(git 日志打点 + source 任务按钮)+ §I 图谱推迟
- **branch**: `feat/phase1-core`
- **做了**:
  - **B-LOG-IPC-SPANS ✅**:`run_git` 集中结构化打点——一处覆盖 status/log/commit/pull/push/init/restore/自动提交;成功 debug(命令名,prod 自动过滤避免刷屏),失败 error(cmd+code+截断 stderr)。比逐个装饰 8 个 git 命令 DRY。
  - **B-ED-TASK-BTN ✅**:source 格式条任务列表按钮(`ListChecks`)→ `md-format.ts` 新 `toggleTaskList`(已是任务项剥 checkbox,否则加 `- [ ] `,避免双 checkbox)+ 5 个单测 + i18n(zh/en)。
  - **§I 图谱 polish(6A)整期推迟**(产品决策):图打磨 ROI 低/图不好做,转远期。backlog §I / plan §Graph / 11 顶部均加 2026-08-02 推迟横幅。
- **理由 / 影响**:非图杂项清完;编辑器主线 + 保真 + 日志 + 任务按钮全部收敛。下一刀=合 main + 真机验收(图谱帧率)。
- **验证**:Rust `cargo check` 干净;UI typecheck + 544 tests green(+5 task)。
- **下一步 / 接手注意**:图谱工作**勿主动开**;真机 B-GRAPH-FPS 仍需本机;签名/Updater 是凭证门。

### 2026-08-02 Claude — 编辑器保真自动扫描 + 2 项分级(B 编辑器微体验)
- **branch**: `feat/phase1-core`(未 commit;本批为代码 + 测试)
- **做了**:
  - 新增 `blocknote-fidelity-sweep.test.ts`:23 例 md 语料丢进真 BN 引擎往返,打印诊断报告(替代无法做的真机 GUI e2e)。结果 **BREAK=0 / RISKY=3 / ok=20**。
  - **hr 收口**:发现 `---`→`***` 是**比较器**盲区(非 BN 改坏)。`normalizeMdForCompare` 归一 hr 三写法为 `***`;hr 加进 `SAFE_FIDELITY_FIXTURES`(升级为真断言门禁)。
  - **inline-HTML 定性**:`<strong>`→`**bold**` 是 BN 的 raw-HTML 限制面(语义存活、拼写不保,与 html-block 同源)→ 记进 `DISABLED_OR_RISKY_PATTERNS`,sweep 标 risky。非改坏,不修。
- **理由 / 影响**:用户循环「切 source↔WYSIWYG 抽笔记看 diff / 某类 md 被改坏→加 SAFE_FIDE」自动化落地;保真边界从「嵌套任务/HTML 表」精确化到「HTML 表+行内」。
- **验证**:`pnpm --dir ui test`(539 passed)+ `typecheck` 干净。
- **下一步 / 接手注意**:sweep 永久作诊断回归(报告即交付,不断言);真机仍需人工抽看 wikilink/图片/表格那几类。

### 2026-08-02 Grok — 保真门禁完全收敛 + 文档同步

- **收敛**:
  - 引擎门禁收紧:无 token 不得靠空 `tokensOk` 误绿;列表 `-/*` 与 task checkbox 规范化后 **normEqual**。
  - `safeFixtureHolds` = app 层 + `engineSafeFixtureHolds`(双层一入口)。
  - B-BN-FIDELITY-DEEP → ✅;风险清单仅保留明确 ⛔。
- **文档**:plan / backlog / FEATURE-INDEX / 04 / 06 / 02 对齐;F-EDITOR 标 ✅。
- **验证**:typecheck;fidelity + engine-roundtrip 13 tests。
- **下一步**(编辑器主线已齐):用户定非图项或真机 e2e;图仍低优。

### 2026-08-02 Grok — 真 BlockNote 引擎 Markdown 往返门禁

- **做了**:`blocknote-engine-roundtrip.ts` —— `BlockNoteEditor.create({ schema: wysiwygSchema })` + `tryParseMarkdownToBlocks` → hydrate/dehydrate → `blocksToMarkdownLossy`;规范化比较 + token 门禁;安全样例全过单测。
- **含义**:与 app 层假块不同,钉住 **WysiwygView 真实读写路径**;BN Lossy 允许风格规范化,关键 token/链接不丢。
- **验证**:vitest `blocknote-engine-roundtrip` 6 项;typecheck。
- **仍开放**:嵌套任务列表 / HTML 表 / 全 GFM 字节全同。

### 2026-08-02 Grok — 图降优;编辑器主线切片

- **优先级**:图/Agent 降;主线编辑器(plan.md 已改)。
- **做了**:
  1. **B-ED-WYSIWYG-FMT**:WYSIWYG 格式条对齐 source(粗/斜/H/列表/引用/wikilink/图)。
  2. **B-ED-BROKEN-LINKS**:`broken-links.ts` + Inspector 黄条未解析 `[[…]]`。
  3. **B-BN-FIDELITY-DEEP 切片**:安全样例扩任务列表/代码/强调/图/二级列表(真 BN 引擎 RT 仍开放)。
- **验证**:ui typecheck + 529 tests。
- **下一步编辑器**:真 BlockNote round-trip 门禁 / 嵌套任务 / HTML 表;或用户点的其它写作体验。

### 2026-08-02 Grok — 文档收口 + wiki 嵌入图 + 迁笔记搬图

- **branch**: `feat/phase1-core`(未 push)。
- **文档**:
  - 新增 [FEATURE-INDEX.md](docs/FEATURE-INDEX.md)(已做→代码)、[plan.md](docs/plan.md)(未做计划)。
  - **删除**废弃 [deferred.md](docs/deferred.md);README/backlog/06/07/11/02 指针改 plan/FEATURE-INDEX。
  - **注意**:`AGENTS.md` 仍链 deferred(约定 agent 不改 AGENTS,需人类改一行)。
  - 08 媒体规格同步 wiki 嵌入 + 搬图规则。
- **B-ED-MEDIA-WIKI**:render 先 `![[img]]` 再 wikilink;短名 resolve;`media_index.files`;ReadingPane 接入;单测。
- **B-ED-MEDIA-MOVE**:core `plan_media_moves_on_note_rename` / rewrite / `rename_file_key`;`rename_note` 落盘(refcount==1,同目录或 stem 桶)。
- **验证**:core media 8;app 21;ui 525 + typecheck。

### 2026-08-02 Grok — MediaIndex 二期收口(core + live + IPC + UI)

- **branch**: `feat/phase1-core`(未 push)。
- **做了**:
  1. **core::media**:`MediaIndex`(files / by_note / by_media);extract md+html+wiki 图;`orphans`/`missing`/`refcount`;单测 5。
  2. **LiveVault.media**:open walk 图片;note delta 增量引用;`save_attachment` upsert file。
  3. **IPC**:`media_index` / `media_of_note` / `media_used_by` / `trash_attachments`(→ `.openobsidian/media-trash/`)。
  4. **UI**:Inspector「附件」tab;⌘K「清理未引用附件…」确认后 trash;**delete_note 不自动 GC**。
  5. mock 对齐;docs/08 + backlog B-ED-MEDIA-INDEX / GC ✅。
- **理由**:用户要求媒体索引模块二期一次收口;有索引后 GC 才可谈且默认安全。
- **验证**:`cargo test -p openobs-core media`;`cargo test -p openobs-app --lib`;待 ui typecheck/test。
- **下一步**:真机插图后看 Inspector 附件;可选相册 UI。

### 2026-08-02 Grok — 附件管理 v1.5(组织 / 查盘 / 引用索引)

- **branch**: `feat/phase1-core`(未 push)。
- **用户反馈**:插图可用,但附件文件管理太粗、索引与其它流程不便。
- **问题盘点(含未明说)**:
  1. 扁平 `attachments/` + 难读 stamp → 难对照笔记;
  2. 桌面 `attachmentExists` 恒 false → 唯一路径形同虚设;
  3. 无「谁引用了这张图 / 孤儿附件」基础能力;
  4. 二进制本就不进 live note index(正确),但缺独立清单 API,易被当成「没索引」;
  5. 无布局策略(按笔记/按日/同目录)。
- **做了**:
  - 默认布局 **folder-note**:`attachments/{noteStem}/{YYYYMMDD-HHmmss}-{file}`;
  - Settings:`attachmentLayout`(folder-note / folder-date / folder / note-folder);
  - IPC:`attachment_exists` + `list_attachments`;前端 `attachmentExistsAsync` + 异步 allocate;
  - 纯逻辑:`extractMarkdownImagePaths` / `buildMediaRefIndex` / `findOrphanAttachments`;
  - Editor / Wysiwyg 传 `notePath` + layout;docs/08 + backlog `B-ED-MEDIA-ORG` ✅。
- **明确未做**:相册 UI、删笔记自动 GC、note-folder 迁笔记跟图、wiki 嵌入语法。
- **验证**:vitest attachments/wysiwyg-media/settings;openobs-app 编译。
- **下一步**:可选 B-ED-MEDIA-GC(孤儿清单 UI);重打包安装后真机插图看新路径。

### 2026-08-02 Grok — 修空图:asset 协议 + data URL 解析

- **现象**:插图空图/无法删除占位;日志侧曾有 save_attachment 参数问题。
- **根因**:`convertFileSrc` 需 `assetProtocol.enable`+scope,此前未开 → webview 加载不了相对附件 URL。
- **修**:tauri.conf assetProtocol;`protocol-asset` feature;`read_attachment_data_url` + `resolveMediaUrlAsync`;BN 直接插 image 块。
- **安装**:已 rebuild + ditto 到 /Applications。

### 2026-08-02 Grok — 修插图 save_attachment 参数名(闪退/loading)

- **branch**: `feat/phase1-core`。
- **日志**:`invalid args bytesBase64 … missing required key bytesBase64` —— 前端传了 `bytes_base64`,Tauri 2 要 camelCase。
- **修**:`ipc.saveAttachment` → `bytesBase64`;mock 兼容双键;重打包安装。
- **说明**:无 macOS crash report;「闪退」更像 unhandledrejection + 图块一直 loading。

### 2026-08-02 Grok — B-ED-WYSIWYG-IMG:BlockNote 插图走 attachments

- **branch**: `feat/phase1-core`。
- **做了**:WysiwygView 配置 `uploadFile`/`resolveFileUrl`(slash/FilePanel 与粘贴同管线);`wysiwyg-media` 增 `blockNoteUploadSrc`/`shouldResolveVaultMediaUrl` + 单测;禁默认无上传器时的 base64/空操作路径。
- **验证**:vitest wysiwyg-media;typecheck。
- **下一步**:可选 B-LOG-PORT;backlog §I 状态对齐。

### 2026-08-02 Grok — 写作体验 + 日志导出

- **branch**: `feat/phase1-core`。
- **做了**:
  1. **查找替换**(B-ED-FIND-REPLACE):`find-in-doc` replaceAll/Next + 单测;Editor `replaceNext`/`replaceAll`;FindBar 展开替换行。
  2. **插图按钮**(B-ED-IMAGE-BUTTON):source 格式条 + WYSIWYG 条 → `input[type=file]` → 既有 attachments 管线。
  3. **日志导出**(B-LOG-UI):`log_export_bundle` 合并近期 log 为 txt;设置→诊断「导出诊断日志」。
- **验证**:待跑 typecheck / vitest find-in-doc / cargo logging。
- **下一步**:可选 B-LOG-PORT;或 backlog §I 状态对齐。

### 2026-08-02 Grok — 清 Cytoscape 迁移孤儿代码与依赖

- **branch**: `feat/phase1-core`。
- **做了**:
  1. 删除 `GraphForceLayer.tsx`、`graph-d3-forces(+test)`、`graph-canvas-labels(+test)`。
  2. 卸依赖:`react-force-graph-2d`、`d3-force`、`@types/d3-force`(`pnpm install` 已更新 lock)。
  3. GraphView 懒加载改名 `CytoscapeLayerLazy`;`WEBGL_MAX_NODES` → `GRAPH_MAX_NODES`。
  4. 文档/THIRD_PARTY 过渡债勾销。
- **验证**:typecheck;graph-* 相关 66 vitest 绿。
- **下一步**:6B 或真机 B-GRAPH-FPS。

### 2026-08-02 Grok — 图栈文档同步:sigma → Cytoscape

- **branch**: `feat/phase1-core`(文档+注释)。
- **做了**:按中心度改 docs **02→04→01→06→11→open-questions→backlog→deferred→07→12**;统一口径 **Cytoscape.js + cose/preset**;P6-2 翻案;顺带清 QQL 用户面/QueryPanel 残留表述;对齐 GraphView 等注释与 THIRD_PARTY_NOTICES。
- **下一步**:清孤儿层(已在下一条完成)。

### 2026-08-02 Claude — 编辑器功能审计 + 文档腐烂清理

- **branch**: `feat/phase1-core`(未 push)。
- **做了**:
  1. **编辑器审计**:盘点 source(CodeMirror)/ WYSIWYG(BlockNote)双模。主路径齐(双模 / 格式条 / 右键 / wikilink 闭环 / 图片粘贴·拖入 / 大纲 / 并排预览 / 查找)。开放 4 项:
     - **查找替换**(`B-ED-FIND-REPLACE` 🟢):现仅查找;CM `searchKeymap` 原生支持 replace,接进 FindBar 即可。
     - **插入图片按钮**(`B-ED-IMAGE-BUTTON` 🟢):现仅粘贴/拖入;加 Tauri `dialog` 文件选择 → 复用 `insertImageFiles`。
     - **WYSIWYG 图片路径一致性**(`B-ED-WYSIWYG-IMG` 🟡 待验证):BlockNote slash 菜单插图疑似内联 base64、不走 vault `attachments/`(粘贴/拖入已拦截至管线)。
     - **保真加深**(`B-BN-FIDELITY-DEEP` 🔴):门禁覆盖 6 安全结构,嵌套任务列表 / HTML 表格 / 自定义块 round-trip 仍开放。
  2. **文档腐烂清理**(QQL 删除漏网,本次扫全):backlog §A `B-QQL-EXPAND`、§B `B-QQL-TS`、§C `B-ED-QQL-WYSIWYG`、§F `B-QQL-MOCK-GAP`/`B-QQL-PARITY-CI` 标 🗑️ 已删;docs/06 Phase 4/5 三处用户面、deferred「内联 qql 渲染」整段 + 编辑器「现状/缺口」段、docs/09 验收 #1、04 F-EDITOR 行去 qql;Editor.tsx / WysiwygView.tsx 的 `root` 注释改为附件用途。**引擎侧(`run_qql` MCP/Tauri、core `qql::parse`、docs/06:52 文本层)✅ 保留未动**。
  3. 新增 backlog §C 行:`B-ED-OUTLINE`(✅)、`B-ED-FIND-REPLACE`、`B-ED-IMAGE-BUTTON`、`B-ED-WYSIWYG-IMG`、`B-BN-FIDELITY-DEEP`(均 ⏳)。
- **理由 / 影响**:把「下一步该补什么编辑器功能」从模糊的「可选加深」落到**可执行清单**;同时还清 QQL 删除的文档债。
- **下一步 / 接手注意**:本次只更文档(用户指定「先更新文档」);代码修复(查找替换 + 插图按钮)待用户点头再动。`B-ED-WYSIWYG-IMG` 是**待验证**项——动手前先确认 BlockNote slash 插图的实际落盘行为。

### 2026-08-02 Claude — 删除 QQL 用户面,引擎保留待 agent

- **branch**: `main`(未 push)。
- **做了**:
  1. **决策**:QQL 的**用户面 A** 整体删除——笔记内联 ```qql 块 widget、`type: Query` saved query、`QueryPanel`、Query 视图、`MainView:"query"`、CenterToolbar 查询按钮、palette/registry 查询命令、TS 全量重写 `ui/src/lib/qql/*` + `mock-qql` + `qql-block` + `wysiwyg-qql`、相关 i18n 键。
  2. **引擎 B 保留**(勿删):Rust core `qql::parse`/`query::eval`、MCP `run_qql`、app Tauri `run_qql` 命令。
  3. 文档同步:[04](docs/04-features.md) F-QUERY、[09](docs/09-big-features-v1.md) B-QQL-TS、[12](docs/12-graph-and-agent-roadmap.md) §6B(NL→QQL 写入)。
- **理由 / 影响**:不让用户学新 DSL(认知负担=语法+字段名+字面值+render 动词四层叠加)。QQL 退成 IR,用户表面留到 6B 接 agent 用**自然语言**重建:NL → agent 生成可审查 QQL → `run_qql`。
- **下一步 / 接手注意**:
  - 引擎 + MCP `run_qql` **勿删**;app Tauri `run_qql` 命令保留(未来 in-app NL 直连)。
  - 6B 开工前可先用外部 agent 经 MCP `run_qql` 验证 NL→QQL 生成质量。
  - nav-selection 的 `kind:"query"` 变体、`nav-filter`/`NoteListView` 的 query 分支已清,改 Nav 选择模型时注意不要再加回。

- **branch**: `feat/phase1-core`。
- **做了**:
  1. `app/src-tauri/src/logging.rs`:profile dev/verbose/prod、NDJSON 日文件 + `.error.log`、prune 14 天、panic hook、stderr。
  2. 命令:`log_write`/`log_get_dir`/`log_open_dir`/`log_set_profile`/`log_get_status`;`diag_log` 转 Error。
  3. UI:`logger.ts`、`diag-log` 接 LogBus;Settings 诊断区(profile + 打开文件夹);i18n zh/en。
  4. IPC 打点:index_vault / write_note / pick_vault。
  5. 测试:logging 6 单测;logger + i18n vitest;typecheck 绿。
- **用法**:`~/Library/Logs/dev.openobsidian.desktop/`(macOS);`OPENOBS_LOG_PROFILE=verbose`;设置→诊断。
- **下一步**:L2 端口 + 导出 zip;更多 git 打点。

### 2026-08-02 Grok — 调研:客户端日志/调试方案(doc 12)

- **branch**: `feat/phase1-core`(文档)。
- **做了**:新建 [docs/13-client-logging.md](docs/13-client-logging.md):现状 diag_log 仅 stderr;推荐 **LogBus 中间件**(Filter+Sink)+ 文件 NDJSON(AppLog 目录)+ 可选 TCP 端口;profile `dev/verbose/prod` 一键瘦身;用户导出 zip 供 agent 排查;分期 L1–L3;backlog **§J** 四 ID;docs/README 索引。
- **下一步**:实现 B-LOG-BUS(L1) 即可让反馈问题可读客户端日志。

### 2026-08-01 Grok — 审阅修订 docs/11(#1–#5 与次要项)

- **branch**: `feat/phase1-core`(文档)。
- **做了**:按交叉审阅修订 [12](docs/12-graph-and-agent-roadmap.md)+ [backlog §I](docs/backlog.md)+ [open-questions](docs/open-questions.md) P6-4/7/8 + 04/deferred:
  1. 阶段名统一 **6A–6D**(消灭裸 A/B/C/D)。
  2. 6A1 标明内存暖启动已有,本项=落盘+键+合流;**.openobsidian/** 为新约定; **P6-7 默认 gitignore** 布局文件。
  3. 6C 写明 **EdgeKind::Semantic core 级联** + P6-8;洞察术语去 edge-bridge 混淆,难度 🔴。
  4. 6A5 不绑 6B links;MCP 写全 **6 tools**;6B3 仅 MCP 契约 + 可选 B-ED-BROKEN-LINKS;6D `status` 唯一真相;6D2 🟢。
- **下一步**:6A 实现;P6-7 若要团队共享布局再改默认。

### 2026-08-01 Grok — 规划:图 polish → Agent(参考两项目 · 文档同步)

- **branch**: `feat/phase1-core`(文档未要求 commit)。
- **做了**:
  1. 新建 **[docs/12-graph-and-agent-roadmap.md](docs/12-graph-and-agent-roadmap.md)**:Phase **6A 图 UX** → **6B 图健康+MCP** → **6D LLM wiki** → **6C 语义边(可选)**;验收/测试/红线;合成 varshithm7x(图手感)与 inkeep(agent/`links` 语义,GPL 零拷贝)。
  2. 同步 **[backlog §I](docs/backlog.md)**(全部新 ID)、[06-roadmap Phase 6](docs/06-roadmap.md)、[04 F-GRAPH/F-AI](docs/04-features.md)、[deferred 图谱 UX+Agent](docs/deferred.md)、[open-questions P6-*](docs/open-questions.md)、[docs/README](docs/README.md)。
  3. B-MCP 状态改为 🟡(v1 齐,图工具化在 6B)。
- **理由 / 影响**:产品确认「先图后 agent」;agent 开工有单一规划源与 backlog ID。
- **下一步 / 接手注意**:实现从 **6A**(B-GRAPH-POS-PERSIST / FORCES / SETTINGS-UI / HIDE-UNRESOLVED)或竖切 **6B-1 links** 开;勿引入 GPL 依赖;引擎保持 sigma。

### 2026-07-31 Grok — TDD 收口:QQL 差分 CI + WYSIWYG 插图 + 1k 布局冒烟

- **branch**: `feat/phase1-core`(push)。
- **做了**:
  1. `fixtures/qql-parity/cases.json` + `core/tests/qql_parity.rs` + `ui/src/lib/qql/parity.test.ts`(B-QQL-PARITY-CI)。
  2. WYSIWYG 粘贴/拖入图:`wysiwyg-media.ts` + WysiwygView paste/drop + attachmentsDir。
  3. `graph-layout-large.test.ts`:1k Barnes-Hut 限时冒烟(非 GUI fps)。
- **验证**:typecheck;vitest 全绿;cargo test -p openobs-core;playwright 18。

### 2026-07-31 Grok — 文档对齐 + 三项核实(QQL 差分/缺口文案/图谱帧率)

- **branch**: `feat/phase1-core`。
- **做了**:
  1. 改写 [04-features](docs/04-features.md) / [06-roadmap](docs/06-roadmap.md) 过时「最大缺口=编辑器/菜单」与 mock-qql/菜单 ⏳ 状态。
  2. **核实**:QQL 差分 CI **不存在**(可选 B-QQL-PARITY-CI);图谱生成器 **有**、帧率数字 **无**;文档债已消。
  3. backlog §E 补 B-QQL-PARITY-CI;deferred 图谱/qql 表述对齐。
- **下一步**:合 main 或 WYSIWYG 插图 / 本机跑 benchmark vault。

### 2026-07-30 Grok — 命令/搜索完整测试

- **branch**: `feat/phase1-core`。
- **做了**:扩 `commands.test`(菜单契约 id、when、rank);`CommandPalette.test.tsx` 三 mode;e2e `palette-search.spec.ts`(⌘K/⌘P/⌘⇧F/Esc)。
- **验证**:vitest **525**;playwright **18** 全绿。

### 2026-07-30 Grok — 实现:命令注册表 + 菜单 v2 + 三 mode 面板 + 库搜

- **branch**: `feat/phase1-core`。
- **做了**:
  1. `ui/src/lib/commands/*`:buildAppCommands / filter / rankFiles / mapSearchHits / runCommandById。
  2. Tauri File/Edit/View 补 new-sheet/reveal/archive/close/find-vault/split/theme/refresh。
  3. App:`dispatchCommand`;⌘O=开 vault;⌘P=files;⌘⇧F=search;⌘K=commands;⌘W 关标签。
  4. CommandPalette 三 mode + searchNotes 防抖。
  5. backlog §H ✅;vitest 507。
- **下一步**:e2e 烟雾;菜单 i18n 重建(可选)。

### 2026-07-30 Grok — 规划:菜单 / 命令面板 / 三层搜索

- **branch**: `feat/phase1-core`。
- **做了**:新增 [docs/10-menus-and-search.md](docs/10-menus-and-search.md);backlog §H 六项;诊断:系统菜单薄、`searchNotes` UI 未接、⌘O 与 Open Vault 冲突。
- **下一步**:按 10 文 Phase1 起实现 registry + 菜单对齐 + 库搜 UI + 测试。

### 2026-07-30 Grok — 产品拍板:SHEET 不做 xlsx 全量 / 实时协作

- **branch**: `feat/phase1-core`。
- **做了**:文档落档——对照 Tolaria/Obsidian 核心也不以 xlsx 互通与同屏协作为主路径;OpenObsidian 明确 ⛔。共享 vault 继续 git。
- **下一步**:无此二项工程;合 main / 签名 / 真机图谱等另议。

### 2026-07-30 Grok — F-SHEET v2(多表/冻结/图表/嵌入/IronCalc);插件深化不做

- **branch**: `feat/phase1-core`。
- **做了**:
  1. sheet schema v2:多 tab、freezeRows/Cols、charts;v1 自动迁移。
  2. 公式:SUM/AVERAGE/MIN/MAX/COUNT、跨表引用;可选 `@ironcalc/wasm`。
  3. SheetView:表标签、冻结控件、图表侧栏。
  4. ````sheet` 围栏 + ReadingPane 嵌入预览(`sheet-block.ts`)。
  5. 产品决定:**插件深化不做**;backlog B-PLUGIN ⛔。
- **验证**:ui typecheck + test。
- **下一步**:合 main / 签名 / 真机图谱。

### 2026-07-30 Grok — 大件 v1:QQL-TS / MCP / PLUGIN / SHEET

- **branch**: `feat/phase1-core`。
- **做了**:
  1. 方案 [docs/09-big-features-v1.md](docs/09-big-features-v1.md)。
  2. **B-QQL-TS**:`ui/src/lib/qql/*` 全量 parse+eval;mock `run_qql` 改走 TS。
  3. **B-MCP**:`mcp/` crate `openobs-mcp` stdio tools(list/read/write/search/qql)。
  4. **B-PLUGIN**:manifest + 权限 + iframe 示例插件 → ⌘K 命令。
  5. **B-SHEET**:`.sheet` schema + SheetView 网格 + 基础公式;store/App 路由。
  6. backlog §B 四项 ✅(v1);deferred/04/README 同步。
- **验证**:ui typecheck + **491** tests;cargo check openobs-mcp。
- **下一步**:插件 vault 扫描 UI;MCP 接 Claude Desktop 配置样例;sheet 深化或差分 QQL。

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

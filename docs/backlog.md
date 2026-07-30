# 未完成清单(Backlog)

> **单一事实来源**:「还没做 / 还要做」看本文。  
> 难点拆解与前置细节仍在 [deferred.md](./deferred.md);路线图阶段叙事在 [06-roadmap.md](./06-roadmap.md)。  
> 状态:⏳ 未做 · 🟡 部分 · ✅ 已做 · 🧪 真机验收 · 🔑 凭证门  
> 难度:🟢 易 · 🟡 中 · 🔴 硬

**边界变更(2026-07-30)**:原「v1 刻意不做」三项(类型文档、图谱分层/时间轴、QQL 向 Dataview 扩)改为**正式待办**,不再用 scope creep 挡掉。软类型原则不变:`type` 永不强制校验、永不阻止保存。

---

## A. 原 v1 边界 → 现待办

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-TYPE-DOC | **类型文档(type document)** | 🟡 | ⏳ | 某 `type` 可有一篇说明笔记(约定/示例/字段提示),**仅 UI 提示层**,不构成 schema 约束、不绑保存。原 P4「v1 不做」作废。 |
| B-GRAPH-LAYER | **图谱按 type 分层布局** | 🟡 | ⏳ | 力导向之外:节点按 type 落在水平/垂直带;可切换回 FR。 |
| B-GRAPH-TIME | **图谱按时间轴布局** | 🟡 | ⏳ | 按 `created` / `modified` 排布;缺日期节点落「未知」带。 |
| B-QQL-EXPAND | **QQL 向 Dataview 常用子集扩展** | 🔴 | ⏳ | 在现有 DQL 风 AST/求值上扩:更完整 WHERE(字段路径、`contains`、关系聚合)、JOIN/嵌套、更多 RENDER、日期比较等。**不是**逐字兼容 Dataview 全语法;目标是迁移成本低。完整移植到浏览器 TS 仍可选(见 B-QQL-TS)。 |

---

## B. 产品大件(未做)

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SHEET | **F-SHEET 嵌入式表格** | 🔴 | ⏳ | ironcalc 仅 wasm、无 React UI;或换库/自研。文件格式(.md 内嵌 vs `.sheet`)待定。 |
| B-PLUGIN | **F-PLUGIN 插件系统** | 🔴 | ⏳ | API 契约 + 沙箱 + 生命周期 + 分发 + 安全;禁止空注册器。 |
| B-MCP | **完整 MCP server(AI 写侧)** | 🔴 | ⏳ | 读侧「复制 AI 上下文」✅;agent 读写 vault 的 tools/权限/传输未做。 |
| B-BN-FIDELITY | **BlockNote ↔ Markdown 保真** | 🟡 | 🟡 | 双模已能用;缺差分测试集 + 禁用特性表 + 长文性能基线。 |
| B-QQL-TS | **QQL 求值器移植/共享到 TS** | 🔴 | ⏳ | 可选。当前 mock-qql 子集够 vite dev;真机已走 Rust。 |

---

## C. 图谱 / 查询(剩余)

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-GRAPH-FPS | **万级帧率验收** | 🟡 | 🧪 | 代码(WebGL/Worker/BH/LOD/标签避让/增量预算)已齐。门禁:1k≥30fps / 5k 可用 / 10k LOD。基准 vault:`tools/gen-benchmark-vault.mjs`。 |
| B-GRAPH-LAYOUT-UI | **布局模式切换 UI** | 🟢 | ⏳ | 力导向 / type 分层 / 时间轴 切换入口(依赖 B-GRAPH-LAYER / B-GRAPH-TIME)。 |
| B-QQL-MOCK-GAP | **mock-qql 与 core 语义差** | 🟡 | 🟡 | 复杂 AND/OR/关系函数 mock 仍降级;以 Rust 为准。扩 mock 或 B-QQL-TS。 |

---

## D. 分发与工程

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SIGN-MAC | macOS 签名 + 公证 | 🟢 | 🔑 | workflow 槽位已有;需 APPLE_* secrets。 |
| B-SIGN-WIN | Windows 安装包签名 | 🟢 | 🔑 | 需证书。 |
| B-UPDATER | 自动更新 Updater | 🟡 | 🔑 | 需 TAURI_PRIVATE_KEY + 是否上线决策。 |
| B-UNIVERSAL-DMG | universal `.dmg`(arm64+x86_64) | 🟢 | ⏳ | 现分架构各打一份,未 lipo。 |
| B-AGENTS-TLDRAW | **AGENTS.md tldraw 叙述** | 🟢 | ⏳ | 人类维护约定层:应改为 Excalidraw / 默认纯 MIT(agent 不改 AGENTS.md)。 |
| B-MERGE-MAIN | `feat/phase1-core` → main | 🟢 | 🧪 | 分支已 push;合 main 由你操作。 |

---

## E. 已完成(对照,避免重复开坑)

以下**不要**再当 backlog 开:

- F-GRAPH 主路径(过滤/交互/WebGL/Worker/BH/LOD/标签避让/增量布局)
- F-QUERY 主路径(parse/eval/List/Table/Count/Groups/Sum/Histogram/内联块/saved query)
- Live 索引 + watcher 路径 delta + 刷新索引自愈
- Excalidraw 画布(旧 tldraw 只读)
- ⌘F / ⌘P / 无独立搜索视图
- Nav TAGS、拖拽移动、git pull/push、归档走 git
- zh/en i18n、标签循环、恢复上次笔记
- CI 骨架 + 本地 dmg 打包

---

## 建议实现顺序(产品向)

1. **B-TYPE-DOC** + **B-GRAPH-LAYER** / **B-GRAPH-TIME** + **B-GRAPH-LAYOUT-UI**(原 v1 边界,用户面可见)  
2. **B-QQL-EXPAND**(查询差异化加深)  
3. **B-BN-FIDELITY**(日常编辑质量)  
4. **B-MCP**(AI 写侧)  
5. **B-PLUGIN** → **B-SHEET**(生态 / 重 UI)  
6. 并行:**B-GRAPH-FPS** 你本地验;**B-SIGN-*** / **B-UPDATER** 配密钥后开  

---

## 与其它文档的关系

| 文档 | 角色 |
|---|---|
| **本文 backlog.md** | 未做清单总表 |
| [deferred.md](./deferred.md) | 难点/前置/「为什么难」 |
| [04-features.md](./04-features.md) | 功能规格与状态 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事 |
| [open-questions.md](./open-questions.md) | 待拍板决策(已拍的标 ✅) |

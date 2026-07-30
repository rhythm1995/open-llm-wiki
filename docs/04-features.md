# 04 — 功能规格

## 优先级

- **P0** — v1 必须。没有它,v1 不成立。
- **P1** — v1 尽力。有它 v1 才"好用"。
- **P2** — 后期阶段(成熟度对齐 Tolaria)。
- **P3** — 远期(对齐 Tolaria 的高级能力)。

---

## 两大差异化(Tolaria 缺、Obsidian 靠插件:本项目存在的理由)

### F-GRAPH 图谱可视化 [P0] ✅ 已落地(渲染层与初版不同)

**一句话**:把整个 vault 的 wikilink + frontmatter 关系画成一张可交互的力导向图。

- **数据来源**:`core::graph` 产出的统一关系图(正文 wikilink + frontmatter 关系,见 [03-data-model](./03-data-model.md))。
- **节点** = note;**边** = link,按 `EdgeKind`(Wiki / Relation)区分。悬空链接画虚边。
- **渲染**:**sigma.js WebGL**(graphology)+ **Worker** FR(`graph-layout.ts`);n≥280 自动 **Barnes-Hut** O(n log n)。无 WebGL → SVG。top-K(~2000 WebGL / ~400 SVG);低缩放 **LOD** 网格簇 + 簇间边 + 点簇飞入展开。拖拽/框选/pin/邻域压暗/悬空边双路径。纯逻辑可单测(见 [deferred](./deferred.md))。
- **交互** ✅:点击节点跳转、缩放/平移、拖拽节点重定位、右键菜单(聚焦 1 跳 / 复制 `[[wikilink]]` / 隐藏此类型)。⏳ 悬停预览、框选、拖拽固定、按深度 N 跳邻域。
- **过滤**(核心竞争力) ✅:按 `type` 显隐(顶部面板)。⏳ 按 `tag`/`status`/深度/关系类型/文本高亮子图。
- **实时**:**随 `index_vault` 全量 rebuild**(无 watcher,前端主动刷新);位置 Map 跨帧持久 + 增量/稳定布局(新增节点就近播种,过滤切换不乱跳)。
- **布局**:力导向(默认)。⏳ 「按 type 分层」「按时间排列」未做。

> UI 蓝本参考 Tolaria 关系渲染与 Obsidian graph 的交互心智模型,以自己的实现重写。

### F-QUERY 实时聚合查询 [P0] ✅ 已落地

**一句话**:内置查询引擎,用一段声明式查询从全 vault 的 frontmatter/body 取数,实时渲染成列表/表/计数。Dataview 的一等公民版,但在 Rust 核心跑,快。

- **查询语言(QQL)**——已实现子集(DQL 风格,关键字 `WHERE` / `SORT` / `SHOW` / `LIMIT`):
  ```
  WHERE type = "Concept" AND status != "Done"
  SORT mentioned_in.len() ASC
  SHOW title, status, mentioned_in.len() AS depth
  LIMIT 50
  ```
  文本 → AST(`qql::parse`)→ 求值(`query::eval`),全在纯内核。语法接近 Dataview DQL(降迁移成本),语义由 Rust 定义。
- **两个表面** ✅:
  1. **内联查询块**——笔记内 ```qql ... ``` 代码块,编辑器内实时求值(widget)+ 阅读视图求值渲染(共用 `resultToHtml`,两路一致)。
  2. **saved query**——常用 QQL 存成一篇 `type: Query` 的普通笔记(正文放 ```qql 块),故自举进索引/图谱/检索,可被 `[[]]` 链接、可被别的 QQL 查到(纯逻辑 `saved-query.ts`)。
- **输出**(`ResultSet`):`List` / `Table` / `Count` / `Groups`(group by) / `Sum`。⏳ `histogram` 未做。
- **实时**:查询在不可变快照上执行;快照随 `index_vault` 刷新。
- **与 cairn 的关系**:cairn 的 `wiki-health` 页所有 KPI(概念饥饿度、证据质量分布、综合度…)就是一组 QQL 的渲染。OpenObsidian 让它从"agent 手写的静态快照"变成"live 查询"——见 [07-llm-wiki-architecture](./07-llm-wiki-architecture.md) §3「Health 即查询」。

> 这正是 Tolaria `VISION`/`AGENTS` 里"无实时聚合"留下的缝。我们补上。

---

## 软类型系统

### F-TYPE 软类型 [P0]

- `type:` 是 `Option<String>`,任意值,**永不校验、永不阻止保存、永不报错**。
- 缺失 → 默认 `Note`。app 据 type 分组/着色/给默认图标(可配)。
- **类型文档(type document)** 在 v1 **不做**(它是 Tolaria "绑人"的源头之一);v2 可加,且仅作 UI 提示层,不构成 schema 约束。
- 约定键(`status`/`tags`/`created`)识别即富行为,但全可忽略。

---

## Obsidian/Tolaria 对等能力

> UI 蓝本参考 Tolaria `design/*.pen`(每个 .pen 对应一个功能的设计稿)。以自己的实现重写。

| ID | 功能 | 级别 | 状态 | 说明 |
|---|---|---|---|---|
| F-EDITOR | 编辑器 | P0 | ✅ | CodeMirror 6 单轨(自动保存防抖);ReadingView(marked)看渲染。⏳ BlockNote 富文本延后。 |
| F-VAULT | vault 管理 | P0 | ✅ | 打开/切换目录;递归扫描;忽略 `.git`/`.obs` 等。 |
| F-WIKILINK | wikilink + 反向链接 | P0 | ✅ | `[[link]]` 解析、`[[` 补全、Cmd/Ctrl+点击跳转;反向链接(`mentioned_in` 实时计算)。 |
| F-FILETREE | 文件浏览 | P0 | ✅ | Nav(智能视图)+ NoteListView;新建/重命名/删除。⏳ 拖拽。 |
| F-SEARCH | 全文/查找 | P0 | ✅ | 文档内 ⌘F(FindBar + CM 高亮);⌘P 快速打开笔记;⌘K 命令面板。独立「搜索视图」已移除。core `search_notes` 仍供 IPC。 |
| F-PROPERTIES | 属性面板 | P1 | ✅ | 可视化编辑 frontmatter(行级最小侵入,按需加引号)。 |
| F-STATUS | status chip | P1 | ✅ | `status:` 彩色 chip(按词根模糊映射 Active/Done/Contested/Superseded…)。 |
| F-TAGS | 标签 | P1 | 🟡 | 行内 `#tag` + frontmatter `tags:` 解析 ✅;⏳ 标签视图。 |
| F-PALETTE | 命令面板 | P1 | ✅ | ⌘K,type 感知。 |
| F-TABS | 多标签 | P1 | ✅ | 开/关/激活/循环(Ctrl+Tab)/拖拽重排;响应式宽度。 |
| F-TEMPLATES | 模板 | P2 | ✅ | `templates/` 套用,`{{title}}`/`{{date}}` 替换。 |
| F-THEMES | 主题 | P2 | ✅ | 深/浅(CSS 变量令牌换肤)。 |
| F-GIT | git 集成 | P2 | ✅ | commit/log/状态(GitPanel);**归档并入 git**:删除自动提交、`git_restore_note` 还原。⏳ pull/冲突解决。 |
| F-TRASH | ~~回收站~~ | P2 | ➡️ 取代 | **已被「归档并入 git」取代**(见 F-GIT):删 `.trash/`,删除/还原全走 git。 |
| F-AI | AI 上下文 + MCP | P2 | 🟡 | 读侧「复制为 AI 上下文」✅;⏳ 完整 MCP server(写侧)延后(见 [deferred](./deferred.md))。 |
| F-L10N | 国际化 | P2 | ✅ | i18n(中/英)。 |
| F-CANVAS | canvas 画布 | P3 | ✅ | **Excalidraw(MIT)**;`.canvas` 为 OpenObsidian schema(`engine:excalidraw`);懒加载 chunk。旧 tldraw 快照只读提示,不自动迁移。 |
| F-SHEET | 表格 | P3 | ⏳ | ironcalc 式;npm 仅 wasm 引擎无 React UI,延后(见 [deferred](./deferred.md))。 |
| F-PLUGIN | 插件 API | P3 | ⏳ | 开放扩展点;需先固化 v1 API + 沙箱(见 [deferred](./deferred.md))。 |

## v1 功能边界(明确不做,防 scope creep)

v1 = F-VAULT + F-EDITOR + F-WIKILINK + F-FILETREE + F-SEARCH + **F-GRAPH** + **F-QUERY** + F-TYPE + F-PROPERTIES + F-STATUS + F-PALETTE + F-TABS + 深色主题。其余全 v2+。

> **实际进度**:v1 范围全部落地,且已**超出**——P1/P2/P3 多项已实现(F-TEMPLATES/F-THEMES/F-GIT/F-L10N/F-CANVAS,见上表「状态」列)。F-TRASH 被「归档并入 git」取代。剩余 ⏳ 见 [deferred](./deferred.md)。

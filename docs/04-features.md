# 04 — 功能规格

## 优先级

- **P0** — v1 必须。没有它,v1 不成立。
- **P1** — v1 尽力。有它 v1 才"好用"。
- **P2** — 后期阶段(成熟度对齐 Tolaria)。
- **P3** — 远期(对齐 Tolaria 的高级能力)。

---

## 两大差异化(Tolaria 缺、Obsidian 靠插件:本项目存在的理由)

### F-GRAPH 图谱可视化 [P0] ✅ 已落地

**一句话**:把整个 vault 的 wikilink + frontmatter 关系画成一张可交互的力导向图。

- **数据来源**:`core::graph` 产出的统一关系图(正文 wikilink + frontmatter 关系,见 [03-data-model](./03-data-model.md))。
- **节点** = note;**边** = link,按 `EdgeKind`(Wiki / Relation)区分。悬空链接画虚边 / WebGL ghost 桩。
- **渲染**:**sigma.js WebGL**(graphology)+ **Worker** FR(`graph-layout.ts`);n≥280 自动 **Barnes-Hut** O(n log n)。无 WebGL → SVG。top-K(~2000 WebGL / ~400 SVG);低缩放 **LOD** 网格簇 + 簇间边 + 点簇飞入展开。**标签避让**(`graph-label.ts`);**增量迭代预算**(`graph-layout-budget.ts`)。拖拽/框选/pin/邻域压暗双路径。纯逻辑可单测。
- **交互** ✅:点击跳转、缩放/平移、拖拽节点 + 自动 pin、Shift 框选、悬停预览、右键(聚焦 1 跳 / pin / 复制 `[[wikilink]]` / 隐藏类型)、N 跳邻域聚焦。
- **过滤** ✅:type / tag / status / 关系种类 / 隐藏孤儿 / 文本 query 高亮 / 深度 hops。
- **实时**:LiveVault 路径级 delta + watcher;`structureSignature` gate 布局;位置 Map 跨帧持久 + 暖启动。
- **布局**:力导向(默认)。「按 type 分层」「按时间排列」未做(v2+ 可选)。

> UI 蓝本参考 Tolaria 关系渲染与 Obsidian graph 的交互心智,实现独立编写。

### F-QUERY 实时聚合查询 [P0] ✅ 已落地

**一句话**:内置查询引擎,用一段声明式查询从全 vault 的 frontmatter/body 取数,实时渲染成列表/表/计数。Dataview 的一等公民版,在 Rust 核心跑。

- **查询语言(QQL)**——已实现子集(DQL 风格,关键字 `WHERE` / `SORT` / `SHOW` / `LIMIT` / `GROUP BY` / `RENDER`):
  ```
  WHERE type = "Concept" AND status != "Done"
  SORT mentioned_in.len() ASC
  SHOW title, status, mentioned_in.len() AS depth
  LIMIT 50
  ```
  文本 → AST(`qql::parse`)→ 求值(`query::eval`),全在纯内核。
- **两个表面** ✅:
  1. **内联查询块**——笔记内 ```qql ... ```,编辑器 widget + 阅读视图(共用 `resultToHtml`)。
  2. **saved query**——`type: Query` 笔记自举(纯逻辑 `saved-query.ts`)。
- **输出**(`ResultSet`):`List` / `Table` / `Count` / `Groups` / `Sum` / **`Histogram`**。
- **实时**:查询在 live 不可变快照上执行;写/watcher 路径级更新索引。
- **浏览器 mock**:`mock-qql` 子集(type/status/tag/LIMIT/COUNT/GROUP/histogram)供 `vite dev` 预览;完整语义以 Rust 为准。
- **与 cairn**:Health KPI 可落成 live QQL——见 [07-llm-wiki-architecture](./07-llm-wiki-architecture.md)。

---

## 软类型系统

### F-TYPE 软类型 [P0]

- `type:` 是 `Option<String>`,任意值,**永不校验、永不阻止保存、永不报错**。
- 缺失 → 默认 `Note`。app 据 type 分组/着色。
- **类型文档(type document)** 在 v1 **不做**;v2 可加,仅 UI 提示,不构成 schema 约束。
- 约定键(`status`/`tags`/`created`)识别即富行为,但全可忽略。

---

## Obsidian/Tolaria 对等能力

> UI 蓝本参考 Tolaria `design/*.pen`。以自己的实现重写。

| ID | 功能 | 级别 | 状态 | 说明 |
|---|---|---|---|---|
| F-EDITOR | 编辑器 | P0 | ✅ | CodeMirror 源码 + **BlockNote WYSIWYG** 双模(同一 `.md`);ReadingView(marked+DOMPurify)。round-trip 保真子集见 [deferred](./deferred.md)。 |
| F-VAULT | vault 管理 | P0 | ✅ | 打开/切换;LiveVault 增量索引;忽略 `.git` 等。 |
| F-WIKILINK | wikilink + 反向链接 | P0 | ✅ | `[[link]]` 解析、补全、点击跳转;反向链接实时。 |
| F-FILETREE | 文件浏览 | P0 | ✅ | Nav(VIEWS/TYPES/**TAGS**/FOLDERS)+ NoteListView;新建/重命名/删除/**拖拽移动**。 |
| F-SEARCH | 全文/查找 | P0 | ✅ | ⌘F FindBar(CM 高亮 / wysiwyg window.find);⌘P 快速打开;⌘K 命令。无独立搜索视图。 |
| F-PROPERTIES | 属性面板 | P1 | ✅ | frontmatter 可视化编辑。 |
| F-STATUS | status chip | P1 | ✅ | status 彩色 chip + 右键切状态。 |
| F-TAGS | 标签 | P1 | ✅ | `#tag` + frontmatter tags;Nav **TAGS** 分组过滤列表。 |
| F-PALETTE | 命令面板 | P1 | ✅ | ⌘K;含刷新索引等。 |
| F-TABS | 多标签 | P1 | ✅ | 开/关/循环/拖拽重排。 |
| F-TEMPLATES | 模板 | P2 | ✅ | `templates/` + `{{title}}`/`{{date}}`。 |
| F-THEMES | 主题 | P2 | ✅ | 深/浅 CSS 变量。 |
| F-GIT | git 集成 | P2 | ✅ | status/log/commit;**pull/push** + 冲突横幅;删除归档走 git + restore。 |
| F-TRASH | ~~回收站~~ | P2 | ➡️ 取代 | 归档并入 git。 |
| F-AI | AI 上下文 + MCP | P2 | 🟡 | 读侧「复制 AI 上下文」✅;完整 MCP server 延后(见 [deferred](./deferred.md))。 |
| F-L10N | 国际化 | P2 | ✅ | zh/en。 |
| F-CANVAS | canvas 画布 | P3 | ✅ | **Excalidraw(MIT)**;旧 tldraw 只读。 |
| F-SHEET | 表格 | P3 | ⏳ | 见 [deferred](./deferred.md)。 |
| F-PLUGIN | 插件 API | P3 | ⏳ | 见 [deferred](./deferred.md)。 |

## v1 功能边界(明确不做,防 scope creep)

v1 = F-VAULT + F-EDITOR + F-WIKILINK + F-FILETREE + F-SEARCH + **F-GRAPH** + **F-QUERY** + F-TYPE + F-PROPERTIES + F-STATUS + F-PALETTE + F-TABS + 深色主题。其余全 v2+。

> **实际进度**:v1 全部落地且超出(模板/主题/git/L10N/画布/标签区/拖拽/pull 等)。剩余大件见 [deferred](./deferred.md)。

# 04 — 功能规格

## 优先级

- **P0** — v1 必须。没有它,v1 不成立。
- **P1** — v1 尽力。有它 v1 才"好用"。
- **P2** — 后期阶段(成熟度对齐 Tolaria)。
- **P3** — 远期(对齐 Tolaria 的高级能力)。

---

## 两大差异化(Tolaria 缺、Obsidian 靠插件:本项目存在的理由)

### F-GRAPH 图谱可视化 [P0] ✅ 主路径已落地 · ⏳ 多布局待办

**一句话**:把整个 vault 的 wikilink + frontmatter 关系画成一张可交互的力导向图。

- **数据来源**:`core::graph` 产出的统一关系图(正文 wikilink + frontmatter 关系,见 [03-data-model](./03-data-model.md))。
- **节点** = note;**边** = link,按 `EdgeKind`(Wiki / Relation)区分。悬空链接画虚边 / WebGL ghost 桩。
- **渲染**:**sigma.js WebGL**(graphology)+ **Worker** FR(`graph-layout.ts`);n≥280 自动 **Barnes-Hut** O(n log n)。无 WebGL → SVG。top-K(~2000 WebGL / ~400 SVG);低缩放 **LOD** 网格簇 + 簇间边 + 点簇飞入展开。**标签避让**(`graph-label.ts`);**增量迭代预算**(`graph-layout-budget.ts`)。拖拽/框选/pin/邻域压暗双路径。纯逻辑可单测。
- **交互** ✅:点击跳转、缩放/平移、拖拽节点 + 自动 pin、Shift 框选、悬停预览、右键(聚焦 1 跳 / pin / 复制 `[[wikilink]]` / 隐藏类型)、N 跳邻域聚焦。
- **过滤** ✅:type / tag / status / 关系种类 / 隐藏孤儿 / 文本 query 高亮 / 深度 hops。
- **实时**:LiveVault 路径级 delta + watcher;`structureSignature` gate 布局;位置 Map 跨帧持久 + 暖启动。
- **布局**:
  - ✅ 力导向(默认,FR + Barnes-Hut)。
  - ✅ **按 type 分层**(B-GRAPH-LAYER)。
  - ✅ **按时间轴**(created/modified)(B-GRAPH-TIME)。
  - ✅ 布局模式切换 UI(B-GRAPH-LAYOUT-UI)。

> UI 蓝本参考 Tolaria 关系渲染与 Obsidian graph 的交互心智,实现独立编写。未做项见 [backlog](./backlog.md)。

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
- **扩展** ✅(B-QQL-EXPAND):`CONTAINS` / `STARTSWITH` / `ENDSWITH` / `IN (...)` 等常用子集。**不**追求 Dataview 全语法逐字兼容。
- **与 cairn**:Health KPI 可落成 live QQL——见 [07-llm-wiki-architecture](./07-llm-wiki-architecture.md)。

---

## 软类型系统

### F-TYPE 软类型 [P0] ✅ 主路径 · ⏳ 类型文档待办

- `type:` 是 `Option<String>`,任意值,**永不校验、永不阻止保存、永不报错**(底线,不因类型文档改变)。
- 缺失 → 默认 `Note`。app 据 type 分组/着色。
- **类型文档(type document)** ✅(B-TYPE-DOC):`types/{Type}.md` 或 `type: TypeDoc`;Inspector「类型说明」**仅 UI 提示**,不构成 schema 约束。
- 约定键(`status`/`tags`/`created`)识别即富行为,但全可忽略。

---

## Obsidian/Tolaria 对等能力

> UI 蓝本参考 Tolaria `design/*.pen`。以自己的实现重写。

| ID | 功能 | 级别 | 状态 | 说明 |
|---|---|---|---|---|
| F-EDITOR | 编辑器 | P0 | 🟡 | 双模可用(CM source + BlockNote wysiwyg);**打磨缺口**见 [backlog §C](./backlog.md):格式条、正文右键、双模查找/qql 对齐、保真测试。 |
| F-VAULT | vault 管理 | P0 | ✅ | 打开/切换;LiveVault 增量索引。 |
| F-WIKILINK | wikilink + 反向链接 | P0 | ✅ | 解析、补全、点击跳转;反向链接实时。 |
| F-FILETREE | 文件浏览 | P0 | 🟡 | Nav+列表+拖拽移动 ✅;Nav **右键菜单** ⏳ B-NAV-CTX。 |
| F-SEARCH | 全文/查找 | P0 | 🟡 | ⌘F/⌘P ✅;wysiwyg 查找与 source 不齐 ⏳ B-ED-FIND-PARITY。 |
| F-PROPERTIES | 属性面板 | P1 | ✅ | frontmatter 可视化;类型说明提示。 |
| F-STATUS | status chip | P1 | ✅ | chip + 列表右键切状态。 |
| F-TAGS | 标签 | P1 | ✅ | 解析 + Nav TAGS。 |
| F-PALETTE | 命令面板 | P1 | 🟡 | ⌘K 有基础命令;**过瘦** ⏳ B-PALETTE-EXPAND。 |
| F-TABS | 多标签 | P1 | 🟡 | 开/关/循环/拖拽 ✅;Tab 右键 ⏳ B-TAB-CTX。 |
| F-TEMPLATES | 模板 | P2 | ✅ | |
| F-THEMES | 主题 | P2 | ✅ | 深/浅;无独立设置页 ⏳ B-SETTINGS。 |
| F-GIT | git 集成 | P2 | ✅ | commit/log/pull/push/归档。 |
| F-TRASH | ~~回收站~~ | P2 | ➡️ | 归档并入 git。 |
| F-AI | AI + MCP | P2 | 🟡 | 读侧 ✅;MCP 写侧 ⏳ B-MCP。 |
| F-L10N | 国际化 | P2 | ✅ | zh/en。 |
| F-CANVAS | 画布 | P3 | ✅ | Excalidraw MIT。 |
| F-SHEET | 表格 | P3 | ⏳ | B-SHEET。 |
| F-PLUGIN | 插件 | P3 | ⏳ | B-PLUGIN。 |
| F-APP-MENU | 系统菜单栏 | P2 | ⏳ | B-APP-MENU;现靠快捷键+顶栏+⌘K。 |

## 范围说明

**已交付核心**:vault / 双模编辑(可用) / wikilink / 列表+标签 / **图谱**(含多布局) / **QQL**(含扩展) / 类型文档提示 / git / 画布 / L10N / live 索引 等。

**原 v1 边界 §A** ✅ 类型文档 · 图谱分层/时间轴 · QQL CONTAINS/IN 等。

**当前最大产品缺口**(优先于表格/插件):

1. **编辑器打磨** — backlog §C  
2. **菜单与命令** — backlog §D(系统菜单 / ⌘K 扩面 / Nav·Tab·编辑器右键)  
3. **大件** — MCP · 插件 · 表格 · 签名分发  

完整 ID 表 → [backlog.md](./backlog.md)。

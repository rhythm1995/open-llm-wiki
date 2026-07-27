# 04 — 功能规格

## 优先级

- **P0** — v1 必须。没有它,v1 不成立。
- **P1** — v1 尽力。有它 v1 才"好用"。
- **P2** — 后期阶段(成熟度对齐 Tolaria)。
- **P3** — 远期(对齐 Tolaria 的高级能力)。

---

## 两大差异化(Tolaria 缺、Obsidian 靠插件:本项目存在的理由)

### F-GRAPH 图谱可视化 [P0]

**一句话**:把整个 vault 的 wikilink + frontmatter 关系画成一张可交互的力导向图,实时随笔记变化。

- **数据来源**:`core::graph` 产出的统一关系图(正文 wikilink + frontmatter 关系,见 [03-data-model](./03-data-model.md))。
- **节点** = note;**边** = link,按 `source`(正文/`wikilink`、或 frontmatter 键名)着色/区分。悬空链接画虚边。
- **渲染**:`react-force-graph-2d`(WebGL),支持几千节点流畅。超大库做 LOD(缩放折叠聚类)。
- **交互**:悬停预览、点击打开、右键"以此为中心展开"、框选、拖拽固定。
- **过滤**(核心竞争力):
  - 按 `type` / `tag` / `status` 显隐。
  - 按深度(只看 N 跳邻域)。
  - 按关系类型(只看 `mentions`,不看 `wikilink`)。
  - 按文本搜索高亮子图。
- **实时**:note 变更(watcher)→ 增量更新图 → diff 推给前端,不全量重渲。
- **布局**:力导向(默认),另提供"按 type 分层""按时间排列"两种。

> UI 蓝本参考 Tolaria `design/relationship-x-cosmetic.pen`(关系渲染)与 Obsidian graph 的交互心智模型,以自己的实现重写。

### F-QUERY 实时聚合查询 [P0]

**一句话**:内置查询引擎,用一段声明式查询从全 vault 的 frontmatter/body 取数,实时渲染成列表/表/计数。Dataview 的一等公民版,但在 Rust 核心跑,快。

- **查询语言(QQL,Query Query Language)**——v1 最小可用子集:
  ```
  from type == "Concept"
  where status != "done" and mentions.len() < 3
  sort mentioned_in.len() asc
  fields title, status, mentioned_in.len() as depth
  render table | list | count | group_by(type)
  ```
  语法刻意接近 Dataview DQL(降低迁移成本),但语义由 `core::query` 定义、Rust 实现。
- **两个表面**:
  1. **内联查询块**——笔记内 ```qql ... ``` 代码块,渲染时执行并内联显示结果(Dataview 心智)。
  2. **saved view**——`views/*.yml` 定义,作为侧栏可保存的实时面板(继承 Tolaria 的 view 概念,但加 `count`/`group_by`/聚合)。
- **输出**:`list` / `table` / `count` / `group_by(field)` / `sum(field)` / `histogram(field)`。
- **实时**:查询在索引上执行,索引随 watcher 更新 → 查询结果自动刷新。
- **与 cairn 的关系**:cairn 的 `wiki-health` 页所有 KPI(概念饥饿度、证据质量分布、综合度…)就是一组 QQL 查询的渲染。OpenObsidian 让它从"agent 手写的静态快照"变成"live 面板"。

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

| ID | 功能 | 级别 | 说明 |
|---|---|---|---|
| F-EDITOR | 编辑器(BlockNote + raw) | P0 | BlockNote 主编辑;raw CodeMirror 模式切纯 markdown。自动保存(防抖)。 |
| F-VAULT | vault 管理 | P0 | 打开/切换目录;递归扫描;忽略 `.git`/`.obs` 等;附件识别。 |
| F-WIKILINK | wikilink + 反向链接 | P0 | `[[link]]` 解析、补全、跳转;反向链接面板(`mentioned_in` 实时计算)。 |
| F-FILETREE | 文件树 | P0 | 树形浏览、新建/重命名/删除、拖拽。 |
| F-SEARCH | 搜索 + quick open | P0 | 全文(含 frontmatter)搜索;Cmd+P quick open。 |
| F-PROPERTIES | 属性面板 | P1 | 可视化编辑 frontmatter(键值行);参考 Tolaria `smart-property-display`/`property-value-input`。 |
| F-STATUS | status chip | P1 | `status:` 渲染彩色 chip;颜色可配(`status-color-picker`)。 |
| F-TAGS | 标签 | P1 | 行内 `#tag` + frontmatter `tags:`;标签视图。 |
| F-PALETTE | 命令面板 | P1 | Cmd+K,type 感知(`command-palette-type-aware`)。 |
| F-TABS | 多标签 | P1 | 多笔记并排;响应式宽度。 |
| F-TEMPLATES | 模板 | P2 | 新建笔记套模板(`note-templates`)。 |
| F-THEMES | 主题 | P2 | 可编辑主题;深色/浅色(`theming-system`/`themes-editable`)。 |
| F-GIT | git 集成 | P2 | 状态栏、pull、冲突解决(`git-status-bar`/`auto-pull-vault`/`sync-conflict-resolution`)。 |
| F-TRASH | 回收站 | P2 | 软删 + 恢复(`trash-management`/`trashed-note-editor`)。 |
| F-AI | AI 面板 + MCP | P2 | 内建 AI(@anthropic sdk)+ MCP server(`ai-agent-panel`/`mcp-autodetect`)。 |
| F-L10N | 国际化 | P2 | i18n 框架。 |
| F-CANVAS | canvas 画布 | P3 | tldraw 式白板(Obsidian Canvas 对等)。 |
| F-SHEET | 表格 | P3 | ironcalc 式表格(Tolaria 已有原型)。 |
| F-PLUGIN | 插件 API | P3 | 开放扩展点;不做"复刻 Obsidian 生态"的承诺。 |

## v1 功能边界(明确不做,防 scope creep)

v1 = F-VAULT + F-EDITOR + F-WIKILINK + F-FILETREE + F-SEARCH + **F-GRAPH** + **F-QUERY** + F-TYPE + F-PROPERTIES + F-STATUS + F-PALETTE + F-TABS + 深色主题。其余全 v2+。

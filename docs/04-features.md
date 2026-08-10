# 04 — 功能规格

## 优先级

- **P0** — v1 必须。没有它,v1 不成立。
- **P1** — v1 尽力。有它 v1 才"好用"。
- **P2** — 后期阶段(成熟度打磨)。
- **P3** — 远期(高级能力探索)。

---

## 两大差异化(Obsidian 靠插件拼、本项目做成原生:存在的理由)

### F-GRAPH 图谱可视化 [P0] ✅ 主路径已落地(含多布局 · Cytoscape)

**一句话**:把整个 vault 的 wikilink + frontmatter 关系画成一张可交互的关系图。

- **数据来源**:`core::graph` 产出的统一关系图(正文 wikilink + frontmatter 关系,见 [03-data-model](./03-data-model.md))。
- **节点** = note;**边** = link,按 `EdgeKind`(Wiki / Relation)区分。悬空链接为 ghost/unresolved 桩。
- **渲染**:**Cytoscape.js**(懒加载 `CytoscapeLayer`)。力导向模式用内置 **cose** 布局;type 层 / 时间轴为 **preset** 坐标(`graph-modes`)。样式/簇色/环态在 `graph-style` / `graph-cluster`(纯逻辑可测)。大图 **top-K 按度数截断**(约 2000)。**已退役**:sigma/graphology WebGL、Worker FR、Barnes-Hut、LOD 网格簇、SVG 主路径。
- **交互** ✅:点击跳转、缩放/平移、拖拽节点 + 自动 pin、Shift 框选、悬停邻域高亮、右键(聚焦 1 跳 / pin / 复制 `[[wikilink]]` / 隐藏类型)、N 跳邻域聚焦。
- **过滤** ✅:type / tag / status / 关系种类 / 隐藏孤儿 / 隐藏 unresolved / 文本 query / 深度 hops。
- **实时**:LiveVault 路径级 delta + watcher;`structureSignature` 结构 gate;坐标可落盘(`.openobsidian/graph-layout.json`,默认 gitignore)。
- **布局**:
  - ✅ 力导向(默认,cose + 力参数滑条)。
  - ✅ **按 type 分层**(B-GRAPH-LAYER)。
  - ✅ **按时间轴**(created/modified)(B-GRAPH-TIME)。
  - ✅ 布局模式切换 UI(B-GRAPH-LAYOUT-UI)。
- **健康面(部分,见 [12](./12-graph-and-agent-roadmap.md) §I)**:Orphans/Hubs 列表、最短路径等;MCP `links` 等继续深化。

> UI 蓝本:Obsidian 交互心智 + 公开参考产品语义(概念 only)。实现独立编写。总表 [backlog §I](./backlog.md)。

### F-QUERY 聚合查询引擎 [P0] 🔄 引擎保留 / 用户面已删(2026-08-02)

**一句话**:内置声明式查询引擎,从全 vault 的 frontmatter/body 取数。**用户面已删,引擎保留待 agent。**

> **2026-08-02 决策**:不让用户学一门新 DSL——QQL 的认知负担是「语法 + 字段名 + 字面值 + render 动词」四层叠加,门槛过高。故**删除全部用户面**,**保留引擎**作为 agent 的编译目标,等 [6B](./12-graph-and-agent-roadmap.md) 接 agent 时用**自然语言**重建表面。

- **保留(引擎 B)**——勿删:
  - Rust core:`qql::parse`(文本→AST)+ `query::eval`(求值),全在纯内核。
  - MCP 工具 `run_qql`(agent 可直接调,见 `mcp/`)——**外部 agent 现在就能 NL→QQL 验证**。
  - app Tauri 命令 `run_qql`(未来 in-app NL 表面可直连;目前 UI 不再调用)。
- **查询语言(QQL)**——DQL 风格子集,关键字 `WHERE` / `SORT` / `SHOW` / `LIMIT` / `GROUP BY` / `RENDER`;谓词 `=/!=/AND/OR/NOT/CONTAINS/STARTSWITH/ENDSWITH/IN`;输出 `List` / `Table` / `Count` / `Groups` / `Sum` / `Histogram`。**不**追求 Dataview 全语法逐字兼容。
- **已删(用户面 A)**:内联 ```qql 块 widget + `resultToHtml`、saved query(`saved-query.ts` + `type: Query`)、`QueryPanel`、Query 视图、`MainView:"query"`、nav-selection `kind:"query"`、CenterToolbar 查询按钮、palette/registry 查询命令、**TS 全量重写** `ui/src/lib/qql/*` 与 `mock-qql`、相关 i18n 键。
- **下一步(6B)**:NL → agent 生成**可审查** QQL → `run_qql`;用户可编辑/存为查询。QQL 长期定位 = **IR(中间表示)**,不再直接面向用户。
- **与 cairn**:Health KPI 未来由 agent 经 `run_qql` 生成维护,而非用户手写 live QQL——见 [07-llm-wiki-architecture](./07-llm-wiki-architecture.md)。

---

## 软类型系统

### F-TYPE 软类型 [P0] ✅ 主路径 + 类型文档提示

- `type:` 是 `Option<String>`,任意值,**永不校验、永不阻止保存、永不报错**(底线,不因类型文档改变)。
- 缺失 → 默认 `Note`。app 据 type 分组/着色。
- **类型文档(type document)** ✅(B-TYPE-DOC):`types/{Type}.md` 或 `type: TypeDoc`;Inspector「类型说明」**仅 UI 提示**,不构成 schema 约束。
- 约定键(`status`/`tags`/`created`)识别即富行为,但全可忽略。

---

## Obsidian 对等能力

> UI 蓝本参考 Obsidian 公开交互。以自己的实现重写。

| ID | 功能 | 级别 | 状态 | 说明 |
|---|---|---|---|---|
| F-EDITOR | 编辑器 | P0 | ✅ | 双模+格式条/右键/查找替换/大纲/附件/并排 ✅;WYSIWYG 格式条+断链提示 ✅;保真双层门禁(app+真 BN 引擎)+ 23 例往返扫描 ✅。后置:Live Preview、raw HTML(表+行内)保真、GFM 字节身份([plan §Editor](./plan.md))。 |
| F-VAULT | vault 管理 | P0 | ✅ | 打开/切换;LiveVault 增量索引。 |
| F-WIKILINK | wikilink + 反向链接 | P0 | ✅ | 解析、补全、点击跳转;反向链接实时。 |
| F-FILETREE | 文件浏览 | P0 | ✅ | Nav+列表+拖拽+右键。 |
| F-SEARCH | 全文/查找 | P0 | ✅ | ⌘F 文内;⌘P 快开;⌘⇧F 库内全文([10](./10-menus-and-search.md))。 |
| F-PROPERTIES | 属性面板 | P1 | ✅ | frontmatter 可视化;类型说明提示。 |
| F-STATUS | status chip | P1 | ✅ | chip + 列表右键切状态。 |
| F-TAGS | 标签 | P1 | ✅ | 解析 + Nav TAGS。 |
| F-PALETTE | 命令面板 | P1 | ✅ | ⌘K/⌘P/⌘⇧F 三 mode;注册表同源([10](./10-menus-and-search.md))。 |
| F-TABS | 多标签 | P1 | ✅ | 开/关/循环/拖拽+右键。 |
| F-TEMPLATES | 模板 | P2 | ✅ | |
| F-THEMES | 主题 | P2 | ✅ | 深/浅;Settings 面板 ✅。 |
| F-GIT | git 集成 | P2 | ✅ | commit/log/pull/push/归档。 |
| F-TRASH | ~~回收站~~ | P2 | ➡️ | 归档并入 git。 |
| F-AI | AI + MCP | P2 | 🟡 | 读侧 ✅;MCP v1 六工具(list/read/write/search/qql/**vault_info**) ✅;图工具化见 Phase **6B**([12](./12-graph-and-agent-roadmap.md))。 |
| F-AGENT | 应用内 Agent 侧栏(ACP 托管) | P2 | ✅ | Phase 7(2026-08-04 完工):picker/流式对话/权限三档/Model C 移交/SQLite 转录/git 归因面板;见 [11](./11-in-app-agent-roadmap.md)。真机端到端待用户验收。 |
| F-L10N | 国际化 | P2 | ✅ | zh/en。 |
| F-CANVAS | 画布 | P3 | ✅ | Excalidraw MIT。**孤立白板**:与图谱/QQL/wikilink/搜索完全解耦(不进 `build_index`);「新建」入口默认隐藏,底层保留(已有 `.canvas` 仍可编辑)。详见 [research/canvas-isolation](./research/canvas-isolation.md)。 |
| F-SHEET | 表格 | P3 | ✅ | v2:多表/冻结/图表/md 嵌入/SUM+IronCalc;⛔ 不做 xlsx 全量/实时协作。 |
| F-PLUGIN | 插件 | P3 | ⛔ | v1 宿主保留;**产品不做深化**。 |
| F-APP-MENU | 系统菜单栏 | P2 | ✅ | File/Edit/View 与命令注册表对齐(B-APP-MENU-V2)。 |

## 范围说明

**已交付核心**:vault / 双模编辑 / wikilink / 列表+标签 / **图谱**(Cytoscape + 多布局) / **QQL IR**(Rust + MCP,用户面 UI 已撤) / 类型文档 / git / 画布(孤立白板,入口隐藏)/ 表格 / L10N / live 索引 / 命令注册表+三层搜索 等。

**原 v1 边界 §A** ✅ · **§C 编辑器 / §D 菜单 / §H 命令搜索** ✅ · **大件 v1** ✅(插件深化 ⛔)。

**当前仍开放 / 值得做**(非「功能空白」):

1. **发布收口**:feat/phase1-core 已合 main(`84accb0`);`release/v0.1.0` 进行中;签名 / Updater 凭证门  
2. **真机验收**:图谱 1k/5k 帧率(B-GRAPH-FPS);应用内 Agent 端到端(需本机 opencode / claude-code)  
3. **写作体验**:§C 主路径与保真门禁已收敛;可选微体验见 [plan §Editor](./plan.md)  
4. **远期**:§I 人侧(6A 图 polish + B-GRAPH-HEALTH-UI)与 6C 语义(6B MCP 侧 / 6D wiki 脚手架已交付)  

完整 ID 表 → [backlog.md](./backlog.md)。

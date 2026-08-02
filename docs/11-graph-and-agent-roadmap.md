# 11 — 图谱打磨 → Agent 结合（下一阶段规划）

> **状态**:产品已拍板（2026-08-01）。**先优化图，再把 AI agent 结合进去。**  
> **阶段命名（全库统一）**:**Phase 6** 下分子阶段 **6A / 6B / 6C / 6D**（与 [06-roadmap](./06-roadmap.md)、[backlog §I](./backlog.md)、[open-questions P6-*](./open-questions.md) 一致）。下文 **不再**单独使用无前缀的 A/B/C/D 作阶段名。  
> **参考（概念 / 产品语义 only，零代码复制）**:
>
> | 项目 | 许可 | 我们借什么 | 不借什么 |
> |---|---|---|---|
> | [varshithm7x/OpenObsidian](https://github.com/varshithm7x/OpenObsidian) | MIT | 图 UX 手感：可调力参数、布局落盘、标签阈值、hide unresolved、Obsidian 式 dimming 心智 | 不换成 D3/Canvas2D；不拷实现 |
> | [inkeep/open-knowledge](https://github.com/inkeep/open-knowledge) | **GPL-3.0** | Agent 面：`links` 工具语义、读时图 briefing、写时断链反馈、Orphans/Hubs UI、Karpathy LLM wiki 脚手架 | **禁止拷任何源码/依赖**；不跟 TipTap/Yjs 主栈 |
>
> **我们的最优解**（合成两条参考线 + 自有内核）:
>
> ```text
> 保留: sigma WebGL + Worker FR/BH/LOD + graph-filter + 多布局 + QQL + MIT + Rust IO-free core
> 6A: 图可调 / 可记住 / 可审计入口（人）
> 6B: 图健康 + MCP 图工具化（agent）
> 6D: LLM wiki 脚手架 + QQL Health 看板
> 6C: 语义建议边（可选 AI 发现层 · 后置）
> ```
>
> 实现一律 **TDD：纯逻辑先行 + 单测**；MCP/UI 薄壳后接。合 main / 签名等工程项仍见 [backlog §F](./backlog.md)。

---

## 0. 为何这样切 · 实现顺序

| 优先级 | 理由 |
|---|---|
| **先图（6A）** | 差异化 #1 已强在引擎，弱在「像 Obsidian 一样好调、好记住」；人侧体验立刻可感，且不阻塞 agent |
| **后 Agent（6B）** | `openobs-mcp` v1 已有 6 tools（见下）；缺的是 **图健康 API + 读/写闭环**——inkeep 验证过这是 agent-native 的关键 |
| **再 wiki（6D）** | 方法论脚手架 + 与 Health 文档交叉；引擎能力多已有 |
| **语义更后（6C）** | 依赖 embedding 策略；且 **core `EdgeKind` schema 变更**（见 §4）；显式链接健康零模型即可先做 |
| **QQL 保留** | 两参考项目都没有等价物；Health 层继续用 QQL，不把向量当主索引 |

**默认顺序:6A → 6B → 6D → 6C**（语义层可跳过）。若只做一刀 agent 向：**6B** 杠杆最大。  
单次会话原则：优先 **6A1–6A4 或 6B1–6B4 一整条竖切**，不平行半截 6C/6D。

**MCP v1 工具清单（6 个，勿漏）**:`list_notes` · `read_note` · `write_note` · `search_notes` · `run_qql` · **`vault_info`**。

> **NL→QQL(6B 重点,2026-08-02 定)**:QQL 的**用户面已删**(见 [04](./04-features.md) F-QUERY),引擎 + `run_qql` 保留作 agent 编译目标。6B 交付**自然语言查询表面**:NL → agent 生成**可审查** QQL → `run_qql`;用户可编辑、可存为查询。QQL 长期定位 = IR,不直接面向用户。**外部 agent 现在就能经 MCP `run_qql` 跑 NL→QQL 验证**(零 UI 成本),建议 6B 开工前先用它确认生成质量。

**架构红线不变**:

- `core` 纯函数、无 IO；图算法 / QQL 可测。
- 渲染主路径继续 **sigma WebGL**（不回退 Canvas2D 作主引擎）。
- GPL 项目只借鉴 **工具面与工作流语义**；实现自写。
- 不做：xlsx 全量、live collab、Obsidian 插件兼容深化、默认向量库 RAG。

---

## 1. 四子阶段总览

| 阶段 | 主题 | 主要产出 | 难度 | 依赖 |
|---|---|---|---|---|
| **6A** | 图 UX 完整度 | 坐标**落盘**、力参数 UI、设置分组、hide unresolved | 🟡 | 现有 GraphView + 内存暖启动 |
| **6B** | 图健康 + MCP + **NL 查询** | `links` 工具、读 briefing、写 broken_links、Orphans/Hubs UI、**NL→QQL 用户表面** | 🔴 | 与 6A 可选并行；core graph |
| **6D** | Wiki 脚手架 | starter vault、provisional→canonical 约定、QQL Health **模板** | 🟢–🟡 | 6B 的 links/health 更顺；可先写文档 |
| **6C** | 语义边 v1 | **`EdgeKind::Semantic` core 变更**、阈值/top-k、建议链接、洞察 | 🔴 | embedding 拍板 + **core schema 评审** |

真机帧率 **B-GRAPH-FPS** 可与 6A 并行。

---

## 2. Phase 6A — 传统图 polish（人）

> 对标 varshithm7x manual graph 的**可调 / 持久 / 设置面板**；引擎仍是我们的。

### 6A1 布局坐标持久化 — `B-GRAPH-POS-PERSIST`

- **已有（勿重复建设）**:会话内 **位置 Map 跨帧持久 + 暖启动**（Phase 5+ 续四 / F-GRAPH）：增量播种、过滤/索引刷新时已有节点不乱跳。见 [06-roadmap](./06-roadmap.md)、[04-features](./04-features.md)。
- **本项范围（仅在此之上加）**:
  1. **磁盘序列化 / 反序列化**（跨进程、跨会话）
  2. **path-stable 键**（与 `graph-model` 一致；过滤变更只恢复仍可见节点）
  3. merge / drop-orphan keys 纯函数
- **集成风险**:落盘恢复必须与现有暖启动、top-K 截断、结构签名 gate **同一套坐标源**，避免双写抖动。
- **存储约定（新）**:vault 内 **`.openobsidian/graph-layout.json`**——本库此前无统一 per-vault 配置目录（`.trash/` 已废、由 git 取代）；**本项建立该约定**，localStorage 仅无 vault / mock 回退。
- **Git 策略**:见 [open-questions P6-4 / P6-7](./open-questions.md)。**【默认】文件可进 vault，但默认 gitignore（或写入不触发结构自动 commit）**——避免每次拖拽/reheat 污染 log；用户可手动 un-ignore 共享布局。
- **测试**:serialize/merge/drop-orphan；与暖启动合并语义单测；mock vault 往返。

### 6A2 力参数 + Recalculate — `B-GRAPH-FORCES`

- **滑条**:center / repel / link strength / link distance（默认贴近 Obsidian 心智，数值自定，不抄对方常数表）。
- **动作**:Recalculate（reheat）/ Reset defaults。
- **实现**:`graph-layout` 参数化；Worker 消息带 forces；settings 可进 app settings 或图内面板。
- **测试**:参数边界、reheat 后位置有限变化不变量。

### 6A3 设置面板信息架构 — `B-GRAPH-SETTINGS-UI`

- 分组折叠：**Filters / Display / Text / Forces**（文案 i18n）。
- 标签：show labels + **zoom threshold**（与现有 `graph-label` 避让合并策略）。
- 可选：节点/边基础色（主题 token 优先，避免过度调色板）。

### 6A4 隐藏未解析链接 — `B-GRAPH-HIDE-UNRESOLVED`

- Toggle：**Existing files only / hide phantom**（对现有 ghost 边一键隐藏）。
- 测试：filter 纯逻辑扩展 + GraphView 接线。

### 6A5（可选）最短路径高亮 — `B-GRAPH-PATH`

- 选两节点 → BFS 路径高亮 + 邻域压暗。
- **不与 6B `links` 共用算法**：`links` 的 dead/orphans/hubs 是度数/未解析目标，**不需要**单源最短路。  
  若有算法复用，更接近 **6C 洞察（中心性 / 路径）**；6A5 可独立实现 BFS，勿硬绑 6B。

### Phase 6A 验收

- [ ] 关应用再开，拖过的布局基本复现（**磁盘层**，非仅同会话暖启动）  
- [ ] 调 force 有可见响应；Reset 回到默认  
- [ ] hide unresolved 后 ghost 消失  
- [ ] vitest：layout persist（落盘语义）/ forces / filter 扩展全绿  
- [ ] 拖拽不触发无意义的结构自动 commit 风暴（符合 P6-7 默认）  

---

## 3. Phase 6B — 图健康 + Agent 面

> 对标 inkeep 的 **`links` MCP + 读时 briefing + 写时反馈 + Orphans/Hubs UI**；全部自写，GPL 零依赖。

### 6B1 MCP `links` — `B-MCP-LINKS`

扩展 `openobs-mcp`（stdio，复用 core）:

| kind | 语义 |
|---|---|
| `backlinks` | 指向 document 的入边 |
| `forward` | document 出边 |
| `dead` | 悬空目标（corpus 或 scoped） |
| `orphans` | 无连笔记；`mode`: incoming \| outgoing \| both |
| `hubs` | 高度数页；`limit` |
| `suggest` | （可二期，P6-6）正文提及未链化；v1 可 stub 或极简 title match |

- 支持 `kind` 数组一次 audit：`["dead","orphans","hubs"]`。
- 输出 JSON 稳定 schema；单测用固定 vault fixture。
- **不需要** BFS/最短路径。

### 6B2 读时 briefing — `B-MCP-READ-BRIEF`

- `read_note`（及 list 的可选 enrich）返回：body + frontmatter + **in/out 边摘要** + orphan/hub 标志。
- Agent 少一轮工具往返；人类侧 Inspector 可复用同一摘要结构（可选，无独立 ID 时可挂本项或 6B4）。

### 6B3 写时反馈 — `B-MCP-WRITE-FEEDBACK`（**范围：MCP 契约**）

- **`write_note`（及未来 edit）MCP 响应**：返回 `broken_links[]`；新文档可标 `orphan_hint`。
- 不阻断保存（软类型原则一致：提示不强制）。
- **App 编辑器写路径的断链提示**：**不在本 ID 内**。若产品要做，另开 **`B-ED-BROKEN-LINKS`**（可选，见 backlog）；实现时可复用与 MCP 相同的纯函数检测。

### 6B4 图 UI：Orphans / Hubs 模式 — `B-GRAPH-HEALTH-UI`

- GraphView 或侧栏模式：**Explore | Orphans | Hubs**（inkeep 心智，UI 自绘）。
- 列表点击 → 图上 focus + 打开笔记。
- 数据：core/UI 纯函数派生（与 MCP 共用逻辑优先放 core 或 `ui/src/lib/graph-health.ts`）。

### 6B5 MCP 配置样例 — `B-MCP-CONFIG`

- `docs/` 或 `mcp/README`：Claude Desktop / Cursor 配置片段；`OPENOBS_VAULT` 说明。  
- **不做** inkeep 式 skills marketplace / 全 harness 注入 CLI。

### Phase 6B 验收

- [ ] agent 用 `links(["dead","orphans","hubs"])` 一次拿到图健康摘要  
- [ ] `read_note` 含邻接；`write_note` 响应含 `broken_links`  
- [ ] UI Orphans/Hubs 可操作  
- [ ] `cargo test -p openobs-core` + mcp 集成测 + UI 相关 vitest  

---

## 4. Phase 6C — 语义发现层（可选，后置）

> 对标 varshithm7x **AI Knowledge Graph 产品语义**：建议边、跨社区枢纽、孤岛——**不**强制上 Transformers.js。  
> **本路线第一个动 core 数据模型的阶段**——难度 🔴 主因在 schema 级联，不只是 UI。

### 6C1 管道与策略 — `B-GRAPH-SEMANTIC`（需 open-questions 拍板）

- embedding：可选外部 / 本地 / 先 mock 向量测 UI（**P6-5**）。
- **前置 · core schema 变更评审**（必做，不可跳过；登记于 [P6-8](./open-questions.md)）:
  - 今日 `EdgeKind` 仅 **`Wiki` | `Relation`**（`core` graph + 序列化 + 反向链接）。
  - 引入 **`Semantic`**（或等价）会级联：
    - `graph.rs` 枚举与构建  
    - IPC / 快照序列化契约  
    - `graph-filter` 按 kind 过滤  
    - 渲染（虚线 / 与 ghost 区分）  
    - QQL 是否可按边 kind 过滤  
    - MCP `links` / briefing 是否暴露 semantic  
  - **替代方案（评审时可选）**:semantic 边只存在前端/缓存层、不进 core 统一图——降低 schema 风险，但失去 QQL/MCP 一等公民。默认倾向进 core，**开 6C 前书面选一种**。
- 参数：similarity threshold、max edges/node、max nodes（数量级可参考公开产品默认，自定）。

### 6C2 建议链接 UX — `B-GRAPH-SUGGEST-UI`

- 列表：Suggested links · Accept（写入 `[[wikilink]]`）· Dismiss（持久化）。
- 独立视图或图上图层，**不污染**默认显式图过滤。

### 6C3 跨社区枢纽 / 孤岛洞察 — `B-GRAPH-INSIGHTS`

- **术语（避免图论混用）**:
  - **Hub-across-clusters**（文案可称「桥接笔记」）：连接多个社区/簇的**节点**——**不是**图论 edge-bridge（删边则断连通的边）。
  - **Island**：内部密、外部疏的笔记群（弱割 / 小社区）。
- **算法重量**:真·社区结构通常需要连通分量阈值、Louvain 类聚类或介数中心度；**重于**简单度数 hubs。难度 **🔴 偏**（原 🟡 偏低）；v1 可先用「强相似边连通分量 + 跨分量度数」近似，并在单测中锁近似定义。
- 侧栏 focus cards；算法纯函数 + 单测；**可与 6A5 路径可视化组合，但不依赖 6B links**。

### Phase 6C 验收（若做）

- [ ] core/前端契约评审结论已写入 PR / open-questions  
- [ ] 语义边可开关；Accept 落盘为真实 wikilink  
- [ ] 无 embedding 时 mock 路径仍可演示 UI  
- [ ] 许可：仅自写 + 合法 embedding 依赖登记 THIRD_PARTY  

---

## 5. Phase 6D — LLM Wiki 工作流

> 对标 inkeep/Karpathy：**结构即索引** + 晋升仪式；对齐 [07-llm-wiki-architecture](./07-llm-wiki-architecture.md)。

### 6D1 Starter vault — `B-WIKI-STARTER`

```text
sources/          # 约定目录：immutable 剪藏（非语义引擎）
research/         # 约定目录：草稿区
articles/         # 约定目录：成稿区
log.md            # append-only
```

- **状态真相唯一**:frontmatter **`status: provisional | canonical | …`**（及可选 `sources[]` / `supersedes`）。  
  文件夹**只作约定布局**，不承载语义——与 [07 §6.4 软类型不靠文件夹](./07-llm-wiki-architecture.md) 一致；QQL / 过滤只认 `status`，不认路径前缀。
- 模板 frontmatter 约定文档化，软校验（永不阻止保存）。
- 可选 `templates/` 已有能力复用。

### 6D2 QQL Health 看板 — `B-WIKI-HEALTH-QQL`

- **引擎已有**（07「Health 即查询」）：本项交付是 **saved-query 模板 + 文档示例**，不是新求值器。
- 示例：orphans 近似、dead 需图侧或 6B、按 type 分布、provisional 积压。
- 与 6B graph-health **互补**（QQL 结构化字段 vs 图拓扑）。
- 难度 **🟢**（模板 + 文档为主）。

### 6D3 Agent 使用说明 — `B-WIKI-AGENT-DOC`

- vault 级短文：如何 ingest / research / consolidate（流程说明，非 GPL skills 移植）。
- 指向 MCP tools 列表（含 `vault_info` 与 6B 新增）。

### Phase 6D 验收

- [ ] 新用户可一键/一文档得到脚手架  
- [ ] QQL 示例可跑出 Health 指标；文档写明 status 为真相  
- [ ] 与 6B MCP 文档交叉链接  

---

## 6. Backlog ID 速查

| ID | 阶段 | 项 |
|---|---|---|
| B-GRAPH-POS-PERSIST | 6A | 坐标**落盘**（内存暖启动已有） |
| B-GRAPH-FORCES | 6A | 力参数 + Recalculate |
| B-GRAPH-SETTINGS-UI | 6A | Filters/Display/Text/Forces 面板 |
| B-GRAPH-HIDE-UNRESOLVED | 6A | 隐藏悬空/phantom |
| B-GRAPH-PATH | 6A 可选 | 最短路径高亮 |
| B-MCP-LINKS | 6B | MCP links 多 kind |
| B-MCP-READ-BRIEF | 6B | read 附带图上下文 |
| B-MCP-WRITE-FEEDBACK | 6B | **MCP** write 返回 broken_links |
| B-GRAPH-HEALTH-UI | 6B | Orphans / Hubs UI |
| B-MCP-CONFIG | 6B | 客户端配置样例 |
| B-ED-BROKEN-LINKS | 可选 | App 写路径断链提示（非 6B3 默认） |
| B-GRAPH-SEMANTIC | 6C | 语义边管道 + **core EdgeKind 评审** |
| B-GRAPH-SUGGEST-UI | 6C | 建议链接 Accept/Dismiss |
| B-GRAPH-INSIGHTS | 6C | 跨社区枢纽 / 孤岛（非 edge-bridge） |
| B-WIKI-STARTER | 6D | LLM wiki 脚手架 |
| B-WIKI-HEALTH-QQL | 6D | Health **模板**（引擎已有） |
| B-WIKI-AGENT-DOC | 6D | Agent 流程说明 |

既有 **B-GRAPH-FPS**（真机帧率）保留，可与 6A 并行。

---

## 7. 测试策略

| 层 | 6A | 6B | 6C / 6D |
|---|---|---|---|
| 纯逻辑 | 落盘 merge/暖启动合流、forces、filter hide | graph-health 派生、links 序列化、broken_links 检测 | semantic 构图；wiki **frontmatter status** 约定 |
| core | 通常不必 | orphans/hubs/dead 若下沉 | **EdgeKind 扩展 + 契约测**（6C） |
| mcp | — | fixture vault 集成（6 tools + links） | — |
| ui vitest | Graph 设置 / 落盘恢复 | Health 面板 | Suggest UI；starter 可选 |
| e2e | 可选 | 可选打开 Orphans | — |

---

## 8. 与其它文档

| 文档 | 关系 |
|---|---|
| **本文 11** | 下一阶段主规划（图 → agent）；阶段名 **6A–6D** |
| [backlog.md](./backlog.md) | ID 与状态总表（§I） |
| [06-roadmap.md](./06-roadmap.md) | Phase 6 叙事 |
| [04-features.md](./04-features.md) | F-GRAPH / F-AI |
| [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) | LLM Wiki 五层；6D 对齐 status 真相 |
| [deferred.md](./deferred.md) | 难点与不做项 |
| [open-questions.md](./open-questions.md) | P6-4 路径 · **P6-7 git** · P6-5 embedding · **P6-8 schema 评审** |

---

## 9. 明确不做（本路线内）

- 引入 GPL 代码或 `@inkeep/*` 依赖  
- 替换图谱引擎为 D3 / react-force-graph 主路径  
- 默认云端向量库 / Spaces / Supabase  
- Obsidian 插件 API 兼容深化  
- 实时多人 CRDT 协作  
- XLSX 全量互通  
- Skills marketplace / 全 harness 一键注入（最多文档级配置样例）  
- 用文件夹路径替代 `status` 做生命周期真相  

---

## 修订记录

| 日期 | 说明 |
|---|---|
| 2026-08-01 | 初版：合成 varshithm7x 图 UX + inkeep agent 面；先图后 agent |
| 2026-08-01 | **审阅修订**:统一 6A–6D 命名；A1=落盘 atop 暖启动；P6-7 gitignore 默认；6C EdgeKind 级联与术语；6A5 不绑 links；MCP 6 tools；6B3 仅 MCP；6D status 唯一真相；6D2 🟢 |

# 调研报告: VectifyAI/OpenKB — 编译式知识库与 Skill 工厂

> **性质**:调研文档。**只陈述、不拍板**——是否借鉴、如何借鉴仍由人决策。
> 调研日期:2026-08-10 · 来源:[VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB) · 版本:master @ 2026-08-10 · 许可:Apache-2.0 · 规模:★ ~3.4k / Fork 362 · 语言:Python 3.10+ · 状态:Alpha
> 证据持久化:本次调研为单次 WebFetch + zread 直读 README / AGENTS.md / docs/golden-principles.md / pyproject.toml / openkb/{cli,agent/compiler,indexer,schema,config,skill/generator,agent/query,visualize}.py，未落地独立 evidence.jsonl；关键断言均可由上述文件复核。
> 上游关联:[agent-memory-survey.md](./agent-memory-survey.md) §4.1/§4.2/§6.4/§7.2、[semantic-retrieval.md](./semantic-retrieval.md) §6.4、[../07-llm-wiki-architecture.md](../07-llm-wiki-architecture.md)、[../14-llm-wiki-workflow.md](../14-llm-wiki-workflow.md)、[../15-owf-format.md](../15-owf-format.md)、[../open-questions.md](../open-questions.md) P6-5

---

## 1. TL;DR

1. **定位**:`pip install openkb` 的 CLI 编译器——把 PDF/Word/PPT/Excel/HTML/MD/URL 等原始材料**一次性编译**为持久化的、带交叉引用的 Wiki（`wiki/` 纯 Markdown + `[[wikilink]]`），知识随文档增长复利累积。思想源头为 Andrej Karpathy 的 LLM Wiki 概念，OpenKB 将其产品化并补齐了长文与分发两块短板。
2. **为何不是传统 RAG**:RAG 每次 query 从零检索散落 chunks、知识不沉淀；OpenKB 在 `add` 时即由 LLM 完成跨文档综合、去重、补链，query 只读成品。Wiki 是资产，检索是消费。
3. **差异化壁垒是 PageIndex**:长 PDF（≥20 页）不切块、不建向量库，而以**树索引**（tree index）让 LLM 推理式检索——短文走 `markitdown` 全文读，长文走 `PageIndex` 树 + 按需窄页拉取（`get_page_content(doc, "3-5")`）。
4. **双层架构**:Layer 1 Wiki Foundation（`init/add/remove/recompile/lint/watch/list/status` 编译与维护）+ Layer 2 Generators（`query/chat/skill/deck/visualize` 消费 Wiki 产出价值）。
5. **旗舰产出是 Skill Factory**:`openkb skill new <name> "<intent>"` 把 Wiki 蒸馏为可分发的 Anthropic `SKILL.md`（Claude Code / Codex / Gemini CLI 原生可装），“丢进一本书，产出一个数字专家”。Deck（单文件 HTML 演示）与 Visualize（自包含知识图谱）复用同一 `Generator` 抽象。
6. **工程亮点**:`openkb/locks.py` + `openkb/mutation.py`（staging + snapshot + `track_new()` 精确 blob 追踪）的 crash-safe 原子写入；`openkb/config.py` 集中的 `entity_types/extra_headers/timeout/litellm:*` 校验与进程级注入；AGPL 洁癖之外的 **精确 pin 依赖**（供应链安全）；`<800 行` 模块纪律（`tests/test_file_size.py` 门）。
7. **代价**:每新增一文档触发 N+M 次 LLM 调用（summary + concepts plan + 并发重写多页），冷启动成本高；概念抽取/去重/交叉链接全靠 prompt，漂移需 `lint --fix` 修；长文仅支持 PDF，非 PDF 长文、嵌套目录、海量库分层索引、DB 引擎均在 roadmap 未实现。
8. **对 OpenObsidian 的启示**:OpenObsidian 的 Tauri 薄壳 + Rust core（解析/图谱/QQL，IO-free）+ React 前端与 OpenKB 的 CLI 编译器**互补而非竞争**。可借鉴项集中在契约与健壮性（OKF frontmatter、实体抽取、增量物化思想、原子写入），**不建议**将 `pageindex/litellm/openai-agents` 重依赖引入 `core`。

---

## 2. 项目定位与价值主张

### 2.1 一句话

> **Drop in a book; out comes a digital expert.** —— `openkb skill new` 的标语即产品定位。

OpenKB 的 README 首屏四标签即价值主张:**Scale to long documents · Reasoning-based retrieval · Native multi-modality · No Vector DB**。

### 2.2 Why not RAG（与 [agent-memory-survey.md §4.2](./agent-memory-survey.md) 的互文）

| 维度 | 传统 RAG | OpenKB |
|---|---|---|
| 知识形态 | 每次检索散落 chunks | 编译后的 `summaries + concepts + entities` 结构化 Wiki |
| 跨文档综合 | 查询时临时拼凑 | `add` 时即完成跨文档 synthesis、去重、补交叉链接 |
| 长期记忆 | 无累积 | `index.md + log.md` 自动维护，概念页随新文档增量更新 |
| 长文档 | 切块/向量易失真、context rot | PageIndex 树索引，LLM 推理式检索 |
| 产出 | 只有答案 | 答案 + 可复用 Skill / Deck / 图谱 |
| 兼容性 | 私有向量库 | 纯 `.md + [[wikilink]]`，原生进 Obsidian Graph View，遵循 Google OKF |

该表与 survey §4.2 “RAG 问这份文档说了什么、LLM Wiki 问我对这个主题知道什么”的三分法一致——OpenKB 选择站在第三类。

### 2.3 与 Karpathy 原式的差异（README 对照表）

| 能力 | Karpathy 原式 | OpenKB |
|---|---|---|
| 短文 | LLM 直读 | `markitdown` → LLM |
| 长文 | 受限于上下文 | PageIndex 树索引 |
| 输入源 | Web clipper → .md | PDF/Word/PPT/Excel/HTML/CSV/MD/URL 全覆盖 |
| Wiki 编译 | LLM agent | 同构，但自动抽实体 |
| 实体抽取 | 手动 | 自动（人/组织/地点/产品/作品/事件） |
| 问答 | 仅 Wiki | Wiki + PageIndex 窄页检索 |
| 产出 | 仅 Wiki | Wiki + Skill Factory + CLI 集成 |

---

## 3. 架构全览

### 3.1 逻辑分层

```
原始材料                              编译层                           生成层
PDF/Word/PPT/Excel/HTML/MD/URL ─┬─ markitdown(短) ─┐                 ┌─ query  (单次问答)
                                │                  ├─ LLM Agent ─────┼─ chat   (多轮+skill 感知)
                                └─ PageIndex(长) ─┘  (compiler·80)  ├─ skill new (Skill Factory)
                                                                    ├─ deck new  (HTML 演示)
                                                                    └─ visualize(交互图谱)

中间产物: wiki/ = sources/ + summaries/ + concepts/ + entities/ + explorations/ + index.md + log.md + AGENTS.md
持久化:  .openkb/ = config.yaml + hashes.json(去重) + pageindex.db + files/(PageIndex blob) + staging/
```

**双层设计是核心抽象**（README §Usage 即按此分节）:

- **Layer 1 Wiki Foundation** — 编译与维护（`init / add / list / status / watch / lint / remove / recompile / feedback`）
- **Layer 2 Generators** — 消费 Wiki 产生价值（`query / chat / skill / deck / visualize`）

`wiki/` 是唯一真相（plain Markdown + wikilink），生成器只读它——这与 OpenObsidian “文件即真相”的 vault 定位同构。

### 3.2 短 vs 长文档分流（`pageindex_threshold: 20`）

|  | 短文档 | 长文档（PDF ≥20 页） |
|---|---|---|
| 转换 | `markitdown` → Markdown | `PageIndex` → 树索引 + 摘要 |
| 图片 | `pymupdf` 内联抽取 | PageIndex 抽取 |
| LLM 读什么 | 全文 | 树结构 `tree` + 按需 `get_page_content(doc, "3-5")` |
| 落盘 | `wiki/sources/*.md` + `summaries/*.md` | `wiki/sources/*.json`（逐页）+ `summaries/*.md`（树渲染） |

长文链路解决 LLM “context rot”且**完全无向量库**——这是与 [semantic-retrieval.md](./semantic-retrieval.md) “默认关向量”立场的互证：wiki 的写入时综合本就降低对向量召回的依赖。

### 3.3 Wiki Schema（`openkb/schema.py`）

```
wiki/
├── AGENTS.md            # LLM 的 wiki 维护手册，可被用户自定义、运行时热读
├── index.md             # 全站目录: Documents | Concepts | Entities | Explorations
├── log.md               # append-only 操作日志
├── sources/             # 原文/MD 或 JSON 逐页内容 + sources/images/
├── summaries/           # 每文档一页，frontmatter: type, description, doc_type, full_text
├── concepts/            # 跨文档抽象概念，frontmatter: type=Concept, sources:[], description
├── entities/            # 具名实体（人/组织/地点/产品/作品/事件），type + aliases
├── explorations/        # query --save 落盘的分析
└── reports/             # lint 报告
```

Frontmatter 由代码统一管理（`openkb/frontmatter.py`），LLM 只产 body，避免格式漂移。符合 **Google Open Knowledge Format (OKF)** v0.2 映射（`type` 为唯一必填路由字段，`description` 即 `brief` 的新名），利于跨工具共享。该契约与 [15-owf-format.md](../15-owf-format.md) 的 `format: owf/1` 声明可互补——两者皆为 “vault 自描述” 而设。

`PAGE_CONTENT_DIRS = ("summaries","concepts","entities")` 为枚举真相源，`list/status/skill gate/visualize` 均以此为准。

### 3.4 持久化与去重

- `.openkb/config.yaml`: `model / language / pageindex_threshold / entity_types / extra_headers / timeout / litellm:*`
- `.openkb/hashes.json`: `HashRegistry` 文件哈希去重（`add` 时跳过已知哈希）
- `.openkb/pageindex.db` + `.openkb/files/`: PageIndex 的 SQLite + blob 存储（按 `doc_id` 追加写）
- `.openkb/staging/`: 转换期隔离目录，经 `publish_staged_tree` 原子发布

---

## 4. 关键管线剖析

### 4.1 编译管线 `openkb/agent/compiler.py`（最复杂模块，~800 行）

**五步流水 + 两级 Prompt Caching**:

```
Step1 构建 Base Context A = schema(AGENTS.md) + 文档全文/树
Step2 A → 生成 summary              (JSON: {description, content})
Step3 A + summary → concepts plan   (JSON: {concepts:{create,update,related}, entities:{create,update,related}})
Step4 并发 LLM 调用（A 已缓存）→ 生成新概念页 + 重写待更新概念/实体页
Step5 代码侧: 给 related 页追加 See also: [[summaries/doc]]，更新 index.md
```

- **缓存打点**:文档消息末 + summary assistant 消息末两级 `cache_control: ephemeral`（Anthropic 语义）。非 Anthropic 模型（尤其 Gemini）自动 `strip_cache_control`，避免 `400 CachedContent` 报错；`_accepts_cache_control` 按 provider 判定。
- **容错**:`json_repair` 修围栏/散文 JSON；`raise_on_truncation`（`finish_reason=="length"` 时告警并跳过落盘，防截断页污染）；`_filter_*` 系列对 LLM 返回的 `create/update/related` 做形状校验与丢弃告警。
- **实体类型可配**:prompt 中 `__ENTITY_TYPES__` 占位符运行时替换为 `resolve_entity_types(config)` 生效值（默认 `person/organization/place/product/work/event/other`，`other` 为 coercion fallback）。
- **一次 `add` 触达 10–15 个 wiki 页面**——单次成本高，但后续 query 极 cheap，这正是 survey §6.2 “固化才是杠杆”的工程体现。

### 4.2 索引层 `openkb/indexer.py`

- `IndexConfig(if_add_node_text/summary/description=True)` 构建树；`col.add(pdf)` 重试 3 次（TOC 随机性）。
- **本地模式**:pymupdf 兜底抽页 → `_normalize_page_content` 归一为 `{page, content, images}`。
- **云模式**（`PAGEINDEX_API_KEY`）:调 `get_page_content("1-N")` 分窗 1000 页拉取 OCR Markdown（`_CLOUD_PAGE_WINDOW=1000`，短窗即停，防树 page_count 低估截断）。
- `prepare_cloud_import`（仅读云、解名、不写盘）与 `import_cloud_document`（写盘）分离，使调用方可先快照 O(1) 路径再写盘，避免全量拷贝。
- **泄漏防护**:长文 `add` 的 blob 仅在成功返回后 `snapshot.track_new()` 注册；若后续编译失败，`except BaseException: col.delete_document(doc_id)` 清理孤儿 blob。

### 4.3 Query / Chat `openkb/agent/query.py` + `openkb/agent/chat.py`

- 栈:`openai-agents SDK + LiteLLM`（支持 OpenAI/Anthropic/Gemini/DeepSeek 等任意 LiteLLM provider），`ModelSettings(extra_headers, extra_args:{timeout})` 透传。
- **System Prompt** 注入 `AGENTS.md` + 七步搜索策略:读 `index.md` → `summaries/` → `concepts/`/`entities/` → 按 `summaries` 的 `full_text` 前向指针窄页取证（`get_page_content`）→ `get_image` 看图 → 综合作答。
- `MAX_TURNS=50`（query）/ `80`（skill），`parallel_tool_calls` 按阶段优化（检索扇出期开并行，写期串行）。
- **Chat 特化**（`build_chat_agent`）:在 query agent 上叠加 `write_file`（限 `wiki/explorations/**` + `output/**`）与**本地 Skill 发现**（扫 `skills/ + ~/.openkb/skills/ + ~/.claude/skills/`，经 `list_skills/read_skill` 工具暴露给模型），并在 system prompt 追加 skill 名录使模型默认走 skill 路径。
- **流式**:`Runner.run_streamed` + `RawResponsesStreamEvent(ResponseTextDeltaEvent)` + Rich Live（`_make_markdown` / `_make_rich_console`），`--raw` 保留源码。

### 4.4 Skill Factory `openkb/skill/*` + `openkb/deck/*` + `openkb/skill/generator.py`

- **Skill**:`openkb skill new <name> "<intent>"` → `skill-creator` agent（读 `openkb/prompts/skill_create.md`），工具集 `list_wiki_dir/read_wiki_file/get_page_content/get_image/query_wiki/write_skill_file/done`，产出 `output/skills/<name>/SKILL.md`，随后 `validate_skill` + `regenerate_marketplace` 生成 `marketplace.json`。`MAX_TURNS=80`，`validate_skill` 自动执行。
- **Deck**:复用同一 `Generator` 抽象（`target_type: "skill"|"deck"`），内部走 `run_deck_create`，支持 `--critique` 二次过 `openkb-html-critic` skill；主题 `openkb-deck-neon` / `openkb-deck-editorial` 随 wheel 打包（`pyproject.toml: force-include`）。
- **Skill 形态**即 Anthropic 标准的 `SKILL.md`，可被 Claude Code / Codex / Gemini CLI 原生加载（`skill_dir` 约定即协议）。OpenKB 自身亦通过 `skills/openkb/SKILL.md` 暴露只读 wiki 能力给外部 agent（`/plugin marketplace add VectifyAI/OpenKB`）。

### 4.5 可视化 `openkb/visualize.py` + `templates/graph.html`

`build_graph()` 扫 `PAGE_CONTENT_DIRS` 抽 `[[wikilink]]` 构有向图（去重、去自环，`_normalize_target` 归一），`render_html()` 注入 `__GRAPH_DATA__` 到单文件自包含 HTML（3D/思维导图/放射视图），输出 `output/visualize/graph.html`。与 OpenObsidian 的 `GraphView`（`force-graph` + d3-force）形成对照——两者皆为 wikilink 图，但 OpenKB 为**离线静态产物**，OpenObsidian 为**交互式实时视图**。

### 4.6 工程健壮性

- **原子写入**:`openkb/locks.py`（`portalocker` + `atomic_write_*`）+ `openkb/mutation.py`（`AddMutationPlan` + `publish_staged_tree` + `snapshot.track_new()`），支持 crash-safe 回滚；PageIndex blob 按 `doc_id` 精确追踪，避免误删。
- **配置**（`openkb/config.py`）:集中校验 `entity_types / extra_headers / timeout / litellm:*`，进程级 `set_extra_headers/set_timeout` 注入 LLM 调用；支持 `chatgpt/*` / `github_copilot/*` OAuth 无 key 模式；`global.yaml` 注册多 KB（`register_kb` + `GLOBAL_CONFIG_LOCK`）。
- **质量门**:`ruff + mypy(渐进)` + `pytest(54 个测试文件)`，`tests/test_file_size.py` 强制模块 <800 行（grandfather 仅 `cli.py`/`compiler.py`/`chat.py`）；`AGENTS.md` 定位为短地图，深度文档下沉 `docs/`。

---

## 5. CLI 与数据模型

### 5.1 命令全表

| 命令 | 作用 |
|---|---|
| `openkb init` | 交互式建库，写 `wiki/` 骨架 + `.openkb/config.yaml` + `.env` (0600) |
| `openkb add <file\|dir\|URL>` | 转换→索引→编译；目录递归、URL 自动判 PDF/HTML(trafilatura)；哈希去重跳过 |
| `openkb add --from-pageindex-cloud <doc_id>` | 云端已索引文档导入（无本地 PDF） |
| `openkb list / status / watch / lint / remove / recompile / feedback` | 管理与健康检查（`lint` 查 broken links/orphans/index sync；`remove` 清 PageIndex + 修 frontmatter `sources`） |
| `openkb query "q" [--save] [--raw]` | 问答，`--save` 落 `explorations/` |
| `openkb chat [--resume --list --delete]` | 交互式，持久化 session |
| `openkb skill new/validate/eval/history/rollback` | Skill Factory |
| `openkb deck new [--skill neon|editorial] [--critique]` | 幻灯片（单文件 HTML） |
| `openkb visualize` | 知识图谱（自包含 HTML） |

### 5.2 关键数据结构

- `openkb/state.py: HashRegistry` — `.openkb/hashes.json` 的去重注册表。
- `openkb/lint.py` — 结构健康检查（broken links / orphans / index sync）+ `strip_ghost_wikilinks`（`query --save` 时清幽灵链接）。
- `openkb/tree_renderer.py` — 长文 `tree` → `summaries/*.md` 的 Markdown 渲染。
- `openkb/watcher.py` — `watchdog` 监听 `raw/` 自动编译。

---

## 6. 技术栈

```
pageindex==0.3.0.dev1              # 核心检索（VectifyAI 自研）
markitdown[docx,pptx,xlsx,xls]==0.1.5  # 万能转 Markdown（Microsoft）
trafilatura==2.0.0                  # URL 正文抽取
litellm==1.87.2                     # 多 provider 网关（pin 精确版本防投毒）
openai-agents==0.17.3               # Agent 框架
click / watchdog / pyyaml / python-dotenv / json-repair / prompt_toolkit / rich / portalocker
```

依赖全部**精确 pin**（`pyproject.toml` 注释明示供应链安全考量，`litellm` 曾有投毒事件），升级需审计。`THIRD_PARTY_NOTICES` 登记义务与 OpenObsidian 同。

---

## 7. 优势 / 局限 / 风险

### 7.1 优势

- **思想领先**:把 RAG 从“检索”升维到“编译”，与 Obsidian 生态零摩擦（`wiki/` 直接当 vault 打开）。
- **长文能力**:PageIndex 树索引是差异化壁垒，比向量召回更稳，且无需向量库运维。
- **多模态原生**:图文表一起进 Wiki，`get_image` 工具链完整。
- **Agent 原生**:Skill Factory 让知识直接变可分发的专家 Skill，商业化路径清晰。
- **Agent-First 开发**:`AGENTS.md` 地图 + `golden-principles.md` 约束 + 小模块纪律，适合多 agent 协作（与本仓库 AGENTS.md 三层协作模型神似）。

### 7.2 局限

- **成本**:每新增一文档触发 N+M 次 LLM 调用（含并发重写），大库冷启动贵；Prompt caching 红利仅 Anthropic 系明显。
- **强依赖 LLM 质量**:概念抽取/去重/交叉链接全靠 prompt，漂移需 `lint --fix` 修；错误会扩散（一个源碰 10–15 页，错也扩散 10–15 页，呼应 survey §6.5 失败模式）。
- **覆盖面**:长文仅 PDF；非 PDF 长文、嵌套目录、海量库分层索引、DB 存储引擎均在 roadmap 未实现（README Roadmap 明示）。
- **规模天花板**:与 survey §6.4 阈值一致——wiki 路线甜蜜点在 <100–1000 篇，超限需切 RAG/分层索引。

### 7.3 风险

- **向量能力的放弃**：对“语义近邻探索”类场景，不如向量灵活；但对 wiki-memory 路线这是**一致的选择**（检索只是辅助，见 survey §7.2 差距 4）。
- **厂商耦合**:`pageindex` 为私有生态核心（另有 ChatIndex/ConDB/PageIndex MCP），云能力需 `PAGEINDEX_API_KEY`，本地版能力受限（如 OCR）。
- **评测诚信**:与 survey §6.3 同理，OpenKB 未提供量化基准，能力陈述以定性为主。

---

## 8. 对照 OpenObsidian: 差距 / 启示 / 可借鉴点

### 8.1 架构对照

| 维度 | OpenKB | OpenObsidian |
|---|---|---|
| 形态 | CLI 编译器 | Tauri 2 桌面 app（Rust core + React 前端） |
| 真相源 | `wiki/` Markdown + wikilink | vault 文件 + git 版本真相 |
| 核心能力 | 编译时综合 + Skill 分发 | 实时图谱可视化 + QQL 聚合查询 |
| 长文 | PageIndex 树索引 | 暂无（可借鉴） |
| 检索 | 结构 + LLM 推理 | 词法 + 结构 + QQL（P6-5 默认关向量） |
| 产出 | Skill / Deck / 图谱静态 HTML | 交互式 GraphView / 实时查询面板 |

两者**互补而非竞争**：OpenKB 负责重型编译与分发，OpenObsidian 负责轻量可视化与实时查询；`wiki/` 可直接作为 OpenObsidian 的 vault 打开，零迁移成本。

### 8.2 可借鉴（按收益/成本排序）

| 可借鉴 | 具体点 | 成本 | 备注 |
|---|---|---|---|
| **OKF frontmatter 契约** | 抄 `type/description/sources/full_text` 规范，让 `core` 解析与 `ui` 渲染有统一契约 | 低 | 与 [15-owf-format.md](../15-owf-format.md) 的 `format: owf/1` 互补，可互通 |
| **原子写入与快照** | `locks.py/mutation.py` 的 staging + snapshot + `track_new()` 抄到 `app/src-tauri` 的文件命令层 | 中 | 现有 `core` IO-free 定位不受影响，仅 `app` 层加固 |
| **实体抽取** | 在 `core` 加轻量实体识别（人/组织/地点），存 `entities/` 提升 Graph 语义 | 中 | 可先作 `type: Entity` 的写入约定，不进 `core` 也可 |
| **增量物化思想** | QQL 高频查询的增量索引/物化视图，与 PageIndex 树思路类比 | 中 | 属远期（P6-5 触发后再议） |
| **Generator 抽象** | `Generator(target_type)` 模式，未来 `QQL → 导出 Skill/Report` 可复用 | 低 | 纯 `app`/`ui` 层 |
| **Obsidian 兼容** | 保持 `[[wikilink]]` 输出，`wiki/` 直接当 Obsidian vault | 零 | 已具备，持续保持 |

### 8.3 不建议直接引入

- `pageindex / litellm / openai-agents` 重依赖会污染 `core` 的 IO-free 纯函数定位；如需长文检索，建议在 `app` 层可选集成（feature gate），而非进 `core`。
- `markitdown/trafilatura` 的文档转换能力与 OpenObsidian 的 vault 场景重叠度低，暂无引入必要。

---

## 9. 机会点（只陈述、不拍板）

> 与 [agent-memory-survey.md §7.3](./agent-memory-survey.md) 的机会点写法一致：候选按“约定层/工具层/工作流层/检索层”分层，均不构成决策。

**约定层**（成本最低）:

- 将 OKF `type/description/sources` 契约与 OWF-1 `format: owf/1` 声明对齐，使 OpenKB 产出的 Wiki 可被 OpenObsidian 无改动打开；反之亦然。
- `entity_types` 可配机制可作为 OpenObsidian `templates/wiki-starter` 的实体类型扩展参考。

**工具层**:

- `lint` 的图结构检查（dead/orphans/hubs/suggest）与 OpenObsidian `B-WIKI-LINT-CORE`（`core/src/lint.rs` 四条启发式）互补——前者检链接完整性，后者检语义一致性（`contradicts↔Contested` 等），可互为补充。
- `watch raw/ → auto-compile` 的 `watchdog` 模式可作为 OpenObsidian `watcher`（`vault-watch.ts`）的参考实现。

**工作流层**:

- “Query → 回填”（好答案归档为 `explorations/`）与 OpenObsidian `docs/14` 的 Ingest/Research/Consolidate 飞轮同构，缺的只是工作流文档（`B-WIKI-AGENT-DOC`）。
- “对话 → vault 蒸馏”管道（Letta sleep-time / A-MEM Memory Evolution）在 OpenKB 中体现为 `entities/concepts` 的增量更新，在 OpenObsidian 中对应 [conversation-to-vault-distillation.md](./conversation-to-vault-distillation.md) 的显式管道——两者可互相印证固化时机设计。

**检索层**（远期、条件触发）:

- 维持 P6-5 默认关向量；触发条件沿用 [semantic-retrieval.md §3.1](./semantic-retrieval.md):`vault_info.notes > ~1,000` 或单查询需载入 >5–6 篇。OpenKB 的 “No Vector DB” 立场为该决策提供了外部佐证。

---

## 10. 引用来源

> 一手来源优先；WebFetch 直读文件为最短证据链。

**仓库与文档**

- VectifyAI/OpenKB (README / AGENTS.md / docs/golden-principles.md / pyproject.toml) — https://github.com/VectifyAI/OpenKB
- OpenKB 架构图 `assets/openkb-architecture.webp`（README 内联）
- `openkb/cli.py` / `openkb/agent/compiler.py` / `openkb/indexer.py` / `openkb/schema.py` / `openkb/config.py` / `openkb/skill/generator.py` / `openkb/agent/query.py` / `openkb/visualize.py` / `openkb/skill/creator.py`（本次 zread 直读）
- Google Open Knowledge Format (OKF) — https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
- PageIndex (VectifyAI) — https://github.com/VectifyAI/PageIndex

**上游调研（本仓库）**

- [agent-memory-survey.md](./agent-memory-survey.md) §4.1/§4.2/§6.4/§7.2 §7.4
- [semantic-retrieval.md](./semantic-retrieval.md) §3.1/§4/§6.4
- [conversation-to-vault-distillation.md](./conversation-to-vault-distillation.md)
- [trust-provenance-frontmatter.md](./trust-provenance-frontmatter.md) / [content-lint-contradiction.md](./content-lint-contradiction.md)
- [../07-llm-wiki-architecture.md](../07-llm-wiki-architecture.md) / [../14-llm-wiki-workflow.md](../14-llm-wiki-workflow.md) / [../15-owf-format.md](../15-owf-format.md)

**方法与局限**:以 WebFetch + zread 多路直读，一手文件优先；社区文章与博客作佐证；量化数字缺失时以定性描述为准；OpenKB 的厂商自报能力未经独立复测，引用时已标注来源。


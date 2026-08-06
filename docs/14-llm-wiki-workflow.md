# 14 — LLM Wiki 工作流(ingest → research → consolidate)

> 本文是 **agent 操作手册**:怎么用 OpenObsidian 的类型 + 关系 + QQL + MCP 工具,把一个 vault 跑成一台
> 「知识复利引擎」。人类也能照着做。配套脚手架见 [`templates/wiki-starter/`](../templates/wiki-starter/),
> 双视角总览见 [07-llm-wiki-architecture](./07-llm-wiki-architecture.md)。
>
> 方法论原创、MIT;不绑定任何特定笔记后端。本文只讲「在这个引擎上怎么干」。

---

## 0. 飞轮(一句话)

```
        ingest(新 Source) ───────► 产出 Summary + Entity/Concept
              ▲                              │
              │                              ▼
        ┌──────────┐ ◄──── plan ◀──── consolidate(健康度 + lint)
        │ 下一源?  │                    ▲
        └──────────┘                    │
              ▲                         │
              └──────── research(提问 / 查询 / 记缺口)──┘
```

三个动作反复转:**ingest**(吃进原始源,产出派生知识)→ **research**(用 wiki 回答问题,记下缺口)→
**consolidate**(度量健康度 + 修结构 + 决定下一篇吃什么)。每次 ingest 关闭一个环;consolidate 决定下一个环。

`status:` frontmatter 是**唯一状态真相**:Source 是 `Unprocessed`/`Digested`、Summary 是 `Active`/`Superseded`、
Concept 是 `Active`/`Contested`——都只看 frontmatter,不看文件夹。

---

## 1. ingest(source) — 吃进一篇原始源

触发:新增一篇 `type: Source`,或用户给了一篇新材料。

1. **读透**这篇 Source。用 `read_note` 拿正文;必要时 `links kind=forward` 看它已经连到什么。
2. **建 / 更新一篇 `type: Summary`**(用 `write_note`):
   - `source: "[[the-source]]"`、`status: Active`、`generated: <YYYY-MM-DD>`。
   - 正文写 `## TL;DR` / `## Key points` / `## Quotes`(原文引用带出处)。
3. **回写 Source**:`status: Digested`、`derived_into: "[[the-summary]]"`;若没设过,补 `evidence_tier` + `last_verified`。
4. **对每个值得记的实体 / 主张**,建或更新 `type: Entity` / `type: Concept` 页(同样 `write_note`):
   - Summary 的 `mentions:` 里 `[[链接]]` 到它们(这一步让它们的反链入度 +1,图谱自动算,不用在 Entity/Concept 手填 `mentioned_in`)。
   - 写下 `contradicts:` 的那一刻,把**被反驳**的 Concept 的 `status` 改成 `Contested`。
5. 回填 Summary 的 `mentions:` 列表(把第 4 步触及的 Entity/Concept 全列上)。
6. 在 `index.md` 登记新页面一行。
7. consolidate()(见 §3)——每次 ingest 完都跑一次。

> `write_note` 返回 `broken_links[]` + `orphan_hint`:写完即审,断链 / 新孤儿当场看到,提示但不阻断保存。

一篇 Source 常触及 10–15 个 wiki 页面。这是特性,不是 bug——这就是「复利」。

### 1.1 对话 / 会话 → vault(蒸馏 L2a · 零代码路径)

> 规格来源:[`research/conversation-to-vault-distillation.md`](./research/conversation-to-vault-distillation.md)。  
> **不变量**(doc 11):应用内 agent **原始转录**永留 app data(SQLite),不进 vault / 不进 git。进 vault 的只有**显式**固化后的蒸馏产物。

当前仓库**没有**「一键导出线程」按钮(蒸馏 L1 UI 等信号再开)。L2a 是**今天就能用**的路径:只要 vault 里已有一篇 `type: Source`(人手粘贴会话要点、或日后导出产物),对 agent 说「按本节 ingest」即可——**零新命令、零 core、零依赖**。

**入口形态**(任选其一):

| 来源 | 怎么变成 Source |
|---|---|
| 应用内 agent 会话 | 人把值得固化的结论**手工**写成 `type: Source`(或等 L1 导出按钮落地);`provenance: agent`,可加 `agent:` / `thread_id:` 备查 |
| 外部 agent(Claude Code / Cursor 等) | 把本轮对话要点 `write_note` 成 `type: Source`,`status: Unprocessed` |
| 已有材料 | 任意 `type: Source` 未 Digested 页都走同一条 ingest |

**对 agent 的可复制指令**(外部 MCP 或应用内 ACP 均可):

```text
请按 docs/14-llm-wiki-workflow.md §1 对下列 Source 做 ingest。
路径: <path-to-source.md>

硬约束:
1. 原始会话/转录不进 vault;只改写本 Source 派生出的 Summary/Entity/Concept。
2. 蒸馏分四槽,不要写成一整段摘要:
   - 事实 → Summary 的 Key points / Quotes
   - 决策与理由 → 独立 Concept(主张)或写进相关 Entity
   - 教训 → Concept(可标 tags: lesson)
   - 待办 / Open gaps → 记入 index.md 的 Open gaps,不要伪装成已成立主张
3. 所有新建/改写页补 frontmatter(软字段,有则不覆盖):
   - provenance: agent
   - reviewed: 留空(写 ≠ 复审;人复核后再填 YYYY-MM-DD)
   - 可选 trust: 0-3
4. Source 写回 status: Digested + derived_into;Summary source: 回指本页。
5. 写 contradicts 时把被反驳 Concept 改为 status: Contested。
6. 写完跑 §3 consolidate(Health QQL + 结构 lint)。
```

配套可复制提示词模板:[`templates/wiki-starter/prompts/ingest-distill.md`](../templates/wiki-starter/prompts/ingest-distill.md)。

**人审门**(结构性,不是可选项):

- 应用内 agent 写入默认走 git 归因 quarantine(doc 11):蒸馏 diff 等人**采纳**才进 HEAD。
- 外部 agent 直写 vault 时:git 历史 + 事后跑 `WHERE provenance = "agent" AND NOT has reviewed`(§3.1)当复审队列。
- 隐私:会话可能含凭证/路径——**只有人显式要固化的内容**才进 Source;默认不要整段 dump 转录。

**何时再加代码**(蒸馏 L1/L2b,等信号):用户开始**手动**把会话结论复制进笔记、或反复回翻旧线程。在那之前只维护本文 + 提示词,不提前建导出/一键蒸馏 UI。

---

## 2. research(question) — 用 wiki 回答

触发:用户问了一个能从 wiki 回答的问题。

1. **找候选**:`search_notes`(全文)+ `run_qql`(结构化,见 §3 健康查询当导航)+ `links`(关系跳转)。
2. **读最相关的**:`read_note`(带 graph 简报:反链 / 出链 / 死链 / 度数,一眼看这篇的上下文)。
3. **综合作答,带引用**:每个结论 `[[链接]]` 回它来自的 Summary(进而 Source)。这是「不凭空」的保证。
4. **可复用的答案**:如果这个答案以后还会被问,提议把它归档成新 `type: Concept`(主张)或 `type: Summary`。
5. **记缺口**:wiki 答不全(缺 Source、单源 Concept 被当事实、未验证的主张)→ 把缺口记到 `index.md` 的 Open gaps 段。
   一次答失败的 research,就是下一篇该 ingest 什么的信号——它喂 consolidate 的 plan。

> 健康查询本身就是最强的 research 导航:想知道「哪些主张还在争议」「哪里证据薄」,直接跑 §3 的 QQL。

---

## 3. consolidate() — 度量 + 修结构 + 决策

触发:每次 ingest 之后,或定期。

### 3.1 度量(跑 Health 查询)

这十一条 QQL 随 starter vault 交付([`templates/wiki-starter/health/`](../templates/wiki-starter/health/)),
语法 + 语义由 [`core/tests/wiki_health_qql.rs`](../core/tests/wiki_health_qql.rs) 锁住。复制 ```qql ``` 块文本给 `run_qql`:

| 指标 | QQL | 读法 |
|---|---|---|
| 矛盾健康度 | `WHERE type = "Concept" AND status = "Contested" SHOW title` | 有未和解反驳的主张;最该补料 |
| 孤儿 | `WHERE type IN ("Entity", "Concept") AND mentioned_in.len() = 0 SHOW title` | 无入边的死页;补链或删 |
| 概念饥饿度 | `WHERE type = "Concept" SHOW title, mentioned_in.len() AS depth SORT mentioned_in.len() ASC` | 深度最浅的在前;下一篇 Source 喂它们 |
| 证据质量分布 | `WHERE type = "Source" RENDER group_by(evidence_tier)` | 按可信度分组数来源;暴露偏差 |
| 综合度(单源) | `WHERE type = "Concept" AND mentioned_in.len() < 2 SHOW title` | 只挂在一个来源上的主张;去交叉验证 |
| 溯源:agent 未复审 | `WHERE provenance = "agent" AND NOT has reviewed SHOW title` | agent 写了没人复核的页;复核优先级最高 |
| 溯源:复审超期 | `WHERE provenance = "agent" AND (NOT has reviewed OR reviewed < "<今天−N 天>") SHOW title` | QQL 无日期算术,cutoff 由运行者插值(建议 N≈180);从未复审与超期一并捞 |
| 漂移:无复审日期 | `WHERE type IN ("Concept", "Entity", "Summary") AND NOT has reviewed SHOW title` | 不限产出者;没有复审日期的页面迟早安静地说谎 |
| 溯源:知识构成 | `WHERE type IN ("Concept", "Entity", "Summary") RENDER group_by(provenance)` | 人写 / agent 写 / 摄取 的比例;`(none)` 桶 = 字段腐烂探针 |
| Source 漂移 | `WHERE type = "Source" AND last_verified < "<今天−~6 个月>" SORT last_verified ASC SHOW title, last_verified`(再配 `WHERE type = "Source" AND NOT has last_verified SHOW title`) | 世界可能已变 → 重核实;变了就重新 ingest |
| 同名撞车(粗筛) | `WHERE type IN ("Concept", "Entity") RENDER group_by(title)` | 看 count>1 的桶;撞名时解析静默偏向第一篇。大小写/alias 交叉撞由 core `lint::duplicate_names` 精筛 |

也可用 `links kind=orphans` / `links kind=hubs` 直接从图侧拿孤儿 / 枢纽。

> 后六条依赖 `provenance` / `reviewed` 软字段约定(见 [`types/`](../templates/wiki-starter/types/) 契约与
> [`docs/research/trust-provenance-frontmatter.md`](./research/trust-provenance-frontmatter.md)):字段可选、永不校验、永不阻止保存。

### 3.2 修结构(lint)

分层:**链接/计数**(工具已有)→ **结构启发式 L1**(core 已实现,消费面待 MCP)→ **内容级 L2**(agent 判断,本文可跑)→ **L3 自动判**(远期,默认不做)。

#### 3.2.1 链接级 + 计数级(每天可跑)

- **断链 / 孤儿**:`links kind=dead` 找死链;`links kind=orphans` 找孤儿。合并或删除空 `mentioned_in` 的页面。
- **缺交叉引用**:Summary 正文里点名了某 Entity/Concept,却没进它的 `mentions:` —— `write_note` 回填。也可用 `links kind=suggest`(正文出现他者标题却未链接)。
- **陈旧 Source**:`last_verified` 超 ~6 个月 → 重核实世界;若变了,ingest 产**新** Summary,旧的标 `Superseded`(§3.1 Source 漂移 QQL)。
- **矛盾(状态侧)**:`status: Contested` 的 Concept,核实 `contradicts` 两边是否还成立;和解了就改回 `Active` 并记理由。
- **复审超期**:`provenance: agent` 且无 `reviewed`(或超期,见 §3.1 的溯源查询)→ 人复核后更新 `reviewed: <今天>`;确认无误可上调 `trust`;无法复核的标 `Contested` 或记进 Open gaps。**写 ≠ 复审**——`reviewed` 只在显式复审动作时更新。

#### 3.2.2 结构启发式 L1(core 纯函数 · 只产候选)

> 实现:`core/src/lint.rs`(IO-free,TDD)。规格调研:[`research/content-lint-contradiction.md`](./research/content-lint-contradiction.md) §5.1。  
> **政策:只产候选,永不自动改 `status` / 永不自动写 `contradicts`。** 落笔永远是 agent/人经 `write_note`。

| ID | 函数 / 查询 | 报什么 | 建议处置 |
|---|---|---|---|
| L1-A | `lint::contradiction_consistency` | `contradicts` 边两端皆非 Contested;或 Concept 标 Contested 却无入边 contradicts | 补 status 或补/删边,使图与状态自洽 |
| L1-B | `lint::duplicate_names` + Health `duplicate-titles` | 归一化 title/alias 撞名(解析 first-wins 静默偏向第一篇) | 合并 / 改名 / 加 alias 消歧 |
| L1-C | Health `stale-sources` | Source 缺 `last_verified` 或过期 | 重核实或重新 ingest |
| L1-D | `lint::summaries_on_superseded` | Summary 的 `source:` 指向 Superseded 源 | 重摄取或标 Summary Superseded |
| L1-E | `lint::refs_to_superseded` | Active/Contested 仍引用 Superseded(豁免 `contradicts` / `superseded_by`) | 改链到替代页或标 superseded_by |

**消费面(2026-08-06)**:core 函数已落地;**尚未**暴露为 app command / MCP 工具(`B-WIKI-LINT-MCP` ⏳ 暂不做)。在接通前,agent 用 §3.1 的 QQL + `links` 覆盖 L1-C 与部分 L1-B;L1-A/D/E 只能等 MCP 或人用测试/本地 crate 调。consolidate 仍应**假设**这些不变量成立,手写/MCP 写时自觉对齐 §1 第 4 步。

#### 3.2.3 内容级 lint L2(agent-in-the-loop · 零新工具)

> 系统不替你判「两页正文是否矛盾」。L2 = agent 用既有 MCP 组合产**候选对 + 证据**,再按五分类落笔。只产报告/边/status 变更,不引入 NLI/向量。

**可复制工作流**(每次 consolidate 或怀疑某簇漂移时跑一轮):

1. **选种子页**:优先 `Contested`、单源 Concept(§3.1)、或 `links kind=hubs` 里度数高的 Concept/Entity。`read_note` 读透 + 看 graph 简报。
2. **收候选邻居**(廉价信号并集,宁缺勿滥):
   - `links kind=backlinks` / `forward` — 共享出链/入链的页更可能谈同一件事;
   - `search_notes` 用种子标题/关键专名(英文 term 重叠较稳;中文 vault 以图/标签为主);
   - `run_qql`:`group_by(title)` 撞名桶、同 `tags` 粗筛(若有标签纪律)。
3. **逐对 `read_note`**,只比**关键断言**(日期/版本/范围/主体),不要整页糊读。按五分类之一定性(**勿压成二元「矛盾/不矛盾」**):

   | 分类 | 含义 | 落笔 |
   |---|---|---|
   | **real contradiction** | 同一主体、同一语境下互斥 | `write_note` 写 `contradicts:` + 被反驳方 `status: Contested` |
   | **version difference** | 旧版仍当真 | 旧页 `Superseded`,链到新页(`superseded_by` 或正文说明) |
   | **scope difference** | 不同适用域被误并 | 拆开语境;标题/正文标明范围,必要时拆页 |
   | **terminology difference** | 同物多名 / 同名异物 | 合并或 alias;对齐 L1-B |
   | **unresolved uncertainty** | 证据不足 | 记 `index.md` Open gaps;可选 `Contested` 或降 `trust` |

4. **写后即审**:`write_note` 返回的 `broken_links[]` / `orphan_hint` 当场处理;再跑 §3.1 Contested / 单源查询,确认漏斗两端有数。
5. **未决候选**写进 `index.md` 维护段(一行:路径 A ↔ B · 分类 · 日期),下次 ingest 优先补料。

**禁止**:

- 系统或脚本**自动**改 `status` / 批量写 `contradicts`(high-risk;误报会污染唯一状态真相)。
- 为「看起来干净」把 real contradiction 抹成含糊折中——应保留 Contested 直到有新 Source。

**L2 → 工具化**(L2-tool,未排期):候选生成可沉为 core 纯函数 + MCP `lint_content`(shared_link / shared_tag / term_overlap + 粗粒度摘录)。**先靠本文跑几轮**,用实践决定 signal 权重;再开 `B-WIKI-LINT-MCP` 时把 L1 Finding 与 L2 候选一并暴露。详见调研 §5.2。

**L3 自动判**(远期):本地 NLI 或外部 LLM 只作排序信号,永不判决;触发条件见调研 §5.3(候选积压 + 误报基线 + 许可审计 + 人批)。默认关。

### 3.3 决策(plan:下一篇吃什么)

两个目标都加权(不是纯深度贪婪):

- **深度**:喂最饿的 Concept(`Active` 低于基线、或任何 `Contested`);Contested 双倍值(提深度 *又* 可能和解矛盾)。
- **拓宽**:别让某个簇钻到深度 ≥ 4 还不停,而某个单源簇 / Open gap 没人管——交替「加深」与「拓宽」。
- **证据**:优先能抬升 `evidence_tier` 的源(给已被 vendor 喂饱的 Concept,一篇 `independent_research` 胜过第三篇 `vendor_source`)。

把决策记一行在 `index.md` 的「本轮决策」段,然后回到 §1 ingest。

---

## 4. agent 工具速查(MCP)

| 工具 | 作用 | 阶段 |
|---|---|---|
| `list_notes` | 列笔记(可按类型筛) | 全部 |
| `read_note(path)` | 读正文 **+ graph 简报**(反链 / 出链 / 死链 / 度数) | research / ingest |
| `write_note(path, content)` | 写整篇;**返回 `broken_links[]` + `orphan_hint`**(写后即审) | ingest / consolidate |
| `search_notes(terms)` | 全文检索(标题加权) | research |
| `run_qql(qql)` | 跑结构化查询(§3.1 十一条 Health + 任何自定义) | research / consolidate |
| `links(kind, [path], [mode], [limit])` | 图谱查询:`backlinks` / `forward` / `dead` / `orphans` / `hubs` / `suggest` | research / consolidate |
| `vault_info` | vault 元信息 | 全部 |

> 客户端配置(Claude Code / Cursor)见 [`mcp/README.md`](../mcp/README.md) §Client configuration。  
> **尚未暴露**:`core::lint` 结构启发式(§3.2.2)——接通前见 backlog `B-WIKI-LINT-MCP`。

---

## 5. 不变量(别破坏)

- **Source 不可变**:更新 = 重新摄取产新 Summary + 旧的标 `Superseded`;版本真相靠 git(`git restore` 可还原)。
- **`mentioned_in` 是图谱算的**:别手填;由 Summary 的 `[[wikilink]]` 自动产出反链。
- **`status:` 唯一状态真相**:别用文件夹 / 文件名 / 记忆去判断一个页面的状态。
- **引用一切**:wiki 页上每条主张都 `[[链接]]` 回它的 Summary / Source。
- **`provenance` / `reviewed` / `trust` 是可选软字段**:永不校验、永不阻止保存;写入路径只补缺省、不覆盖已有值;写 ≠ 复审,`reviewed` 只在显式复审动作时更新。
- **原始 agent 转录不进 vault**:只有显式蒸馏产物(§1.1)经人触发入 vault;lint **只产候选**、不自动改 status(§3.2)。

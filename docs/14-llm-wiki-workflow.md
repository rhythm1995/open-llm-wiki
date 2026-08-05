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

这五条 QQL 随 starter vault 交付([`templates/wiki-starter/health/`](../templates/wiki-starter/health/)),
语法 + 语义由 [`core/tests/wiki_health_qql.rs`](../core/tests/wiki_health_qql.rs) 锁住。复制 ```qql ``` 块文本给 `run_qql`:

| 指标 | QQL | 读法 |
|---|---|---|
| 矛盾健康度 | `WHERE type = "Concept" AND status = "Contested" SHOW title` | 有未和解反驳的主张;最该补料 |
| 孤儿 | `WHERE type IN ("Entity", "Concept") AND mentioned_in.len() = 0 SHOW title` | 无入边的死页;补链或删 |
| 概念饥饿度 | `WHERE type = "Concept" SHOW title, mentioned_in.len() AS depth SORT mentioned_in.len() ASC` | 深度最浅的在前;下一篇 Source 喂它们 |
| 证据质量分布 | `WHERE type = "Source" RENDER group_by(evidence_tier)` | 按可信度分组数来源;暴露偏差 |
| 综合度(单源) | `WHERE type = "Concept" AND mentioned_in.len() < 2 SHOW title` | 只挂在一个来源上的主张;去交叉验证 |

也可用 `links kind=orphans` / `links kind=hubs` 直接从图侧拿孤儿 / 枢纽。

### 3.2 修结构(lint)

- **断链 / 孤儿**:`links kind=dead` 找死链;`links kind=orphans` 找孤儿。合并或删除空 `mentioned_in` 的页面。
- **缺交叉引用**:Summary 正文里点名了某 Entity/Concept,却没进它的 `mentions:` —— `write_note` 回填。
- **陈旧 Source**:`last_verified` 超 ~6 个月 → 重核实世界;若变了,ingest 产**新** Summary,旧的标 `Superseded`。
- **矛盾**:`status: Contested` 的 Concept,核实 `contradicts` 两边是否还成立;和解了就改回 `Active` 并记理由。

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
| `run_qql(qql)` | 跑结构化查询(上面五条 Health + 任何自定义) | research / consolidate |
| `links(kind, [path], [mode], [limit])` | 图谱查询:`backlinks` / `forward` / `dead` / `orphans` / `hubs` / `suggest` | research / consolidate |
| `vault_info` | vault 元信息 | 全部 |

> 客户端配置(Claude Code / Cursor)见 [`mcp/README.md`](../mcp/README.md) §Client configuration。

---

## 5. 不变量(别破坏)

- **Source 不可变**:更新 = 重新摄取产新 Summary + 旧的标 `Superseded`;版本真相靠 git(`git restore` 可还原)。
- **`mentioned_in` 是图谱算的**:别手填;由 Summary 的 `[[wikilink]]` 自动产出反链。
- **`status:` 唯一状态真相**:别用文件夹 / 文件名 / 记忆去判断一个页面的状态。
- **引用一切**:wiki 页上每条主张都 `[[链接]]` 回它的 Summary / Source。

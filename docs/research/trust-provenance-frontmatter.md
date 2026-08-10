# 调研报告:信任分级与 provenance frontmatter

> **性质**:调研 + 工程方案。只陈述分析、给出候选,**不替任何人拍板**;第 5 节方案是否采用由人决定。
> **上游**:[agent-memory-survey](./agent-memory-survey.md) §6.6(记忆写入面安全)、§7.2 差距 6、§7.3 机会点⑥。
> **调研日期**:2026-08-06 · **branch**:release/v0.1.0(本文不改任何其它仓库文件、不 commit)。
> **核心问题**:知识库里的每一段知识,**谁产出的、从哪来的、可信度几级**?现状只有「证据质量」(`evidence_tier`)与 git「谁写的」快照,**缺「产出者维度」与「信任维度」的显式区分**。
>
> **诚实标注**:§3 的 W3C PROV、MINJA 防御栈、OWASP ASI06、Zep 双时序、`basic-memory`(GitHub README)、Claude Code memory(官方文档)均为一手来源核实(见 §7);Letta 沿用上游 survey §4.1 已核实的转述。§4 的 QQL 字段访问结论为**本地实测**(见 §4.3),非推断。

---

## 1. TL;DR

1. **溯源有事实标准,但可大幅简化。** W3C PROV(PROV-DM/PROV-O)用 **Entity–Activity–Agent** 三元 + `wasAttributedTo`/`wasDerivedFrom`/`wasGeneratedBy`/`used` 描述「东西由活动产出、活动归因于主体」[P1][P2]。落到笔记场景,这套模型可塌缩成**三个正交维度**:**谁写的**(producer:`human`/`agent`/`ingested`)、**从哪来**(origin:`source`/`url`,本仓库已有)、**多可信**(trust:`0–3`,可选)。Open LLM Wiki 的 frontmatter 目前只覆盖第二维,第一、三维空白。
2. **`evidence_tier` ≠ 信任分级,两者必须分开。** `evidence_tier`(independent_research > … > opinion,见 `templates/wiki-starter/types/source.md`)答的是「**这份外部证据本身的质量**」——客观、贴在 Source 上;而 provenance/trust 答的是「**这段派生知识是谁产出的、我们该多信它**」——认识论归因,贴在 Summary/Entity/Concept 上。同一篇 `vendor_source` 可以喂出一篇被人复核过的高信任 Concept,也可以喂出一篇 agent 昨天刚生成、没人看过的低信任 Concept。**证据质量是输入,信任是结论,不能互相替代。**
3. **记忆安全已把溯源标注列为防御必修课,不是远期问题。** OWASP 已把记忆投毒列为 **ASI06(Memory & Context Poisoning)**[S2];MINJA(NeurIPS 2025)经**纯查询接口**达成 >95% 注入成功率、平均 ASR ~77%(部分配置 >70%)[S1];Unit 42 实测注入可**持久 365 天**后静默外泄[S3]。防御栈 = **溯源标注(provenance tagging)+ 写入前校验(write-ahead validation)+ 信任加权检索(trust-weighted retrieval)+ 时间衰减(temporal decay)**,外加指令剥离、熔断器、用户确认[S4]。Open LLM Wiki 现只有链接侧「写入前校验」(`write_note` 返回 `broken_links`),其余三项无对应物。
4. **基石结论(本地实测):QQL 已能直接读任意 frontmatter 字段,方案零 core 改动。** `core/src/query.rs` 的 `FieldRef::Key(k)` 分支经 `n.frontmatter.get(k)` 取任意键(字符串/数字/布尔/列表);`has <字段>`、`RENDER group_by(<字段>)`、`<字段> = / < "…"` 全部对任意键生效。已用临时 harness 实测 `provenance = "agent"`、`NOT has reviewed`、`group_by(provenance)` 均正确(§4.3)。这意味着「加字段 + 写查询」**不碰 core**,纯约定 + 模板。
5. **推荐最小字段集(需人拍板)**:
   - `provenance: human | agent | ingested` —— 谁产出(核心);
   - `reviewed: YYYY-MM-DD` —— 最近一次人/流程复审日(时间衰减的锚点);
   - `trust: 0-3`(可选)—— 显式信任级;不填则靠 `provenance`+`reviewed` 隐式推。
6. **零新依赖、零 schema 校验、不阻止保存,与既有原则全兼容。** 本方向是**纯 frontmatter 约定 + 模板 + 可选 UI**,符合 MIT 原创红线、无新依赖(许可零负担);字段一律可选、永不校验、永不阻止保存——与 open-questions **P4**「类型文档仅 UI 提示、永不 schema 校验或阻止保存」一致。
7. **「时间衰减」在本仓库的正确锚点是 `reviewed`,不是 `created`。** Zep/Graphiti 用边的 `valid_at`/`invalid_at` 双时序表达「事实何时为真、何时失效」[T1][T2];对应到 wiki,一段派生知识的「新鲜度」应由**最近复审日**而非创建日决定——agent 昨天生成但今天被人复核的 Concept,比人两年前写、再没人看过的 Concept 更可信。QQL 无日期算术,衰减查询用「`reviewed` 升序 + 运行者插值 cutoff」落地(§5.3)。
8. **最大风险是字段腐烂与假安全感,不是字段不够多。** 调研的漂移六型明说「**没有复审日期的页面迟早会安静地说谎**」[survey §6.5];若约定了 `reviewed` 却没人更新,它比没有更危险(给出虚假的「我查过了」信号)。同理,**agent 自报 `provenance: human` 的可信度悖论**意味着盖章只能是「提示」不是「保证」。宁可字段少而有人维护,不可字段多而集体摆烂。
9. **优先级定位(2026-08-06 补记,方法论详见 [survey §7.4](./agent-memory-survey.md))**:初版排序 P0(半天–1 天、零代码)。因排序依据改为「可逆性 × 可观测性」,本方向**重新定性为「探针」而非「功能」**:设计参数(字段命名、级数、初始盖不盖 `reviewed`)品味依赖度高但便宜可逆(软字段、零校验、删掉零成本);真正的未知项是**维护纪律**——随建的 Health 查询(`group_by(provenance)`、「agent 产出未复审」)就是测该纪律的探针:跑一个月没人填,方案自动证伪,损失为零。本方向的探针结果同时是蒸馏方向的前置判据。
10. **落地状态(2026-08-06)**:P0 L1 ✅(types/examples/health + docs/14 §3.1);写入路径 L2 等探针约一个月(`knowledge-mix` 的 `(none)` 桶)。

---

## 2. 问题与现状

### 2.1 现状:三个「半个」机制,各管一段

| 机制 | 管什么 | 不管什么 | 落点 |
|---|---|---|---|
| `evidence_tier` + `last_verified` | **证据质量**(这份外部源可不可靠)+ 源侧核实日 | 派生知识的产出者、派生知识的信任 | `templates/wiki-starter/types/source.md` |
| git 快照归因(turn 级快照 + per-agent ref + writer 标注) | **谁写的**这一客观事实(含 agent 写) | 这段知识的**认识论来源 / 可信度语义** | `docs/11-in-app-agent-roadmap.md` §4 |
| `write_note` 写后审计(`broken_links[]` + `orphan_hint`) | **链接完整性**的写入前/后校验 | 记忆投毒意义上的溯源 / 信任 | `mcp/src/main.rs` `write_note` / `audit_note` |

三者都对,但**都回答不了**这两个问题:
- 「这篇 Concept 是**人写的**还是 **agent 写的**还是**直接摄取**的?」(产出者维度)
- 「这篇 agent 生成的 Summary **多久没人复审了**,还可信吗?」(信任 + 时间维度)

### 2.2 差距的准确表述

git 归因(doc 11 §4)与 provenance frontmatter **不是一回事、也不重复**:
- **git 管事实**:「这个字节是哪个 writer 在哪个 turn 写下的」——可回滚、可审计、机器可读,但**读不出语义**(git 不知道这行是「人复核过的结论」还是「agent 草稿」)。
- **frontmatter 管语义**:「这段知识在认识论上从哪来、该多信」——人可读、可被 QQL 聚合、进图谱,但**不管字节级谁写的**。

两者是互补层,正如 MINJA 防御栈里「溯源标注」(语义层)与「写入前校验 / 审计日志」(机制层)是并存的两件事[S4]。**现状缺的是语义层。**

> 引用路径(均已在本次调研中打开核对):
> - `templates/wiki-starter/types/source.md`(`evidence_tier` 取值表、`last_verified`)
> - `templates/wiki-starter/types/{summary,entity,concept}.md`(**均无** provenance / reviewed / trust 字段)
> - `docs/07-llm-wiki-architecture.md` §3(Health 即查询;`evidence_tier` 已进 group_by)
> - `docs/11-in-app-agent-roadmap.md` §4(git 归因)、§10(标注层 writer 注入)
> - `mcp/src/main.rs`(`write_note` / `audit_note`)
> - `docs/open-questions.md` P4(软类型、永不 schema 校验)

---

## 3. 技术调研

### 3.1 溯源模型:W3C PROV 及其在笔记场景的简化

**一手定义(W3C PROV-DM,Rec 2013)[P1]:**
- **Entity**:「a physical, digital, conceptual, or other kind of thing with some fixed aspects」——被描述的东西(数据集、文档、**一条笔记**)。
- **Activity**:「something that occurs over a period of time and acts upon or with entities」——产出/消耗实体的过程(**摄取、写作、复审**)。
- **Agent**:「something that bears some form of responsibility for an activity taking place」——对活动负责的主体(**人、agent、组织**)。
- 最小说明:**Generation** = 活动产出新实体;**Usage** = 活动开始使用实体;**Derivation** = 一实体转化为另一实体;**Attribution** = 「the ascribing of an entity to an agent」(把实体归因给主体)。核心关系键:`wasGeneratedBy` / `used` / `wasAttributedTo` / `wasDerivedFrom`。

**映射到 Open LLM Wiki:**

| PROV 概念 | Open LLM Wiki 对应 | 现状 |
|---|---|---|
| Entity | 一篇笔记(Source/Summary/Entity/Concept) | ✅ 已有 |
| Activity:ingest | `type: Source` 摄取 + `derived_into` | ✅ 已有 |
| Activity:derive | Summary 的 `source` / `mentions` | ✅ 已有 |
| Relation:`wasDerivedFrom` | `derived_into` / `source` 关系边 | ✅ 已有 |
| **Agent** | **谁产出(人/agent/摄取)** | ❌ **缺** |
| **Relation:`wasAttributedTo`** | **「这页归因于谁」** | ❌ **缺** |

结论:PROV 三元里,Open LLM Wiki 的 Entity/Activity/Derivation 已被类型系统覆盖;**唯独 Agent 归因(`wasAttributedTo`)没有 frontmatter 落点**。这正是 `provenance:` 要补的那一格。

**三个正交维度(本报告的字段设计骨架):**

| 维度 | 回答 | 字段 | 现状 |
|---|---|---|---|
| 谁写的(producer) | 这页内容**谁产出** | `provenance: human\|agent\|ingested` | ❌ 缺 |
| 从哪来(origin) | 派生自/链接到哪 | `source` / `url` / `derived_into` / `mentions` | ✅ 已有 |
| 多可信(trust) | 该多信这段知识 | `trust: 0-3`(可选)+ `reviewed` 日期 | ❌ 缺 |

### 3.2 信任分级与衰减(记忆安全视角)

**为什么必须有信任维度——攻击面已被实锤:**
- **MINJA**(arXiv:2503.03704,NeurIPS 2025)[S1]:攻击者**只经查询接口**(无需直接写记忆库)向 agent 长期记忆注入恶意记录,平均注入成功率 **~98%**、攻击成功率 **~77%**(多个配置 >70%,与 survey §6.6 的「>95% 注入 / >70% 攻击」一致);被注入的记忆**跨会话持久**,成为后续受害者的间接越狱通道——「注入发生在二月,伤害发生在四月」。
- **OWASP Agentic Security Initiative(ASI)**[S2]:**ASI06 = Memory & Context Poisoning**。OWASP 明确把记忆投毒与一次性提示注入区分开,关键在**持久性**——被污染的记忆会反复跨会话影响未来的规划与工具调用。OWASP 的《Agentic AI – Threats and Mitigations》把投毒记忆列为需显式缓解的威胁。
- **Unit 42**[S3]:间接提示注入经抓取的恶意内容进入会话摘要,**持久 365 天**,后续会话被触发后静默外泄。

**防御栈(Christian Schneider,persistent memory poisoning,一手)[S4]:**

| 防御 | 原文要点 | Open LLM Wiki 现状 |
|---|---|---|
| **Provenance tagging** | 「Every memory entry should record its source, creation time, session context, and initial trust score.」 | ❌ 无(本报告要补) |
| **Write-ahead validation** | 「uses a separate, smaller model to evaluate proposed memory updates before they're committed」 | 🟡 仅链接侧(`broken_links`) |
| **Trust-weighted retrieval** | 「adjusts retrieval scores based on the provenance metadata attached at write time」 | ❌ 无 |
| **Temporal decay** | 「reduces the influence of older memories over time」;应与 trust scoring / reinforcement / source validation 结合 | ❌ 无 |
| Instruction stripping | 「removes or neutralizes content that could be interpreted as directives」 | ❌ 无 |
| Circuit breakers | 「automatically halt agent operations when anomalies are detected」 | 🟡 高危操作门控(doc 11 §5) |
| User confirmation | 「requiring explicit user approval before persisting new memories」 | 🟡 高危写门控(permissive 琥珀点) |

**时间衰减的启发——Zep/Graphiti 双时序:**
- Graphiti 边带 **`valid_at`(事实在世界里何时为真)与 `invalid_at`(何时失效)**,另有摄取时间;新矛盾信息到来时**置 `invalid_at` 而非删除**,保留历史[T1][T2]。
- 对 Open LLM Wiki 的启发:派生知识的「可信度随时间衰减」不该挂在 `created` 上(那只是诞生时刻),而该挂在 **`reviewed`(最近复审)** 上——一段知识只有被再次复审才「重新变新」;久未复审 = 静默走向失效。**`reviewed` 是本仓库版的 `valid_at` 锚点。**

### 3.3 代表做法对照表

> 强制程度列:「强制」= 引擎/工具阻止或硬性要求;「约定」= 文档要求但可绕过;「无」= 不要求。

| 系统 | 产出者/归因字段 | 复审字段 | 信任字段 | 强制程度 | 许可/备注 |
|---|---|---|---|---|---|
| **W3C PROV**[P1][P2] | `wasAttributedTo`(Agent) | — | — | 数据模型(工具自定) | 事实标准;重 |
| **basic-memory**[B1] | 人机共写同一批 md(「AI and humans write to the same files; sync keeps them in step」);**README 无 author/provenance/trust 字段** | 无 | 无 | 无 | AGPL-3.0,**仅作概念参照**(许可红线)|
| **Claude Code MEMORY.md**[B2] | CLAUDE.md=人写指令、auto memory(MEMORY.md)=agent 写;**文件级区分,非行内字段**;agent 写带 frontmatter 的文件时自动盖 `modified` 时间戳(v2.1.214+) | 无(`modified` 是写入时,非复审时) | 无 | 无(「是上下文,不是强制配置」;强制走 hooks) | 官方文档,本次一手核实 |
| **Letta memory blocks** | agent 经内置工具自编辑 core blocks;可标 read-only;**无信任级** | 无 | 无 | 工具约定 | 文档[Letta blocks] |
| **Zep / Graphiti**[T1][T2] | 边带摄取来源 | `valid_at`/`invalid_at` | — | 引擎强制(边失效) | 时序 KG |
| **MediaWiki 类 wiki** | 编辑历史 = 产出者 | `last-reviewed` / review 工作流常见 | review state | 工作流约定 | 社区惯例 |
| **Obsidian + Dataview** | 自由 frontmatter,**约定俗成** | `reviewed` / `last-reviewed` 见于社区模板(无官方文档,本次未核到一手) | 自定义 | 无 | 软元数据实践 |
| **Open LLM Wiki 现状** | ❌ | ❌ | `evidence_tier`(证据质量,非信任) | 无 | 本报告补 |

**三条横向观察(诚实标注:basic-memory / Claude Code 行本次一手核实;Letta 行为 survey §4.1 已核实转述;Dataview 行为社区惯例、官方文档本次未核到):**
1. **没有主流系统把「产出者」做成硬性必填**——普遍是「约定 + 引擎能读到」的软模式。这与 Open LLM Wiki 的软类型原则(P4)天然一致,也印证**强制必填是反模式**。
2. **复审日期(reviewed / last-reviewed)是 wiki 与笔记社区里最普遍、最轻量的「对抗漂移」约定**——它便宜、人可读、可聚合,是最值得先抄的一个。
3. **Claude Code 用「两套文件」而非行内字段区分人机**(CLAUDE.md 人写 / MEMORY.md agent 写)[B2]——但 Open LLM Wiki 的人机页面在同一 vault 混居,「分文件」不适用,**行内 frontmatter 字段是唯一可行解**;且 Claude Code 对 agent 写入自动盖 `modified` 时间戳、对无 frontmatter 的文件**绝不补加**,证明写路径盖章工程上低成本、且「只补缺省不覆盖」是被验证过的纪律。

### 3.4 失败模式(为什么字段不是越多越好)

1. **字段腐烂(最主要)**:约定了 `reviewed` 却没人更新 → 页面拿着过期的「我已复核」戳**安静地说谎**。survey §6.5 漂移六型原话:「没有复审日期的页面迟早会安静地说谎」[survey]。**有字段不维护,比没字段更危险。**
2. **假安全感**:打了 `provenance` 章 ≠ 真可信。**agent 自报悖论**——一个被投毒的 agent 会毫不犹豫地给自己盖 `provenance: human` / `trust: 3`。溯源标注是**线索**不是**证明**;它降低排查成本,但不能替代人复核与写入门控。
3. **过度 schema 化**:把 provenance/trust 做成必填 + 校验,违背「类型不绑人、永不阻止保存」(P4),也把 wiki 变成笼子。字段应**可选、可留空、永不阻断**。
4. **git diff 噪音**:若写入路径自动盖时间戳类字段(尤其 `reviewed`/`last_verified`),每次 save 都动 frontmatter → git 历史被噪音淹没。需决定自动盖章的字段范围(§6)。

---

## 4. 与 Open LLM Wiki 的适配分析

### 4.1 软类型原则完全兼容

新字段延续既有约定(docs/03-data-model):**任意键、无强制 schema、永不校验、永不阻止保存**。`provenance`/`reviewed`/`trust` 都是「给你看和给 agent 看的标签」,缺失时一切照常。这与 P4「永不 schema 校验或阻止保存(防止类型绑人)」一致。**不引入任何新校验代码。**

### 4.2 git 归因与 frontmatter 的分工(再明确一次)

| | git 归因(doc 11 §4) | provenance frontmatter(本报告) |
|---|---|---|
| 回答 | 「这个字节谁写的、哪个 turn、可回滚吗」 | 「这段知识认识论上从哪来、该多信、多久没复审」 |
| 形态 | turn 级快照 + `refs/agents/<id>` + writer 标注层 | 可选 frontmatter 键 |
| 消费者 | 活动面板(看 diff / 撤销) | QQL Health 查询 / 图谱 / 人眼 |
| 覆盖 | 含绕过 MCP 的 terminal/shell 写 | 只覆盖「写了 frontmatter」的笔记 |

**两者不重叠、互为兜底**:git 兜住「谁写的」事实(哪怕 frontmatter 没写 provenance);frontmatter 给出 git 读不出的语义。**本报告不动 git 归因,只补语义层。**

### 4.3 QQL 字段访问能力(本地实测,非推断)

**核实方法**:临时 cargo harness(path 依赖 `open-llm-wiki-core`)构造带 `provenance`/`reviewed` 字段的 fixture,逐条跑候选查询。结果(全部通过):

| 查询 | 结果 | 结论 |
|---|---|---|
| `WHERE provenance = "agent" AND NOT has reviewed SHOW title` | 只返回 agent 且无 reviewed 的页 | 任意键 `=` / `NOT has` ✅ |
| `WHERE type IN ("Concept","Entity","Summary") AND NOT has reviewed SHOW title` | 返回所有无 reviewed 的派生页 | `IN` + `NOT has` ✅ |
| `WHERE provenance = "agent" AND reviewed < "2026-05-08" SHOW title` | 只返回 reviewed 早于 cutoff 的 | 任意键 `<` + 日期串字典序 ✅ |
| `WHERE provenance = "agent" AND (NOT has reviewed OR reviewed < "2026-05-08") SHOW title` | fresh + stale 都命中 | 括号 `OR` 组合 ✅ |
| `RENDER group_by(provenance)` | 按 provenance 分组;缺失进 `(none)` 桶 | `group_by(任意键)` ✅ |
| `WHERE reviewed > "2026-06-01" SHOW title` | 只返回更晚 reviewed 的 | ISO 日期串按字典序比较正确 ✅ |

**由此确认:**
1. **QQL 能直接读任意 frontmatter 字段**(`FieldRef::Key(k)` → `field_value` → `n.frontmatter.get(k)`,见 `core/src/query.rs`)。**加字段 + 写查询零 core 改动。**
2. **QQL 无日期算术 / 无 `now()`**。「复审超 N 天」无法写成纯静态查询,需**运行者插值 cutoff**(运行 consolidate 的 agent/人知道今天日期,代入 `reviewed < "<today-N>"`)。或改用「`SORT reviewed ASC`」把最旧的排最前,由人/agent 目视判断(§5.3 给两种形态)。
3. **缺失字段语义**:`字段 = "x"` 对缺失为假、`字段 != "x"` 对缺失为真、`has 字段` 测存在;`group_by` 把缺失归入 `(none)` 桶。这些语义对「挑出没填字段的页」很关键(已实测)。

---

## 5. 工程方案(候选,需人拍板)

> 原则:**纯约定 + 模板 + 可选 UI,零新依赖,零 schema 校验,不阻止保存。** 字段一律可选。

### 5.1 约定设计:最小字段集

| 字段 | 取值 | 适用类型 | 含义 | 必填? |
|---|---|---|---|---|
| `provenance` | `human` \| `agent` \| `ingested` | 全部 | **谁产出**:`human`=人写;`agent`=AI 产出/综合;`ingested`=外部原样摄取 | 否(建议) |
| `reviewed` | `YYYY-MM-DD` | 主要 Summary/Entity/Concept | **最近复审日**(时间衰减锚点);写 ≠ 复审,只有人/流程确认后才更新 | 否(建议) |
| `trust` | `0`\|`1`\|`2`\|`3` | 可选,Concept 优先 | **显式信任级**:0=草稿/未核,1=agent 产出未复核,2=已复核,3=人确认/多源交叉 | 否(可选) |
| `confidence` | (别名,二选一) | 同上 | 若团队更习惯 `confidence`,语义等同 `trust`;**不要两个都留** | — |

**`provenance` 三值语义:**
- `human` —— 人原创/人主导写就。
- `agent` —— AI agent 产出或综合(绝大多数 Summary/Entity/Concept 由 ingest 工作流生成 → 默认 `agent`)。
- `ingested` —— 外部原样摄取、本 vault 无人创作(典型是 `Source`)。
- *(边界可混:人编辑过的 agent 草稿,建议「最后主导者」或标 `mixed`——是否要第 4 值见 §6 开放问题。)*

**与 `evidence_tier` 的关系(一句话):证据质量是输入,信任是结论。** `evidence_tier` 留在 `Source`(外部证据本身多好);`provenance`/`trust`/`reviewed` 落在派生页(这段知识谁产出、复核没)。两者可同时存在、互不替代。

**各类型 frontmatter 完整示例:**

`type: Source`(ingested 为主;保留既有 evidence_tier/last_verified)
```markdown
---
type: Source
status: Unprocessed
provenance: ingested
url: https://example.com/the-article
evidence_tier: analysis
last_verified: 2026-08-06
derived_into: "[[your-summary]]"
---
```

`type: Summary`(agent 综合;带 reviewed)
```markdown
---
type: Summary
status: Active
provenance: agent
generated: 2026-08-06
reviewed: 2026-08-06
source: "[[the-source]]"
mentions:
  - "[[some-entity]]"
---
```

`type: Entity`
```markdown
---
type: Entity
status: Active
provenance: agent
reviewed: 2026-08-06
related_to:
  - "[[another-entity]]"
---
```

`type: Concept`(最该标 trust)
```markdown
---
type: Concept
status: Active
provenance: agent
trust: 1
reviewed: 2026-08-06
related:
  - "[[a-related-concept]]"
---
```

### 5.2 写入路径自动盖章(谁写谁盖章)

**钩子位置与默认值规则(示意,L2 代码,需人拍板是否做):**

| 写入路径 | 钩子 | 默认 `provenance` | 说明 |
|---|---|---|---|
| MCP `write_note` | `mcp/src/main.rs` `tools_call` 的 `write_note` 分支 | `agent` | 外部 agent 经 MCP 写 → 盖 `agent` |
| ACP fs 写回调 | `app/src-tauri/src/acp.rs` 的 `FileWritePayload` writer 标注层(doc 11 §10 已存在) | `agent` | 应用内 agent 写 → 盖 `agent`;可复用现有 `writer` 元数据 |
| 应用内手动保存 | app `write_note` 命令 | `human` | 用户手敲保存 → 盖 `human` |
| Source 摄取 | ingest 工作流(docs/14 §1) | `ingested` | 摄取动作 → 盖 `ingested` |

**默认值纪律(防过度自动化):**
- **只补缺省,不覆盖**:笔记已有 `provenance:` 就**不动**。
- **`reviewed` 不在写入时自动盖**——写 ≠ 复审。`reviewed` 只在**显式复审动作**(consolidate/lint 确认、人点开「标为已复核」)时更新。否则会产生假安全感(§3.4)。
- **自动盖章是「提示」不是「保证」**:agent 可伪造,盖章只为降低排查成本。
- **业界先例**:Claude Code 对 agent 写入的带 frontmatter 的 memory 文件自动记录 `modified` ISO 时间戳、对无 frontmatter 的文件绝不补加[B2]——「只补缺省不覆盖」已被工程验证;差异在我们**不在写入时盖 `reviewed`**(写 ≠ 复审,另见 R1 git 噪音)。

> 说明:L1 阶段可**完全不做**自动盖章,纯靠模板约定 + agent 在 ingest 时手写。自动盖章是 L2 增量。

### 5.3 Health 即查询:新增 QQL 健康查询

以下 QQL 均按 `templates/wiki-starter/health/` 既有五条的写法构造,并经 §4.3 实测可解析、语义正确。可作为新的 `type: Query` 笔记交付,并进 `wiki_health_qql.rs` 式锁。

**① agent 产出且未复审(最该盯的)**
```qql
WHERE provenance = "agent" AND NOT has reviewed SHOW title
```
> agent 写了但从没人复核的页——投毒/错误的头号温床。

**② agent 产出且复审超期(cutoff 由运行者插值)**
```qql
WHERE provenance = "agent" AND (NOT has reviewed OR reviewed < "2026-05-08") SHOW title
```
> 把 `"2026-05-08"` 换成「今天 − N 天」。QQL 无日期算术,由跑 consolidate 的 agent/人代入当天 cutoff。「从未复审」与「复审太早」一并捞出(已实测括号 `OR` 可过解析)。

**③ 无 reviewed 的老页面(漂移风险,不限产出者)**
```qql
WHERE type IN ("Concept", "Entity", "Summary") AND NOT has reviewed SHOW title
```
> 对应漂移六型「没有复审日期的页面迟早安静地说谎」。

**④ 按 provenance 分组的知识构成**
```qql
WHERE type IN ("Concept", "Entity", "Summary") RENDER group_by(provenance)
```
> 一眼看清 vault 里「人写的 / agent 写的 / 摄取的」各占多少;缺失进 `(none)` 桶,也是「字段腐烂」的探针。

**⑤(可选,仅当采用 `trust`)低信任 agent 概念**
```qql
WHERE type = "Concept" AND provenance = "agent" AND trust < 2 SHOW title
```
> `trust` 存为数字则 `< 2` 走数值比较(`core/src/query.rs` `cmp_numeric_ordering` 已支持任意数字键)。

**⑥ 最旧复审在前(免插值的衰减视图)**
```qql
WHERE provenance = "agent" AND has reviewed SHOW title, reviewed SORT reviewed ASC LIMIT 20
```
> 不想插值 cutoff 时的替代:按复审日升序,最旧的排最前,由人/agent 目视对照今天判断是否超期。

> 语法要点(与 `types/query.md` 一致):子句只有 `WHERE/SORT/LIMIT/SHOW/RENDER`;**无 `GROUP BY`**(用 `RENDER group_by(<字段>)`);**无 `IS EMPTY`**(用 `NOT has <字段>` 或 `mentioned_in.len() = 0`);长度统一 `<字段>.len()`。

### 5.4 模板与文档更新清单

**`templates/wiki-starter/`(L1 纯模板,零代码):**
- `types/source.md` —— 字段表加一行 `provenance`(默认 `ingested`);最小实例 frontmatter 加 `provenance: ingested`。
- `types/summary.md` —— 字段表加 `provenance`(默认 `agent`)、`reviewed`;最小实例加两行。
- `types/entity.md` —— 字段表加 `provenance`、`reviewed`;最小实例加两行。
- `types/concept.md` —— 字段表加 `provenance`、`reviewed`、可选 `trust`;最小实例加两行 + 注释说明 `trust` 可选。
- `types/query.md` —— 语法要点无需改;可补一句「`NOT has <字段>` 可挑出没填字段的页」。
- `health/` —— 新增 4–5 条 `type: Query` 笔记:`agent-unreviewed.md`(①)、`stale-agent-notes.md`(②)、`unreviewed-pages.md`(③)、`knowledge-mix.md`(④)(、可选 `low-trust-concepts.md` ⑤)。每篇沿用现有 frontmatter(`type: Query`/`status: Active`/`metric: <slug>`)。
- `index.md` —— 「Health 查询」段加新查询的 `[[链接]]`。
- `examples/` —— 给 `example-summary.md`/`example-concept.md` 补 `provenance`/`reviewed` 示例行,让装好脚手架即可见非空健康结果。

**`docs/14-llm-wiki-workflow.md`:**
- §3.1 度量表补新 Health 查询(④ 条)。
- §3.2 修结构(lint)补一条:**「复审超期」**——`reviewed` 超 ~N 天(或 `provenance: agent` 且从未 reviewed)→ 人复核后更新 `reviewed`,确认无误可上调 `trust`;无法复核的标 `Contested`/记 Open gap。
- §5 不变量补一句:**`provenance`/`reviewed`/`trust` 为可选软字段,永不校验、永不阻止保存;写入路径只补缺省不覆盖。**

### 5.5 UI 可选面(纯 UI,可后置)

- **Inspector 徽章**:右栏 Inspector 在属性区显示 `provenance` 徽章(human/agent/ingested 三色)+ `reviewed` 相对时间(「3 天前复核」/「从未复核」)+ 可选 `trust` 星标。**标注:纯 UI 增强,不影响数据,可整期后置。**
- **陈旧提示条**:若 `provenance: agent` 且无 `reviewed`(或超期),编辑器顶部给一条不阻断的软提示(类似现有 broken-links 黄条)。**同样纯 UI、可后置。**
- 走 `vitest`(对齐既有 Inspector / broken-links 测试形态),不碰 core。

### 5.6 分期 L1/L2/L3 与测试影响

| 期 | 内容 | 代码量 | 测试影响 |
|---|---|---|---|
| **L1 纯约定 + 模板** | `types/*` 加字段说明与示例;`health/` 加 4–5 条查询;docs/14 补 lint 段 | **零 Rust / 零 TS** | 新 QQL 模板进 `core/tests/wiki_health_qql.rs` 式锁(解析 + 语义) |
| **L2 写入盖章 + 查询锁** | MCP `write_note` / ACP fs 回调 / app 保存按 §5.2 默认值补 `provenance`;健康查询落测试 | Rust(mcp + app 少量) | `cargo test -p open-llm-wiki-mcp`(盖章单测)+ `wiki_health_qql.rs` 新查询 |
| **L3 UI 徽章 / 提示条**(可选) | Inspector 徽章 + 陈旧软提示 | TS(纯 ui) | `vitest`(ui);不碰 core/app |

**关键**:L1 即完整可用(约定 + 模板 + 健康查询),**不依赖** L2/L3。若只批 L1,方案照样成立。

---

## 6. 风险与开放问题

| # | 问题 | 标注 |
|---|---|---|
| R1 | **字段是否进 git diff 噪音**:`reviewed`/`last_verified` 若被自动更新,每次 save 都改 frontmatter,污染 git 历史。需决定「哪些字段允许写入路径自动改」。 | **需人拍板** |
| R2 | **agent 自报 provenance 的可信度悖论**:被投毒 agent 会给自己盖 `human`/高 `trust`。盖章只能当线索,不能当证明。是否要「agent 写的 provenance 字段不允许 agent 自改」这类约束? | **需人拍板** |
| R3 | **`provenance` 要不要第 4 值 `mixed`**(人机合写):三值够不够用,还是加 `mixed`?默认三值,`mixed` 留作扩展。 | **需人拍板** |
| R4 | **`trust` vs `confidence` 命名,及要不要显式信任级**:不填可靠 `provenance`+`reviewed` 隐式推;显式级是增值还是负担? | **需人拍板** |
| R5 | **`reviewed` 的初始默认**:新建页要不要在创建时默认盖 `reviewed: <today>`?盖了会有「刚建就算复核过」的假信号;不盖则健康查询立刻报警。**建议不默认盖**,由首次真正复审核准。 | **需人拍板**(本报告建议:不盖) |
| R6 | **自动盖章的覆盖范围**:是只补 `provenance`,还是连 `generated`/`reviewed` 一起?建议只补 `provenance`,`reviewed` 只经显式复审。 | **需人拍板**(本报告建议:只补 provenance) |
| R7 | 健康查询的「超期阈值 N」:90 天?180 天?与 Source 的 `last_verified ~6 个月`是否统一口径? | **需人拍板**(建议与 `last_verified` 对齐 ~6 个月) |

**非风险澄清**:本方案**不引入 schema 校验、不阻止保存、不碰 core 求值器、零新依赖**,故无许可红线、无 CI 门新增负担(L2 起仅增既有 `cargo test -p` 范围)。

---

## 7. 引用来源

> 一手来源优先;标注 [一手] 为本次调研直接抓取/核实,[转述] 为引自上游 survey 已核实的二手结论。

**溯源模型**
- [P1][一手] W3C. *PROV-DM: The PROV Data Model*(W3C Recommendation)— https://www.w3.org/TR/prov-dm/ (Entity/Activity/Agent 定义、wasGeneratedBy/used/wasAttributedTo/wasDerivedFrom)
- [P2][一手] W3C. *PROV-O: The PROV Ontology* — https://www.w3.org/TR/prov-o/

**信任分级 / 记忆安全**
- [S1][一手] Dong, S. et al. *A Practical Memory Injection Attack against LLM Agents*(MINJA)— arXiv:2503.03704;NeurIPS 2025 — https://arxiv.org/abs/2503.03704
- [S2][一手] OWASP. *Agentic AI – Threats and Mitigations* / *Top 10 for Agentic Applications*(ASI06 Memory & Context Poisoning)— https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/ · https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- [S3][一手] Unit 42. *Indirect prompt injection poisons AI long-term memory* — https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory
- [S4][一手] Schneider, C. *Persistent memory poisoning in AI agents*(MINJA 防御栈:provenance tagging / write-ahead validation / trust-weighted retrieval / temporal decay / instruction stripping / circuit breakers / user confirmation)— https://christian-schneider.net/blog/persistent-memory-poisoning-in-ai-agents/

**时间衰减 / 双时序**
- [T1][一手] *Zep: A Temporal Knowledge Graph Architecture for Agent Memory* — arXiv:2501.13956(边 `valid_at`/`invalid_at`)— https://arxiv.org/html/2501.13956v1
- [T2][一手] Zep Blog. *Beyond Static Graphs: Engineering Evolving Relationships*(bi-temporal)— https://blog.getzep.com/beyond-static-knowledge-graphs/

**人机分工标注**
- [B1][一手] basic-memory(AGPL-3.0,仅概念参照). GitHub README:人机共写同一批 md(「AI and humans write to the same files; sync keeps them in step」),无 author/provenance/trust 字段 — https://github.com/basicmachines-co/basic-memory(2026-08-06 核实)
- [B2][一手] Claude Code. *How Claude remembers your project*(官方文档):CLAUDE.md 人写指令 vs auto memory agent 写;对 agent 写的带 frontmatter 文件自动盖 `modified` ISO 时间戳、对无 frontmatter 文件绝不补加(v2.1.214+);「context, not enforced configuration」— https://code.claude.com/docs/en/memory(2026-08-06 核实)
- Letta. *Memory blocks*(agent 自编辑 core blocks,可 read-only)— https://docs.letta.com/guides/agents/memory-blocks [转述自 survey §4.1]

**仓库事实(本次调研逐条打开核对)**
- `core/src/query.rs`(`FieldRef::Key` 任意 frontmatter 键、`cmp_numeric_ordering`、缺失字段语义)
- `core/src/qql.rs`(QQL 语法:`WHERE/SORT/LIMIT/SHOW/RENDER`、`has`、`group_by`)
- `core/tests/wiki_health_qql.rs`(五条健康查询的锁)
- `templates/wiki-starter/`(types/ 五类型、health/ 五查询、index)
- `docs/07-llm-wiki-architecture.md`(Health 即查询)、`docs/14-llm-wiki-workflow.md`(§3 consolidate/lint)、`docs/03-data-model.md`(软类型)、`docs/11-in-app-agent-roadmap.md` §4(git 归因)、`mcp/src/main.rs` + `mcp/README.md`(`write_note`)、`docs/open-questions.md` P4、[agent-memory-survey](./agent-memory-survey.md) §6.6/§7.2/§7.3

**调研方法与局限**:WebSearch/WebFetch 多路检索;PROV/MINJA/OWASP/Zep/Schneider/basic-memory/Claude Code memory 均为一手抓取核实。遗留二手项:Letta 行内归因细节沿用 survey §4.1 已核实转述;Obsidian Dataview 的 `reviewed` 属社区惯例、无官方文档(本次抓取其文档页 404,如实标注于 §3.3)。所有 QQL 结论为本地 `open-llm-wiki-core` 实测,非推断。

# 调研报告:内容级 lint —— 矛盾与知识漂移检测

> **性质**:调研 + 工程方案(候选稿)。第 5 节工程方案**只陈述、不拍板**;落地与否、先落哪一层,由人决定。
> **日期**:2026-08-06 · **上游**:`docs/research/agent-memory-survey.md` §6.5(失败模式表)/ §4.3(Cognee opt-in)/ §7.3(工具层「Lint 工具」段)。
> **调研问题**:两个页面在正文里说了冲突的话,系统能否发现?知识漂移能否机器查?判断权该归系统还是归 agent/人?

---

## 1. TL;DR

1. **现状的空白是结构性的**:OpenObsidian 现有 lint 全部在链接级(MCP `links` 六 kind)与计数级(`templates/wiki-starter/health/` 五条 QQL),`contradicts` 边纯靠人工在 frontmatter 标注;内容层(两页正文互相冲突)没有任何检查。QQL 谓词是**单笔记求值**(`core/src/query.rs::matches`),无跨笔记 join、无边类型过滤,这决定了「内容级检查为什么 QQL 做不了」——但**结构启发式的跨笔记部分**可以做成 core 纯函数。
2. **内容级矛盾检测是公认难题,不是成熟技术**:学界(NLI 模型)在「参考上下文不匹配」时错误率极高;LLM 成对判断贵且不稳(判断不一致、传递性矛盾);事实核查流水线的通行做法是先把页面拆成原子 claim、按实体对齐再逐对比——**候选生成 + 逐 claim 比较**,从不全量两两比较。
3. **候选生成是成本的决定项**:O(n²) 两两比较在千页 vault 上即百万对。成熟做法(实体解析/record linkage 的 blocking 传统)是先用廉价信号收敛:共享出链/共享标签(图)、共享邻居(二跳)、词汇重叠(倒排)、embedding 相似(向量)。OpenObsidian 已有前三者的全部原料(`Graph` 邻接 + `SearchIndex` 倒排 + tags),**零模型依赖**即可做候选生成。
4. **许可核查(一手核验,HF API 2026-08-06)**:常用 NLI 权重许可**并不统一**——`cross-encoder/nli-deberta-v3-base` Apache-2.0(~184M,带 ONNX/int8);`MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` MIT(多语含 zh/ja);`microsoft/deberta-large-mnli` 与 `facebook/bart-large-mnli` 均 MIT;但**不存在** `microsoft/deberta-v3-large-mnli` 这个模型(404),第三方 v3-MNLI 权重各家许可各异。MIT 红线可守,但必须逐个核。
5. **Cognee 的教训值得直译**:它把矛盾检测做成 opt-in、默认关——因为这是成本项与误报源,不是免费午餐。OpenObsidian 的对应设计:**系统只产候选 + 证据摘要,判断留给 agent/人**(agent-in-the-loop lint),候选宁缺勿滥;判断结果由 agent 经既有 `write_note`(带写后审计)落为 `contradicts` 边 + `status: Contested`,git 留审计轨迹。
6. **漂移六型的可查性差别很大**(§3.3 逐型判定):Terminology / Structure 漂移大部分可机器查;Source / Decision / Citation 漂移的**结构信号**(日期、状态字段、断链)可机器查,语义部分只能给 agent 提示;Concept 漂移只能查症状。六型里有三型的结构侧**今天就能用 QQL/图算表达**(§5.1 给了具体文本)。
7. **工程方案三层**:L1 纯结构启发式(零依赖,部分 QQL 可表达 + 部分 core 纯函数);L2 agent-in-the-loop 内容 lint(先出工作流文档、按需再出 MCP 工具,两案对比见 §5.2);L3 可选自动判(本地 NLI 或外部 LLM,远期、条件触发)。**建议顺序 L1 → L2-doc → L2-tool →(视数据)L3**,每层独立可停。
8. **优先级定位(2026-08-06 补记,方法论详见 [survey §7.4](./agent-memory-survey.md))**:本方向是四个调研方向中**品味依赖度最低**的一个,排序 P1(1–3 天):L1 检查的是 doc 14 已写成文约定的自洽性(contradicts↔Contested 双向一致、同名静默撞解析等)——不变量成立与否是事实,不是品味判断,无需等待任何观察信号;约定今天就存在,缺的只是守约者。仅个别规则宽严参数(如 L1-A 方向宽松度)需人拍板。
9. **落地状态(2026-08-06)**:L1 core ✅(`core/src/lint.rs`);L2-doc ✅([`docs/14`](../14-llm-wiki-workflow.md) §3.2.3 agent 五分类工作流);L2-tool / MCP(`B-WIKI-LINT-MCP`)与 UI 暂不做;L3 远期。

---

## 2. 问题与现状

### 2.1 已有的链接级 / 计数级 lint(全部对照仓库事实)

| 层 | 现有能力 | 位置 |
|---|---|---|
| 链接级 | `links` 六 kind:`backlinks` / `forward` / `dead`(全库或 scoped)/ `orphans`(incoming/outgoing/both)/ `hubs`(top-limit 度数)/ `suggest`(他者标题出现在正文却未链接) | `mcp/src/main.rs` `links_kind()`;`mcp/README.md` |
| 写时审计 | `write_note` 返回 `broken_links[]` + `orphan_hint`(写后即审,提示不阻断) | `mcp/src/main.rs` `audit_note()` |
| 读时简报 | `read_note` 附 graph 简报(backlinks/forward/dead/in_degree/out_degree) | `mcp/src/main.rs` `links_brief()` |
| 计数级 | 五条 Health QQL:Contested 计数、孤儿、概念饥饿度、证据分布(`group_by(evidence_tier)`)、单源概念(`mentioned_in.len() < 2`) | `templates/wiki-starter/health/*.md`;语义由 `core/tests/wiki_health_qql.rs` 锁 |
| 矛盾 | `contradicts` 只是 frontmatter 关系边;ingest 约定「写下 contradicts 时把被反驳 Concept 改 `status: Contested`」;consolidate 约定「核实 Contested 两边是否还成立」——**全程人工** | `docs/03-data-model.md` 关系节;`docs/14-llm-wiki-workflow.md` §1.4 / §3.2 |

### 2.2 内容层的空白

- 两个 Summary 对同一实体写了互斥的断言——**系统无任何信号**;唯一的暴露面是 agent 恰好同时读到两页。
- 上游调研记录的失败模式在此全部敞口:「矛盾被抹平成含糊折中」「页面看起来干净、实际已经错了」「没有复审日期的页面迟早会安静地说谎」(agent-memory-survey §6.5,源自 Glukhov[11])。
- Karpathy 三工作流中 Lint 被调研定性为「wiki 路线的生死线」;`docs/14` §3.2 现有 lint 段(断链 / 孤儿 / 缺交叉引用 / 陈旧 Source / 矛盾人工核实)**全是结构与计数**,矛盾一条写的是「人工核实」。本报告就是给这一段加「内容级」能力。

### 2.3 引擎边界的硬事实(决定方案的形状)

1. **QQL 谓词单笔记求值**:`query::eval` 对每个笔记独立跑 `matches(p, n, graph, id)`;`.len()` 只够到度数(`mentioned_in.len()`=入度、`links.len()`=出度)与 frontmatter 列表长度,**不能按边类型过滤、不能跨笔记 join**。所以「谁链了我」可查,「链我的边是不是 contradicts」不可查。
2. **core 纯逻辑 IO-free**(`AGENTS.md` 架构红线):任何新检查的判定逻辑必须是 `&[Note] + &Graph` 上的纯函数,才能进 core + TDD。
3. **解析索引 first-wins**:`graph::ResolveIndex` 对 title/alias/path/filestem 取首个命中;两页同名时链接**静默解析到第一篇**——这本身就是一个该被 lint 的隐患(§5.1 L1-B)。
4. **倒排索引可复用**:`SearchIndex`(标题 ×2 加权、AND 语义)的 term→docs 倒排表是词汇重叠候选生成的现成原料;但注意其分词对中文的局限(§5.2 诚实标注)。

---

## 3. 技术调研

### 3.1 矛盾检测的三条技术路

**路线 A:NLI 模型(句对三分类 entail/neutral/contradict)**
- 机制:把两条断言作为 premise/hypothesis 喂给交叉编码器,输出三分类概率;contradiction 高置信即候选。这是事实核查里「verifier」阶段的标准件。
- 证据:FEVER 流水线把验证定义为 SUPPORTS / REFUTES / NOT ENOUGH INFO 三分类(与 NLI 同构)[F1];NLI 是零样本分类与幻觉检测的常用内核。**但负面证据同样硬**:NLI 模型对「语境/指称不匹配」的句对极脆弱——2025 年一项研究发现,当句对的指称语境错位时,finetuned NLI 与 few-shot LLM 都产生 >80% 的错误判断(REFNLI,NAACL Findings 2025;证据强度:二手转述,未直读原文)。wiki 里两条断言常省略各自语境(版本、时间、适用范围),正是这类错位的高发区。
- 许可与规模(一手核验,HuggingFace API,2026-08-06):

  | 模型 | 许可 | 规模 | 备注 |
  |---|---|---|---|
  | `cross-encoder/nli-deberta-v3-base` | **Apache-2.0** | ~184M(safetensors 实测) | 英;带 ONNX 及 int8 量化变体 |
  | `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` | **MIT** | base 级 | **多语含 zh/ja**;MNLI+XNLI+FEVER+ANLI+WANLI+LingNLI 混训 |
  | `microsoft/deberta-large-mnli` | **MIT** | ~400M 级 | DeBERTa v1,2021 后未更新 |
  | `facebook/bart-large-mnli` | **MIT** | ~400M 级 | 零样本分类经典件 |
  | `microsoft/deberta-v3-large-mnli` | **不存在(404)** | — | 第三方 v3-MNLI 权重各家许可不一——「DeBERTa 系 MNLI 许可不统一」属实 |

- 结论:许可可过 MIT 红线(选 MIT/Apache 权重即可),成本是体积(base 级数百 MB、large 级 >1.5GB)与误报;且 NLI 只判**句对**,仍需要前置的 claim 切分与候选生成。

**路线 B:LLM-as-judge 成对判断**
- 机制:把候选对 + 各自关键句喂给 LLM,问「是否矛盾、属哪种冲突」。正是 `docs/14` 里 agent 的角色——**在 OpenObsidian 的形态里,agent 本来就是那个 judge**。
- 证据:LLM-as-a-judge 综述确认成对比较是主流范式;但 judge 自身有一致性问题——TrustJudge(arXiv 2509.21117)实测 LLM 成对判断存在**传递性不一致**(A>B、B>C 却 C>A 类矛盾),相当比例源自「打平」判断的不稳定。成本按对数线性涨,且每次判断不可复现(非确定性)。
- 结论:判断质量上限高于 NLI(能利用版本/时间/范围语境),但**贵、不稳、不可单测**——适合放在 agent 侧按需触发,不适合做成系统内自动门。

**路线 C:claim 抽取 → 实体对齐 → 逐对比较(事实核查流水线)**
- 机制:不比较整页,先把每页拆成原子 claim(FActScore 的 atomic facts[AF];SAFE 的「分解→过滤→逐条检索验证」[SAFE];ClaimDecomp 把复杂 claim 拆成子问答[CD]),按主体(entity/subject)归组,组内两两比 status/date/version/scope。
- 证据:Glukhov 的 LLM Wiki 矛盾工作流与这条流水线同构:「Extract claims → Find related pages → Extract claims → Group claims by subject → Compare status/date/version/scope → Classify → Contradiction report → Human or agent-assisted resolution」[11]。并给出五分类替代二元判断:**real contradiction / version difference / scope difference / terminology difference / unresolved uncertainty**——多数「表面矛盾」其实是后四种。
- 结论:这是三条路里**唯一被 wiki 维护实践直接验证**的路线;它把「谁来判断」显式留在最后一步(人/agent),与 §4 的推荐一致。抽取与对齐在 OpenObsidian 里可由 agent 完成(L2),不需要系统内置 NLP。

### 3.2 候选生成策略(O(n²) 为什么不可行)

- **算术**:1,000 页 vault 两两比较 = 499,500 对;每对若走 LLM judge 按 ~1k token 输入估,一轮 lint ≈ 5 亿 token——不可行。即使本地 NLI,base 级模型 CPU 上每对数十~百毫秒量级,50 万对也是数小时起步。**候选生成不是优化项,是前提。**
- 实体解析(record linkage)领域对这个问题有 40 年的成熟答案,统称 **blocking / candidate generation**:先用廉价键把记录分块,只在块内/邻域内比较,用 reduction ratio(压缩了多少对)与 pair completeness(漏了多少真对)两个指标权衡(Papadakis et al.,《An Overview of End-to-End Entity Resolution for Big Data》,ACM Computing Surveys;Christen,《Data Matching》)[ER1][ER2]。
- 四种收敛手段 → OpenObsidian 的对应物:

  | 手段 | 原理 | OpenObsidian 现成原料 | 依赖 |
  |---|---|---|---|
  | 同键分块(key blocking) | 同标签/同类型才比 | frontmatter `tags`、`type` | 零 |
  | 共享邻居(图) | 链到同一页的两页更可能谈同一件事 | `Graph` 出入邻接(outgoing/backlinks) | 零 |
  | 倒排重叠(词) | 共享高信号 term 的页对 | `SearchIndex` 的 term→docs 表 | 零 |
  | embedding 近邻(向量) | 语义相似门槛 | **无**(P6-5 默认关向量) | 模型依赖 |

- 图谱方法对收敛的启发:wiki 里「谈同一件事」几乎总表现为**共享出链**(都 `[[mentions]]` 同一 Entity)或**共享入链**(被同一 Summary 引用)。这两条图信号比词汇信号更贴 wiki 的写作纪律(docs/14 §5:「引用一切」),应作为候选生成的第一优先。
- 向量的位置:仅当图/词信号都不够时才需要,且与 agent-memory-survey §7.2-4 一致(P6-5 维持默认关,规模阈值触发再评估)——候选生成不构成引入向量主索引的理由。

### 3.3 漂移六型:逐型可查性判定

依据 Glukhov 的六型分类[11]与 agent-memory-survey §6.5,逐型判定「机器可查的部分」:

| 漂移型 | 含义(Glukhov) | 机器可查部分 | 判定 | 判定手段 |
|---|---|---|---|---|
| Source drift | 源变了(新版本/新政策),旧页仍像对的 | 复审日期字段缺失/过期(`last_verified`、`review_after`) | **结构可查** | QQL(ISO 日期串可序比较) |
| Concept drift | 同一词的含义漂移、被静默合并 | 症状:同名多页、一个 Concept 页入度异常高却无 glossary 结构 | **症状可查** | QQL group_by + 图函数 |
| Terminology drift | 同一事物多个叫法 | **高度可查**:重复 title、alias 撞名、近似标题 | **大部分可查** | QQL group_by + core 纯函数(归一化/编辑距离) |
| Decision drift | 旧决策没标 Superseded、仍被当当下用 | 状态机结构:`Superseded` 页仍被 Active 页以普通边引用;Superseded 无替代链接 | **结构可查,语义靠人** | core 图函数 |
| Citation drift | 引文还在、句子已不再被支持 | 内部断链(`links kind=dead` 已有);claim↔source 是否仍支持**不可机器判** | **半可查** | 已有工具 + agent 读 |
| Structure drift | 孤儿累积、重复页、索引落后 | 基本全可查(orphans/hubs/suggest 已实现大部分) | **大部分已查** | 现有 `links` |

**Citation drift 的外部证据**:链接腐烂是大规模实证现象——Pew Research(2023):2013 年存在的网页 38% 已消失、23% 的新闻文章引用了死 URL、**54% 的英文 Wikipedia 条目参考文献含死链**;美国最高法院判例引用研究(2013)发现 49% 链接已死;McCown et al.(2005)实测被引 URL 十年存活率约 50%(汇总见 [LR])。「引文还在、断言失去支持」不是假设,是引用寿命的常态。

**诚实标注一个现有盲区**:`links kind=dead` 只覆盖 **wikilink** 悬空;正文里的外部 URL(http 引文)不在图谱边里,今天完全没有检查。补上它(正则提 URL + 可选活性探测)属于网络 IO,与 core IO-free 原则冲突,应放 MCP/app 层或交给 agent 巡检——本方案不主张现在做,只记录缺口。

结论:六型中**没有一型的语义侧是机器能终审的**;但 Terminology / Structure 全侧与其余三型的结构侧,足以构成一张可日常运行的 lint 清单。Glukhov 的维护指标表把「contradiction reports open / resolved」列为健康指标——即**未决矛盾候选数本身就该是个 Health 查询**(§5.4)。

### 3.4 误报治理与 opt-in 教训

- **Cognee 案例**(agent-memory-survey §4.3[40]):Cognee 的 cognify 管线六步任务含矛盾检测,但它是 **opt-in、默认关**。一个开源记忆平台把矛盾检测做成可选,传递的信号很直白:这件事的成本(算力 + 人审)与误报风险在生产中是净负担,除非用户明确要。OpenObsidian 若内置自动判,等于把别人默认关掉的东西默认打开。
- **狼来了效应**:矛盾检测误报的直接代价不是算力,是**信任**——agent 被喂了十个假候选之后,第十一个真候选也会被敷衍处理。静态分析领域有同构的老结论:工具误报率高时开发者直接忽略全部告警(「Why Don't Developers Use Static Analysis Tools?」PLDI 2013 一类研究的共识[SA1];证据强度:领域共识级,未逐篇核)。
- 代表系统的治理手法(综合 Glukhov[11] 与 LLM-as-judge 文献):
  1. **分级输出,不做二元判决**:五分类(real/version/scope/terminology/uncertainty)替代「矛盾/不矛盾」;
  2. **自动检测、审慎更新**:「Detect automatically. Explain clearly. Update deliberately. Review risky changes.」——语义检查只产报告,**不自动改写**;改 status 属高风险变更,要人审(Glukhov review levels 把「resolving contradictions」列入 high-risk);
  3. **阈值/置信度门**:只有高置信候选才上浮到人/agent 面前;低置信候选进报告不进门;
  4. **可回滚**:判断错了能撤——OpenObsidian 的 git 版本真相天然满足(改 status / 加 contradicts 都是可 `git restore` 的小 diff)。

---

## 4. 与 OpenObsidian 的适配分析

### 4.1 核心分歧点:判断权归谁

| 方案 | 形态 | 利 | 弊 |
|---|---|---|---|
| (a) 系统内置自动判 | core 内置 NLI/规则,自动改 `status: Contested` | 全自动 | 误报直接污染唯一状态真相(`status` 是 frontmatter 单真相,docs/14 §0);自动改 status 属 Glukhov 定义的 high-risk 变更;模型依赖染色 + 体积;不可单测的判定进 core 违反纯函数原则 |
| (b) 系统产候选 + 证据,判断给 agent/人 | lint 输出 = 候选对 + 各自关键句 + 共享邻居;agent 读后经 `write_note` 决定是否写 contradicts/Contested | 误报有人兜底;判断留痕(git diff 即审计);零模型依赖可起步;与「agent 经 MCP 干活」的既有形态完全一致 | 吞吐受 agent/人限;需要工作流纪律 |

**倾向 (b)**——理由:① Cognee 用 opt-in 投的反对票(§3.4);② OpenObsidian 的 MCP 面本来就有「写后即审」闭环(`broken_links`/`orphan_hint`),矛盾判断只是同一闭环上再加一类「读后证据包」;③ `contradicts`+`Contested` 的既有语义(docs/03、docs/14 §1.4)是**人/agent 的断言**,系统自动写会让这个语义失真。此结论为建议,**需人拍板**。

### 4.2 QQL 与 links 的边界

- QQL 能表达:单笔记谓词 + 度数 + 分组聚合 → **计数/清单类**(Contested 名单、重复 title 分组、日期过期名单)留在 QQL,继续走「Health 即查询」。
- QQL 不能表达:跨笔记 join、按边类型过滤 → **关系一致性类**(contradicts 两边 status、Superseded 仍被引用、同名撞车)必须做成 core 纯函数(或留给 agent 眼查)。
- `links` 六 kind 全是结构 → 内容层证据(关键句摘录)是新能力,放 MCP 新工具或 agent 自己 `read_note`,见 §5.2。

### 4.3 许可红线对内置 NLI 的约束

- 权重许可不统一(§3.1 表)是事实,任何引入须**逐个**核 HF license tag + 登记 `THIRD_PARTY_NOTICES.md`(AGENTS.md 义务);只选 MIT/Apache-2.0。
- 运行时:Rust 侧候选为 `ort`(ONNX Runtime 绑定)或 `candle`(纯 Rust 张量),许可均为 MIT/Apache 系——引入前仍需核版本(见 §5.6)。
- **捆绑模型权重分发**会显著改变 app 体积与许可审计面,L3 应做成用户自行下载(opt-in),不进默认分发。

---

## 5. 工程方案(候选,需人拍板)

### 5.0 设计原则

1. **只产候选,不自动改 status**——任何 lint 输出都是「报告/候选」,写 `contradicts`、改 `Contested` 永远是 agent/人经 `write_note` 的显式动作。
2. **判断留给人/agent**——系统的职责到「给出证据包」为止;五分类(§3.1 路线 C)作为候选的分类词汇,而不是二元判决。
3. **宁缺勿滥**——候选生成宁可漏(靠多信号并集补召回),不可滥;每条候选必须带可解释的 signal(为什么这对被提名)。
4. **每层零依赖起步**——L1/L2 不加任何新依赖;模型只在 L3 且 opt-in。
5. **进 core 的必须纯函数**——所有判定逻辑 `&[Note] + &Graph → Vec<Finding>`,IO-free,TDD。

### 5.1 L1 纯结构启发式(零模型零依赖)

每条给可执行形态。**A/D/E 是 core 纯函数(QQL 表达不了的跨笔记检查),B/C 部分可用现成 QQL 直接跑。**

**L1-A contradicts ↔ Contested 双向一致性**(最值之一)
- 规则①:存在 `Relation("contradicts")` 边 A→B,但 B 的 `status` ≠ `Contested`(且 A 也 ≠)→ 报「矛盾边存在但无人 Contested」(ingest 约定 docs/14 §1.4 被漏执行)。
- 规则②:`type: Concept AND status = Contested` 但**无任何入向 contradicts 边** → 报「Contested 却无人反驳」(状态与图脱节)。
- 形态(core 纯函数):
  ```rust
  // core/src/lint.rs(新增)
  pub fn contradiction_consistency(notes: &[Note], g: &Graph) -> Vec<Finding>;
  // 实现:遍历 g.edges 中 kind == EdgeKind::Relation("contradicts") 的边,
  // 取两端 frontmatter.status 做规则①;再对每个 status=Contested 的节点,
  // 扫 backlinks 里有无 Relation("contradicts") 入边,无则规则②。
  ```
  配套 QQL(给人看的清单,已有):`WHERE type = "Concept" AND status = "Contested" SHOW title`

**L1-B 同名/别名撞车:疑似概念混淆**(最值之二)
- 规则:两个以上笔记共享归一化(小写、trim)后的 title 或 alias → 报疑似概念重复/混淆;且由于 `ResolveIndex` first-wins,撞名时链接**静默偏向第一篇**,这是实打实的解析隐患(`core/src/graph.rs` ResolveIndex)。
- QQL 可直接跑出粗筛(title 分组,count>1 即撞名):
  ```
  WHERE type IN ("Concept", "Entity") RENDER group_by(title)
  ```
  (局限:`group_by` 按原值分桶,大小写不归一;alias 撞名、title×alias 交叉撞 QQL 够不到。)
- 形态(core 纯函数,补齐 QQL 够不到的):
  ```rust
  pub fn duplicate_names(notes: &[Note]) -> Vec<(String, Vec<NodeId>)>;
  // 归一化 key = title.to_lowercase() 与每个 alias.to_lowercase(),
  // 分桶,len>1 的桶即报告。
  ```

**L1-C 陈旧 Source / 缺复审日期**(Source drift 结构侧)
- 现成 QQL 两条(ISO 日期串字典序可比较):
  ```
  WHERE type = "Source" AND last_verified < "2026-02-06" SORT last_verified ASC SHOW title, last_verified
  WHERE type = "Source" AND NOT has last_verified SHOW title
  ```
  (第一条的日期阈值由 lint 时点决定;缺字段的页不会被第一条捕获,故需第二条。)

**L1-D Summary 引用了 Superseded Source**(Decision/Source drift 交叉)
- 规则:`type: Summary` 且其 `source:` 指向的 Source `status = Superseded` → 报「派生知识挂在已废源上」(该 Summary 可能该重摄取或标 Superseded)。
- QQL 够不到(跨边 join),形态(core 纯函数):
  ```rust
  pub fn summaries_on_superseded(notes: &[Note], g: &Graph) -> Vec<Finding>;
  // 遍历 kind == Relation("source") 的边,目标 status=="Superseded" 即报。
  ```
  配套 QQL 粗筛(列出所有废源):`WHERE type = "Source" AND status = "Superseded" SHOW title`

**L1-E Superseded 页仍被 Active 页引用**(Decision drift)
- 规则:Active/Contested 笔记的出边指向 `status: Superseded` 的笔记且边非 contradicts → 报「旧决策/旧结论仍被当当下引用」(Glukhov:superseded 应被链接标注替换关系,而非被静默引用)。
- 形态(core 纯函数):
  ```rust
  pub fn refs_to_superseded(notes: &[Note], g: &Graph) -> Vec<Finding>;
  // 遍历所有 Resolved 边,目标 status=="Superseded" 且源 status ∈ {Active, Contested} 且
  // kind ∉ {Relation("contradicts"), Relation("superseded_by")} 即报。
  ```

### 5.2 L2 agent-in-the-loop 内容 lint

**候选生成(core 纯函数,零模型)**——三信号并集,每条候选记录命中了哪些 signal:
1. `shared_link`:两 Concept/Summary 的出边指向同一 Entity/Concept(`Graph::outgoing` 交集);
2. `shared_tag`:frontmatter `tags` 有交集;
3. `term_overlap`:倒排(`SearchIndex` 内部 term→docs)上的高信号词重叠分(仅英文可靠——`search::tokenize` 按非字母数字切分,中文连续文本会被切成大粒度长 token,重叠信号对中文 vault 显著变弱,应主要依赖 1、2)。

**两案对比:**

| | 案一:只出工作流文档(零代码) | 案二:新增 MCP 工具 `lint_content` |
|---|---|---|
| 形态 | `docs/14` §3.2 增补「内容 lint」段:agent 用既有 `search_notes` + `links(kind=backlinks/suggest)` + `read_note` 组合,按 Glukhov 五分类出报告 | 新工具产候选对 + 证据包,agent 只管判断与落笔 |
| 输入 | — | `{"scope": "vault" \| {"path": "..."} \| {"type": "Concept"}, "limit": 20}` |
| 输出 | agent 自拟 | `{"candidates": [{"a": "con-x.md", "b": "con-y.md", "signals": [{"kind": "shared_link", "target": "ent-z.md"}, {"kind": "term_overlap", "score": 0.38}], "shared_neighbors": ["sum-1.md"], "excerpts": {"a": "…关键句…", "b": "…关键句…"}}], "policy": "candidates only; judgement belongs to agent/human"}` |
| 成本 | 0 行代码,明天可用 | core 候选生成纯函数 + MCP 接线 + 测试 |
| 弱点 | 候选召回取决于 agent 纪律,不可测、不可复现 | 需要维护面;excerpts 的「关键句」无 NLP 只能取粗粒度(标题段首句/含共享实体的行) |
| 建议 | **先做**:它同时是案二的需求探针(哪种 signal 真有用,跑几轮就知道) | 工作流跑稳后再做;`generate_handler!` 不涉及(app 层),只改 `mcp/` |

**案一的工作流形态**(可直接并入 `docs/14` §3.2):
1. 选一页 `type: Concept`(优先 Contested / 单源 / hub),`read_note` 读透;
2. `links kind=backlinks` + `run_qql` 的 `group_by`/tag 查询找「谈同一件事」的邻居页;
3. 逐页 `read_note`,按 Glukhov 五分类比对关键断言(real / version / scope / terminology / uncertainty);
4. 确认 real contradiction → `write_note` 写 `contradicts:` + 被反驳方 `status: Contested`;其余四类按各自路径消化(version → 标 Superseded;terminology → 合并/别名;scope → 拆开语境);
5. 未决的记进 `index.md` Open gaps,作为下次 ingest 的方向(接 docs/14 §2.5)。

无论哪案,agent 的判断动作都走既有路径:确认矛盾 → `write_note` 写 `contradicts:` 并把被反驳方改 `status: Contested`(docs/14 §1.4 已有约定);`write_note` 的 `broken_links` 审计天然兜底。

### 5.3 L3 可选自动判(远期、条件触发)

- **形态一:本地 NLI 候选打分器**——对 L2 已收敛的候选对(百对量级,非全库)跑 NLI,contradiction 概率只作**排序信号**,不作判决。候选运行时:`ort` 或 `candle`(许可引入前核版本);权重只认 MIT/Apache 且优先多语(如 `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`,MIT、含 zh);**权重不捆绑分发**,用户 opt-in 下载。
- **形态二:外部 LLM judge**——不写进本仓库任何代码,就是 agent 自己在 L2 里做的成对判断(路线 B);成本与不稳由 agent 的使用者承担。
- **触发条件(全满足才评估)**:① L2 运行数据表明候选积压(如连续数周未决候选 > 20 对)成为实际瓶颈;② 已有候选判断留痕可估误报率(建立基线);③ 许可审计完成并进 `THIRD_PARTY_NOTICES.md`;④ 人批准。此层**标注为远期**,不在当前版本规划内主张。

### 5.4 与 Health 即查询的衔接

- 新增 `type: Query` 模板(沿用 `templates/wiki-starter/health/` 形态 + `core/tests/wiki_health_qql.rs` 锁法):
  - `stale-sources.md` → L1-C 两条 QQL;
  - `duplicate-titles.md` → `WHERE type IN ("Concept", "Entity") RENDER group_by(title)`;
  - `contested-concepts.md` 已有,不动。
- **QQL 够不到的三条**(L1-A/D/E 是图函数)不进 Health 模板;其计数若要成指标,由 L2 工具返回或 agent 把报告写进 `index.md` 的维护段(Glukhov 的 markdown dashboard 形态),不强行塞进 QQL——避免为凑 IR 扭曲引擎。
- 「未决矛盾候选数」作为健康指标:候选一旦被 agent 落为 contradicts 边,即回到既有 `contested` Health 查询的射程——**候选漏斗的两端各有查询守着**。

### 5.5 测试与 CI 影响

- **core(TDD 主场)**:L1-A/B/D/E 全是 `&[Note]+&Graph` 纯函数,按仓库惯例单测 + proptest(仿 `graph.rs` props);新 QQL 模板进 `wiki_health_qql.rs` 锁「能解析 + 语义对」。→ 自动落入 CI job ①(`cargo test -p openobs-core`)。
- **mcp**:若做 L2 工具,测试仿 `mcp/src/main.rs` 现有 fixture 风格(tempdir vault + `tools_call`)。**诚实标注:当前 CI(`.github/workflows/ci.yml`)只跑 `openobs-core` 与 `openobs-app`,mcp crate 的既有测试并不在 CI 门里**——新增 mcp 测试要不要进 CI 门(改 ci.yml 加 `cargo test -p openobs-mcp`),需人拍板。
- **ui/app**:本方案不碰 app 命令层与 ui(除非未来做 lint 结果面板,非本方案范围)。e2e 门不受影响。

### 5.6 新增依赖与许可

- **L1 / L2-doc**:零新增依赖(仅既有 core/mcp)。
- **L2-tool**:零新增依赖(serde/walkdir 等已在)。
- **L3**(若触发):运行时 `ort`(MIT,依赖预编译 ONNX Runtime——引入前核其分发形态)或 `candle`(MIT/Apache-2.0);NLI 权重逐模型核 HF license tag(§3.1 表已核四个,结论:存在可用 MIT/Apache 选项,含中文多语);全部登记 `THIRD_PARTY_NOTICES.md`;**GPL/AGPL 一票否决**;权重不进默认分发包。

---

## 6. 风险与开放问题

| # | 问题 | 倾向 | 需人拍板? |
|---|---|---|---|
| 1 | 判断权归系统还是 agent/人 | 强烈倾向 agent/人(§4.1 (b)) | **是** |
| 2 | L2 先出工作流文档还是直接出 `lint_content` 工具 | 先文档、用实践喂工具设计 | **是** |
| 3 | mcp crate 测试是否进 CI 门 | 进(现状是漏洞),但要改 ci.yml | **是** |
| 4 | L3 触发阈值(候选积压数、误报基线) | 无实测数据,不预设数字 | **是**(远期) |
| 5 | 候选生成对中文 vault 的召回 | 词法信号弱,图/标签信号为主;实测前不下结论 | 否(诚实标注即可) |
| 6 | L1-A 规则①的宽严:contradicts 边的「被反驳方」方向性是否可信(frontmatter 里谁指向谁由人手写,可能写反) | 首版双向宽松(任一端 Contested 即过),减少误报 | **是** |
| 7 | 误报率无任何实测数据——本报告所有「可行」判断基于结构推理与文献类比,非实测 | 上线 L1/L2 后先记一轮数据再谈 L3 | 否 |
| 8 | NLI 路线的语境脆弱性(§3.1 REFNLI,二手证据) | 若上 L3,权重选型后须自建小规模 fixture 评测 | **是**(远期) |

---

## 7. 引用来源

**仓库事实**(断言均已对照)
- `mcp/src/main.rs`(links 六 kind / write 审计 / read 简报 / suggest)、`mcp/README.md`
- `core/src/graph.rs`(EdgeKind/ResolveIndex first-wins)、`core/src/search.rs`(倒排 + 标题加权 + tokenize)、`core/src/qql.rs` + `core/src/query.rs`(单笔记谓词求值边界)
- `templates/wiki-starter/health/*.md`、`core/tests/wiki_health_qql.rs`(Health 即查询的锁法)
- `docs/14-llm-wiki-workflow.md` §3.2 / §1.4、`docs/07-llm-wiki-architecture.md` §3、`docs/03-data-model.md`(contradicts 边)、`.github/workflows/ci.yml`、`AGENTS.md`
- `docs/research/agent-memory-survey.md` §4.3 / §6.5 / §7.2-4 / §7.3

**外部来源**
- [11] Glukhov, R. *LLM Wiki Maintenance: Drift, Contradictions and Review*(2026-07,全文直读)— https://www.glukhov.org/knowledge-management/knowledge-systems-architectures/compiled-knowledge/llm-wiki-maintenance-knowledge-drift
- [F1] Thorne et al. *FEVER: a Large-scale Dataset for Fact Extraction and VERification* — https://aclanthology.org/N18-1074/
- [AF] Min et al. *FActScore: Fine-grained Atomic Evaluation of Factual Precision* — arXiv:2305.14251
- [SAFE] Wei et al. *SAFE: Search-Augmented Factuality Evaluator* — arXiv:2403.18802
- [CD] Chen et al. *ClaimDecomp: Generating Complex Questions and Answers from Wikipedia for Fact-checking* — arXiv:2212.05221
- [KC] Xu et al. *Knowledge Conflicts for LLMs: A Survey* — arXiv:2403.08319
- [TJ] *TrustJudge: Inconsistencies of LLM-as-a-Judge* — arXiv:2509.21117
- [ER1] Papadakis et al. *An Overview of End-to-End Entity Resolution for Big Data*(ACM Computing Surveys)
- [ER2] Christen, P. *Data Matching: Concepts and Techniques for Record Linkage, Entity Resolution, and Duplicate Detection*(Springer)
- [SA1] Johnson et al. *Why Don't Software Developers Use Static Analysis Tools?*(PLDI 2013 一类研究的共识;证据强度:领域共识级)
- [LR] Wikipedia: *Link rot*(实证研究汇总:Pew Research 2023、McCown et al. 2005、美最高法院判例引用研究 2013 等)— https://en.wikipedia.org/wiki/Link_rot
- NLI 模型许可: HuggingFace API 逐模型核验(2026-08-06):`cross-encoder/nli-deberta-v3-base`、`MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`、`microsoft/deberta-large-mnli`、`facebook/bart-large-mnli`;并确认 `microsoft/deberta-v3-large-mnli` 不存在(404)
- REFNLI(NAACL Findings 2025)——NLI 语境错位脆弱性;证据强度:**二手转述**,仅作方向性信号

**诚实性说明**:外部检索中部分搜索结果由检索代理综合给出(标注处);模型许可为 HF API 一手返回;Glukhov 文为全文直读。厂商与模型下载量数字均带立场,本报告未采用任何厂商性能宣称。

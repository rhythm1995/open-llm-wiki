# 调研报告:知识库 / LLM Wiki 类项目如何作为 agent 长期记忆、提升 agent 能力

> **性质**:调研文档(deep-research,40 个来源、54 条证据持久化于 `~/Documents/Agent_Memory_Research_20260805/`)。
> **不是** AGENTS.md 级约定;第 7 节的差距/机会点只陈述分析,不替任何人拍板。
> 调研日期:2026-08-05 · 调研问题:文件优先知识库与 LLM Wiki 类项目如何作为 AI agent 的长期记忆、通过什么机制提升 agent 能力?

---

## 1. TL;DR(核心结论)

1. **「LLM Wiki 作为 agent 记忆」已从个人技巧变成行业共识**:Karpathy 的 LLM Wiki gist(三层架构 + index/log + Ingest/Query/Lint 三工作流)[1] 与 LangChain CEO Harrison Chase 的 Wiki Memory(「agent 维护的数据结构,预计算并维持高层综合,对比 RAG 查询时检索原始块」)[2] 在 2026 年上半年先后定调;DeepWiki(5 万+ 公开 repo 已索引)[23]、basic-memory[19]、Letta、Cognee 等是落地形态。
2. **三种记忆范式回答三个不同的问题**:RAG 问「这份文档说了什么?」,agent memory 问「这个用户跟我说过什么?」,LLM Wiki 问「我对这个主题知道什么?」[4]。它们不是竞争关系,是互补层。
3. **能力增益的真实杠杆不是「持久化」本身,而是「固化/综合 + 选择性检索」**。跨论文消融证据一致:Generative Agents 去掉 reflection 可信度从 29.89 掉到 26.88 [28];A-MEM 去掉 Memory Evolution 多跳 F1 从 45.85 掉到 31.24 [8]。只是把对话存下来没有用,把经验**重构**成可检索的高层形态才有用。
4. **增益的实证形态主要是成本与延迟,而非准确率上限**。mem0 对全上下文:token −90%(1,764 vs 26,031)、p95 延迟 −91%(1.44s vs 17.1s),但准确率 66.88 **低于**全上下文的 72.90 [29];Zep 对 MemGPT:延迟 −90%、上下文 token <2%(1.6k vs 115k)[30][32]。**记忆系统是在用少量准确率换数量级的成本**——全上下文塞入在准确率上仍是上界(LoCoMo 上 full-context 72.90 是最高分[29][37])。
5. **基准证据要打折看**:LoCoMo 上人类 F1 87.9 vs 最好 RAG 41.4,多跳/时序/对抗类问题是硬骨头[37];LongMemEval 上商业助手平均掉 30%(ChatGPT −37%、Coze −64%)[38];且厂商数字不可直接比较——Zep 的 LoCoMo 84% 宣称被 mem0 联创公开质疑,修正后 58.44%,虚高 25.56pp,手法是剔除对抗题、换模板、单次运行[33]。DMR 已近饱和(Zep 94.8% vs 全对话上界 98.2%)[30]。
6. **wiki 路线的失败模式已被反复记录**:维护坍缩(没人维护的 wiki 比没人维护的数据库更危险)[10]、六种知识漂移(Source/Concept/Terminology/Decision/Citation/Structure)[11]、错误累积甚至 model collapse(HN 社区原话)[9]、概念混淆(concept confusion)[3]、矛盾被「抹平」成含糊折中[11]。**Karpathy 的 Lint 工作流不是可选项,是生死线**。
7. **规模有阈值**:<100 篇结构化文档 → wiki;1,000+ → RAG;单次查询要载 >5-6 篇 → 切 RAG;~3K token 的 wiki 比 RAG 便宜,~30K 的 wiki 反而更贵[16]。wiki 路线是**小规模+高综合**的甜蜜点,不是无限扩展方案。
8. **记忆写入面是新攻击面**:记忆投毒已进 OWASP(ASI06);MINJA 经纯查询接口达成 >95% 注入成功率,「注入发生在二月,伤害发生在四月」[15];Unit 42 展示了经会话摘要持久 365 天、静默外泄的攻击链[14]。防御栈(溯源标注、写入前校验、信任加权、时间衰减)对任何「agent 可写 vault」的系统都是必修课[15]。
9. **反直觉的负面证据**:ETH Zurich 实证发现 LLM 生成的 AGENTS.md 类上下文文件让编码 agent 成功率**下降 ~3%**、推理成本 +20%;人写的才 +4%(且同样 +20% 成本)[12]。「给 agent 塞上下文文件」本身不产生价值,**质量与维护方式**才产生价值。
10. **对 OpenObsidian**:五层架构(Raw/Wiki/Schema/Navigation/Health)与 wiki-memory 范式高度同构,其中「Health 即查询」(QQL 存为 `type: Query` 笔记)是相对 Karpathy 原式的独有升级;MCP 7 工具已覆盖读时图简报 + 写时断链审计(正对应 wiki memory 的读/写两侧)。最大差距不在引擎,在**脚手架与约定**:没有 ingest/lint/consolidate 工作流的 starter vault(B-WIKI-STARTER/HEALTH-QQL/AGENT-DOC 均未建),没有「对话 → vault 蒸馏」管道,检索只有词法+结构(P6-5 默认不做向量——调研结论:对 wiki-memory 路线这**够用**,检索只是辅助而非记忆本体[5])。

---

## 2. 为什么 agent 需要长期记忆

**会话失忆。** Claude Code 官方文档开宗明义:「每个会话都从一个全新的上下文窗口开始」,跨会话知识只能靠 CLAUDE.md(人写)和 Auto memory(agent 写)两种机制搬运[21]。没有长期记忆的 agent 每次都在重复自我介绍、重复探索同一份代码库、重复犯同一个错。

**上下文窗口的经济学。** AWS Well-Architected Agentic AI Lens 指出:记忆系统的成本失控来自「不受控的上下文累积、低效的检索模式、持久状态存储」;把完整对话历史注入每次调用,token 成本随会话长度线性增长[18]。Generative Agents 的实验是极端例证:25 个 agent 模拟两天就烧掉数千美元的 token[28]。记忆的第一性收益是**把 O(会话长度) 的成本压成 O(知识体量)**。

**重复探索与知识不复利。** Karpathy 的核心论点:「知识被编译一次,然后保持更新,而不是每次重新推导」[1]。每次查询都从原始文档重新 RAG,等于每次从源码重新编译。LLM Wiki 把综合(compilation)提前到写入时,查询时只读成品。

**个性化与一致性。** LongMemEval 的实测:带真实历史会话的在线商业助手(ChatGPT 0.5773、Coze 0.3299)远低于离线读完全部历史的 GPT-4o(0.9184),分别掉 37% 和 64%[38]——**产品已经「有」记忆,但记忆的质量让能力掉了三分之一以上**。记忆不是有没有的问题,是做得好不好的问题。

---

## 3. 记忆分类学

| 维度 | 类别 | 含义 | 代表实现 |
|---|---|---|---|
| **内容类型**(认知科学三分) | episodic(情景) | 发生过什么:事件、对话、时间线 | log.md[1]、Letta archival[35]、basic-memory Observations[19] |
| | semantic(语义) | 我知道什么:事实、概念、关系 | wiki 页面[1]、Zep facts[32]、A-MEM 笔记[8] |
| | procedural(程序) | 我怎么做:规则、工作流、维护约定 | schema/AGENTS.md[1]、wiki lint 规则[5] |
| **存活时长** | working(工作记忆) | 当前上下文窗口内 | MemGPT main context[25]、Letta core memory blocks[34] |
| | long-term(长期) | 窗口外、可检索 | MemGPT recall/archival storage[25]、Letta archival(向量库)[35] |
| **组织分层** | OS 式虚拟内存 | 主存/外存分页换入换出 | MemGPT(分页检索 + heartbeat 链)[25] |
| | 三级缓存 | 短/中/长期,热度晋升淘汰 | MemoryOS(7 页对话队列 → 分段 paging → 长期画像)[27] |
| | 核/档双层 | 常驻上下文的可编辑块 + 海量归档 | Letta(core blocks 整块替换 + archival 向量检索)[34][35] |
| **综合时机** | write-time(写入时综合) | 摄入时即蒸馏成 wiki 页 | Karpathy Ingest[1]、LangChain wiki memory[2] |
| | query-time(查询时综合) | 查询时检索原始块现拼 | 传统 RAG[2][10] |

> **关键区分**[10]:「真正的设计变量是综合发生在写入时还是查询时」。写入时综合 = 复利资产 + 维护负担;查询时综合 = 无维护 + 每次重算。这条轴贯穿全文第 4 节。

MemGPT 的 OS 类比是这套分类学的源头[25]:LLM 的上下文窗口 = 内存,外部存储 = 磁盘,LLM **自己通过函数调用编辑记忆**(self-editing),用分页检索 + `request_heartbeat` 链实现「换页」。此后几乎所有记忆系统(A-MEM 的笔记操作[8]、Letta 的 blocks[34]、mem0 的 ADD/UPDATE/DELETE[29])都是这个「agent 自主读写自己记忆」范式的变体。

---

## 4. 三大 +1 技术路线

### 4.1 路线一:文件即记忆 / LLM Wiki(write-time 综合的文件系统)

**机制。** Karpathy 原式三层[1]:
- **Raw sources**——不可变输入文档,LLM 只读不改;
- **Wiki**——LLM 全权拥有的 Markdown 页面目录(「Obsidian 是 IDE,LLM 是程序员,wiki 是代码库」);
- **Schema**——CLAUDE.md / AGENTS.md 式配置文档,「让 LLM 成为有纪律的 wiki 维护者而非通用聊天机器人」。

导航靠两个文件:`index.md`(面向内容的目录)与 `log.md`(append-only 时间线);三个工作流:**Ingest**(一个源可能触碰 10–15 个 wiki 页)、**Query**(「好的答案可以归档回 wiki 成为新页面」——查询本身也复利)、**Lint**(健康检查)[1]。

LangChain 的提炼[2]:wiki 是「agent 维护的数据结构,以 agent 友好的方式表达源知识」;「不同于 RAG 通常在查询时检索原始块,wiki **预计算并维持一个高层综合**」;选文件是因为「可检视、可编辑、可版本化、agent 易读写」。

**代表项目与接口形态**:
- **AGENTS.md / CLAUDE.md 约定层**:Claude Code 把所有发现的记忆文件**拼接**(非覆盖)进上下文,`@import` 最深 4 跳;Auto memory 每会话载入 MEMORY.md 前 200 行/25KB;官方明确这些是「上下文,不是强制配置」,硬约束要靠 hooks[21]。
- **llms.txt**:Jeremy Howard 的网站级 LLM 入口提案(H1 名 + blockquote 摘要 + H2 URL 清单),本质是给爬取型 agent 的只读 wiki 首页[20]。
- **basic-memory**:markdown 文件即记忆,每个文件是 Entity,含 Observations(事实)与 Relations(关系),人机共写同一批文件、sync 保持一致;AGPL-3.0,MCP + CLI 接口[19]。
- **DeepWiki**(Cognition):给 GitHub repo 自动生成持续更新的 AI 文档 wiki(架构图 + 源码链接 + 摘要),5 万+ 公开 repo 已索引;MCP 免费无鉴权,工具 `read_wiki_structure` / `read_wiki_contents` / `ask_question`[23][24]。LangChain 文中另举 AutoWiki(随 repo 变化保持更新的代码库文档)[2]。
- **Anthropic 参考 memory MCP server**:本地知识图谱(Entity/Observation/Relation),9 个工具(create_entities、create_relations、add_observations、delete_*、read_graph、search_nodes、open_nodes),JSONL 存储[22]。
- **社区实践**:一篇被广泛引用的实践文记录了把 10,994 条个人笔记(5k+ Obsidian + 5k+ Readwise)保持为只读源池、另建项目级「AI Research OS」LLM wiki 作 agent 记忆的做法——agent 采用渐进披露(先 index.yaml,再源摘要,再派生页,最后才碰原始文件);项目 wiki 把 ~100 篇笔记压成 73 概念 + 18 实体;lint 步骤检查孤儿源、死链、过期断言、矛盾[3]。另有个人知识库直接经 MCP 暴露给 agent 的实践(hjarni.com)[6]与中文社区梳理的资源清单(TeleAI Awesome-Agent-Memory)[7]。

**优势**:人可读可审计(「可检视、可编辑、可版本化」[2]);git 天然给版本真相;综合在写入时完成,查询廉价;知识复利(「wiki 是持久的、复利的产物」[1])。实证上,一篇 2026 年的检索论文显示 LLM-Wiki 在**组合性(compositional)问题**上比 Dense RAG 高 15.6 F1[17]——正好是多跳综合类问题,wiki 的主场。

**劣势与边界**:摄入错误会扩散(一个源碰 10–15 页[1],错也扩散 10–15 页);页面需要持续的一致性维护[4];「wiki 不知道读者」[4];规模受限(见 §6.4 阈值[16]);HN 社区的尖锐批评:「这就是 RAG / 换皮的持久 RAG」「人连维护一个简单的 claude.md 都跟不上」「它会引入并累积微妙错误,递归重写可导致 model collapse」[9];维护失败的后果被 Nate Herkelman 说透:「被荒废的 wiki 比被荒废的数据库更危险」[10]。

**适用**:个人/项目级知识库(<100–1000 篇)、需要人机共读共写、需要审计与版本历史的场景。

### 4.2 路线二:向量 / RAG 记忆库(query-time 检索 + 抽取式记忆)

**机制。** 经典形态是对话/文档切块 → 向量化 → 查询时 top-k 检索原始块[2]。进化形态是**抽取式记忆**:不再存原始块,而是由 LLM 从对话中抽取原子事实,存入记忆库,查询时检索事实条目——mem0 是代表:记忆管理器以工具调用形式决定每条新信息是 ADD(新建)、UPDATE(增补)、DELETE(删除被矛盾的记忆)还是 NOOP[29]。

**代表项目**:mem0(开源 + 托管,含图变体 mem0g)[29];MemoryOS(学术系统,三级缓存见 §3,LoCoMo 上 GPT-4o-mini 平均 +49.11% F1、时序题 +118.80%,多跳 F1 41.15 高于 MemGPT 25.52)[27];supermemory 等托管产品(本次调研未深挖)。

**证据**。mem0 在 LoCoMo 上:LLM-as-Judge 66.88 vs OpenAI 内置记忆 52.90(相对 +26%)、vs 最好 RAG 60.97;p95 延迟 1.44s vs 全上下文 17.1s(−91%);token 1,764 vs 26,031(−90%+);图变体再高 ~2%[29]。**但要诚实记录反例:同一基准上 full-context 72.90 高于 mem0 的 66.88**[29]——准确率上界仍是把一切塞进窗口,记忆系统的卖点是成本/延迟,不是准确率。

**优势**:规模上限高、免维护(无 wiki 页面腐化问题)、接入简单。**劣势**:原始块检索缺高层综合(「问的是文档说了什么,不是我知道什么」[4]);抽取式记忆的抽取步骤本身会丢信息或引入错误;LoCoMo 显示基于摘要/观察的检索在对抗题上崩(长上下文对抗 F1 崩到 2.1)[37]。

**适用**:大规模(1,000+ 文档)、高频变化、查询模式以单跳事实查找为主的场景[16]。

### 4.3 路线三:知识图谱记忆(结构化综合 + 图检索)

**机制。** 把记忆组织为实体-关系图,检索从「向量近邻」变成「图上游走」,天然支持多跳与时效推理。

**代表项目**:
- **Zep / Graphiti**:时序知识图谱——**边上存事实的生效日与失效日**(invalidation time),原语含 facts、episodes、summaries、observations;文档宣称亚 200ms 检索[32]。论文数据:DMR 上 GPT-4-Turbo 94.8%(vs MemGPT 93.4%、递归摘要 35.3%、全对话上界 98.2%);LongMemEval 上准确率较 MemGPT 最高 +18.5%,延迟 −90%(中位 2.58s vs 28.9s),上下文 token 1.6k vs 115k(<2%)[30][31]。时序失效边直接命中 LongMemEval 五能力中的「知识更新」与「时序推理」[38]。
- **Cognee**:开源 AI 记忆平台,API 四词:remember / recall / forget / improve;`cognify` 管线把摄入数据转成知识图谱(块、向量、摘要、节点、边),六步有序任务中含**可选的矛盾检测**(默认关);混合向量+图检索;自研 BEAM 基准 100K token 处 0.79 vs 此前 SOTA 0.735(官方自己标注为「方向性信号」)[39][40]。
- **HippoRAG**(学术):受海马体索引理论启发——LLM 抽开放 KG 三元组 + 同义边,查询实体做 Personalized PageRank 种子;单步召回 recall@5 平均 72.9 vs ColBERTv2 65.6(2WikiMultiHopQA 上 89.1 vs 68.2),比迭代检索便宜 10–30 倍、快 6–13 倍;错误集中在 NER/OpenIE 与图搜索,可扩展性未验证[26]。
- **Anthropic reference memory MCP**(§4.1 已列)是最小图谱形态[22]。

**优势**:多跳/时序/知识更新类问题的结构性优势;边时效让「知识更新」成为一等操作(旧事实不删、标记失效)。**劣势**:抽取与构图成本高;图质量受 NER/OpenIE 错误制约[26];「忘记」与矛盾处理需要显式机制(Cognee 把矛盾检测做成 opt-in 不是偶然[40]);厂商宣传数字需警惕(见 §6.3 Zep 争议[33])。

**适用**:多 agent 共享、事实时效性强、需要跨会话多跳推理的产品级场景。

### 4.4 +1 路线:Agentic / 混合记忆(元层:谁来写、何时固化)

前三条路线回答「记忆存在哪、长什么样」;这条路线回答「**谁决定写什么、何时把经验固化成知识**」——它可以叠在任一存储形态之上。

**机制与代表**:
- **MemGPT**(开山之作):LLM 以函数调用自主编辑记忆,主上下文(系统指令 + 工作区 + FIFO 队列)与外部上下文(recall 存对话史、archival 存长期数据)间分页换入换出。DMR 多会话:GPT-4 基线 32.1% → MemGPT 92.5%;嵌套 KV 检索 GPT-4 三层嵌套即 0%,MemGPT 不受影响。局限:换 GPT-3.5 因函数调用能力弱显著退化,且常在检索耗尽前提前停止翻页[25]。
- **A-MEM**:Zettelkasten 式 agentic 记忆——每条记忆是一张笔记(原文、时间戳、LLM 生成的关键词/标签/语境描述、向量、链接集);操作为 Note Construction、Link Generation(向量相似 + LLM 判断)、**Memory Evolution**(新笔记触发邻居修订)、top-k 检索。LoCoMo 多跳 F1(GPT-4o-mini)45.85 vs MemGPT 25.52 vs LoCoMo 基线 18.41;回答 token 1,126–2,520 vs MemGPT ~16,950;消融:45.85 → 去 evolution 31.24 → 再去 links 24.55。并非处处最强:对抗题(GPT-4o-mini)与开放域(GPT-4o)输给 LoCoMo 基线[8]。
- **Letta / MemGPT 的工业形态**:core memory blocks(常驻上下文、agent 用内置记忆工具读写、整块替换)[34] + archival memory(向量库归档)[35] + **sleep-time agents(「做梦」)**:后台子 agent 在会话间隙审阅近期对话、提炼教训、更新记忆,按消息数或上下文压缩触发,记忆跨会话共享[36]。「睡眠固化」是固化时机问题最显式的工程答案。
- **Generative Agents**(反思机制的源头):检索分 = 时近性(指数衰减 0.995)+ 重要性(LLM 打 1–10)+ 相关性(余弦),等权;消融显示 reflection(定期把低层观察归纳为高层结论)是可信任度的最大单项贡献(29.89 → 去 reflection 26.88 → 再去规划 25.64,人类基线 22.95,全消融 21.21)[28]。

**跨论文综合**[8]:**持久化本身不是杠杆;被反复验证的核心机制是「把经验重构成可检索高层形态的固化/综合」+「选择性检索」四件套**——Generative Agents 的 reflection 消融[28]、A-MEM 的 evolution 消融[8]、HippoRAG 靠图结构整合取胜[26]、MemGPT/MemoryOS 把瓶颈定义为「把对的记忆搬进有限窗口」[25][27],都指向同一结论。

---

## 5. 代表项目深读卡片(8 张)

### 卡片 1:Karpathy LLM Wiki(gist,2026-04)
- **定位**:方法论原典,不是软件。「把 Obsidian 当 IDE、LLM 当程序员、wiki 当代码库」[1]。
- **机制**:三层(Raw 不可变 / Wiki 由 LLM 全权维护 / Schema 即 CLAUDE.md·AGENTS.md);`index.md` 内容目录 + `log.md` append-only 时间线;Ingest/Query/Lint 三工作流;「知识编译一次、持续保鲜、不重复推导」[1]。
- **接口**:纯文件 + 任何会读写文件的 agent;无 API 依赖。
- **证据**:无量化评测;影响力证据是它引爆了后续全部讨论(HN 热帖[9]、LangChain 跟进[2]、多篇实现文[3][5])。
- **局限**:全人工纪律,无工具强制;作者自己也承认维护是主要成本(社区转述「人的第二大脑成了坟场」即由此而来[3])。

### 卡片 2:LangChain Wiki Memory(博客,2026-06-30)
- **定位**:把 wiki 路线从个人技巧升格为产品范式的定调文。
- **机制**:「用 agent 把原始源数据变成紧凑、持久、agent 可读的知识层」;与 RAG 的分界线 = 预计算综合 vs 查询时检索原始块[2]。
- **接口**:文件优先(「可检视、可编辑、可版本化」);实例:DeepWiki(GitHub repo 文档)[23]、AutoWiki(代码库文档)[2]、Karpathy 式持久 markdown wiki[2]。
- **证据**:定性论证 + 实例枚举,无基准数字。
- **局限**:未回答维护成本与规模上限(由 §6 的第三方证据补)。

### 卡片 3:MemGPT(论文,2023)/ Letta(产品,持续更新)
- **定位**:OS 式虚拟上下文管理的开山论文与它的工业继承者。
- **机制**:见 §4.4。产品侧三件套:core memory blocks(常驻、整块替换)[34]、archival 向量归档[35]、sleep-time「做梦」固化子 agent[36]。
- **接口**:Letta SDK/API;记忆工具内置于 agent 运行时。
- **证据**:MemGPT DMR 92.5%(GPT-4)[25];Letta 文档未给新基准。
- **局限**:论文自述在弱模型(GPT-3.5)上函数调用退化、翻页提前终止[25];sleep-time 固化质量依赖子 agent 判断,错误同样会固化。

### 卡片 4:A-MEM(论文,arXiv 2502.12110)
- **定位**:Zettelkasten × agentic 记忆,学术侧「笔记网络」路线代表。
- **机制**:笔记七要素 + Note Construction / Link Generation / **Memory Evolution** / top-k 检索[8]。
- **接口**:论文实现,无产品 API。
- **证据**:LoCoMo 多跳 F1 45.85 vs MemGPT 25.52;回答 token 少一个数量级(1,126–2,520 vs ~16,950);消融证明 evolution 是最大贡献项(−14.61 F1)[8]。
- **局限**:对抗题与开放域题不是最强[8];演化操作本身消耗 LLM 调用,成本未在论文中充分核算。

### 卡片 5:mem0(论文,arXiv 2504.19413 + 开源产品)
- **定位**:「生产就绪的可扩展长期记忆」,抽取式记忆的工程标杆。
- **机制**:记忆管理器工具调用四操作 ADD/UPDATE/DELETE/NOOP;可选图变体 mem0g[29]。
- **接口**:开源库 + 托管 API,一行 `add()/search()`。
- **证据**:LoCoMo J 66.88(相对 OpenAI 记忆 +26%);延迟 −91%、token −90%+;**但 full-context 72.90 仍更高**[29]。
- **局限**:准确率让位成本的取舍要用户自己认;其联创对竞品(Zep)基准的公开质疑[33]也提醒读者:这个领域的厂商数字都带着立场。

### 卡片 6:Zep / Graphiti(论文 arXiv 2501.13956 + 产品)
- **定位**:时序知识图谱记忆,「知识更新」能力的代表。
- **机制**:边带生效/失效时间;原语 facts/episodes/summaries/observations[32]。
- **接口**:托管 API + 开源 Graphiti 引擎。
- **证据**:DMR 94.8%(近饱和,上界 98.2%);LongMemEval 较 MemGPT 最高 +18.5%、延迟 −90%、token <2%[30][31]。
- **局限**:LoCoMo 84% 宣称被 mem0 联创逐条拆解——修正评测 58.44%,虚高 25.56pp(手法:计入已排除的对抗题、换提示与检索模板、单次运行)[33]。这是本报告最重要的「基准诚信」案例。

### 卡片 7:Cognee(开源平台)
- **定位**:开源 AI 记忆平台,「记忆即数据管线」路线。
- **机制**:remember/recall/forget/improve 四动词 API;cognify 管线产知识图谱(块+向量+摘要+节点+边);六步任务含可选矛盾检测(默认关)[39][40]。
- **接口**:Python SDK,可嵌入任意应用。
- **证据**:BEAM 100K 处 0.79 vs 前 SOTA 0.735(官方自注「方向性信号」)[39]。
- **局限**:「忘记」与矛盾处理默认关闭,说明这两件事在生产中是成本项而非免费午餐[40]。

### 卡片 8:basic-memory(开源,MCP 原生)
- **定位**:「markdown 知识库 + MCP」的最小完整实现,与 OpenObsidian 形态最近的对照组。
- **机制**:每个 markdown 文件是一个 Entity,含 Observations(事实)与 Relations(关系);**AI 与人写同一批文件**,sync 保持一致;「观察与 wikilink 复利成上下文。纯文本,在你磁盘上。永远。」[19]
- **接口**:MCP 工具 + CLI。
- **证据**:无量化基准;被多篇综述列为文件式记忆的代表[7]。
- **局限**:AGPL-3.0(对 OpenObsidian 是许可红线,仅作概念参照);无 lint/健康检查机制的公开描述。

---

## 6. 能力增益机制与实证

### 6.1 增益机制(记忆到底提升了 agent 的什么)

1. **成本与延迟**(证据最硬):mem0 token −90%、p95 延迟 −91%[29];Zep 延迟 −90%、上下文 token <2%[30];A-MEM 回答 token 比 MemGPT 少一个数量级[8]。
2. **跨会话一致性**:Letta 记忆「跨所有交互持久」且跨会话共享[34][36];LongMemEval 把它分解为五种可测能力(信息抽取、多会话推理、时序推理、知识更新、拒答)[38]。
3. **复利式知识积累**:「wiki 是持久的、复利的产物」「好的答案归档回 wiki 成为新页面」[1];实践案例 ~100 篇笔记压成 73 概念 + 18 实体后,wiki 在 12 个源时就开始变得有用[3]。
4. **多跳/组合推理**:LLM-Wiki 在组合性问题上 +15.6 F1 胜 Dense RAG[17];HippoRAG 2WikiMultiHopQA recall@5 89.1 vs 68.2[26];LoCoMo 上所有记忆系统都只在多跳题上显著超过基线[8][27]。
5. **个性化**:Mem0 相对 OpenAI 内置记忆 +26%[29]——同一用户的历史被结构化后,回答贴合度显著上升。

### 6.2 关键交叉结论:持久化不是杠杆,固化才是

四组独立消融收敛到同一处(见 §4.4 末):去掉 reflection/evolution/图整合后性能显著回落,而单纯「存下来」的基线(LoCoMo 的 observation storage 41.4、full-context 之外的各 RAG 变体)全部远低于有固化机制的系统[8][26][27][28]。**对工程选型的含义:评估任何记忆方案,先问「它的固化/蒸馏/演化在哪里发生」,而不是「它存在哪」。**

### 6.3 基准地图与诚信问题

- **LoCoMo**[37]:50 段对话,平均 19.3 会话/9,209 token;7,512 道 QA(单跳 36%、多跳 14.6%、时序 20.6%、开放域 3.9%、**对抗 24.9%**)。人类 F1 87.9 vs GPT-4-turbo 32.1、最好 RAG 41.4;长上下文在对抗题上 F1 崩到 2.1;基于摘要的检索丢信息。
- **LongMemEval**[38]:500 题、5 能力;S 版单题 ~115K token/~50 会话,M 版 500 会话 ~1.5M token(超出任何窗口,专测记忆架构);商业助手 −30%(摘要)/−37%(ChatGPT)/−64%(Coze) vs 离线全读 GPT-4o 0.9184。
- **DMR**(MemGPT 用的深度记忆检索任务):已近饱和——Zep 94.8%、MemGPT 93.4% vs 全对话上界 98.2%[25][30]。
- **格局判断**[37]:LoCoMo/DMR 的历史长度已装进现代上下文窗口,full-context 基线要么赢(LoCoMo:72.90 > mem0 66.88[29])要么近上界(DMR);**记忆系统的叙事重心已从「能不能记住」转向「便宜、快、可更新地记住」**;LongMemEval 是下一个有效战场。
- **诚信警告**:① 厂商指标互不可比(F1 vs LLM-judge J vs 准确率增益,harness 各异)[37];② **对抗题是否计入**就能移动 LoCoMo 分数 25pp(Zep 争议:宣称 84% → 修正 58.44%[33]);③ 引用本领域数字时建议一律带 harness 与题集子集说明。

### 6.4 规模阈值(何时 wiki、何时 RAG)

MindStudio 的决策框架[16]:<100 篇结构良好文档 → LLM Wiki;100–1,000 → 皆可;1,000+ → RAG;**单次查询稳定载入 >5–6 篇 → 切 RAG**;内容高频变化 → RAG。成本交叉点:~3K token 的 wiki 比 RAG 便宜,~30K token 的 wiki 每次查询反而更贵。**wiki 路线的红利在「小而综合得好」,不在规模。**

### 6.5 失败模式清单

| 类别 | 失败模式 | 来源 |
|---|---|---|
| 维护 | 维护坍缩:没人维护的 wiki 比没人维护的数据库更危险(它会以权威口吻给出过期信息) | [10] |
| 漂移 | 六种知识漂移:Source / Concept / Terminology / Decision / Citation / Structure;「页面看起来干净,实际已经错了」「没有复审日期的页面迟早会安静地说谎」 | [11] |
| 矛盾 | 矛盾抹平:agent 把两个冲突断言揉成含糊折中而不是显式标注冲突 | [11] |
| 质量 | 概念混淆(concept confusion)与表面化:数据增长后模型把相似概念混同 | [3] |
| 累积 | 错误累积:摄入错误经多轮递归重写放大,极端情况「model collapse」 | [9] |
| 规模 | 检索过载:wiki 膨胀后每次查询载入过多文档,成本反超 RAG | [16] |
| 基准 | 评测失真:剔除对抗题、换模板、单次运行可虚报 25pp | [33] |
| 上下文文件 | LLM 生成的 AGENTS.md 类文件反而使编码成功率 −3%、成本 +20% | [12] |

### 6.6 安全:记忆写入面是新攻击面

- **OWASP 已把记忆投毒列为 ASI06 类风险**;MINJA(NeurIPS 2025)证明经**纯查询接口**(query-only)即可在医疗、电商、QA agent 上达成 >95% 注入成功率、>70% 攻击成功率——「注入发生在二月,伤害发生在四月」。防御栈:溯源标注(provenance tagging)、指令剥离(instruction stripping)、写入前校验(write-ahead validation)、信任加权排序、时间衰减、熔断器、用户确认[15]。
- **Unit 42 实测攻击链**:间接提示注入经抓取的恶意 URL 进入会话摘要,伪造 XML 让中段文本被读作系统指引并存入记忆,**持久 365 天**,后续触发会话历史静默外泄[14]。
- **Web agent 研究**(arXiv 2506.17318):plan injection 腐蚀无状态 web agent 的外部记忆/状态,上下文链式注入的攻击成功率是普通提示注入的 3 倍,隐私外泄 +17.7%,且能绕过提示注入防御——「安全记忆处理必须是一等关注点」[13]。
- **对文件式记忆的含义**:任何允许 agent 写 vault 的系统,写入路径必须有审计/溯源/信任分级——这不是远期问题,是已被实战验证的攻击面。

---

## 7. 对照 OpenObsidian:已有映射 / 差距 / 机会点

> 本节断言全部对照仓库现状(`docs/07`、`docs/12`、`docs/11`、`docs/open-questions.md`、`docs/backlog.md`、`mcp/README.md`、`mcp/src/main.rs`)核实;backlog 状态以 backlog 文件为准,与代码实际不一致处如实标注。

### 7.1 已有映射:OpenObsidian 的五层 × wiki-memory 范式

`docs/07-llm-wiki-architecture.md` §3 的映射表,对照本次调研的范式语言重述:

| LLM Wiki 层 | OpenObsidian 落点 | 调研视角的对应物 |
|---|---|---|
| Raw(不可变源) | `type: Source` + git 版本真相(re-ingest 产新 Summary,旧版可还原) | Karpathy 的 immutable sources[1];比原式多了 git 还原能力 |
| Wiki(LLM 派生知识) | `Summary`/`Entity`/`Concept` 软类型 + 关系边(`derived_into`/`mentioned_in`/`contradicts`) | LangChain 的 agent-maintained data structure[2];`contradicts` 边是多数 wiki 系统没有的显式矛盾表达(呼应 §6.5 矛盾抹平问题[11]) |
| Schema(契约) | frontmatter 软类型 + Type 文档 + AGENTS.md(cairn 兼容) | Karpathy 的 CLAUDE.md/AGENTS.md 层[1]、Claude Code 记忆文件约定[21] |
| Navigation(索引/浏览) | 图谱(Cytoscape)+ **QQL 作为 agent IR**(MCP `run_qql`)+ ⌘F/⌘P/⌘K | DeepWiki 式结构化导航[23];QQL-IR 定位在调研对照中属少见设计——多数系统只有 `search` |
| Health(度量/反馈环) | **Health 即查询**:指标存为 `type: Query` 的 QQL 笔记,实时计算、自举进图谱 | 相对 Karpathy 原式(手写 wiki-health 快照)的独有升级[1];本质上是把 Lint 工作流「编译成了可执行查询」 |

MCP 侧(`mcp/README.md`,7 工具:`list_notes`/`read_note`/`write_note`/`links`/`search_notes`/`run_qql`/`vault_info`)已覆盖 wiki-memory 读/写两侧的关键反馈环:
- **读时图谱简报**(`read_note` 附 backlinks/forward/dead/degree)——对应调研中「渐进披露:先目录再摘要再原文」[3] 的结构化版本;
- **写时断链审计**(`write_note` 返回 `broken_links[]` + `orphan_hint`)——对应 MINJA 防御栈里「写入前校验」的链接完整性部分[15];
- `links` 的 orphans/hubs/dead/suggest 即是 Lint 的图结构子集[1]。

### 7.2 差距清单(调研发现的缺口,按证据强度排序)

1. **没有「记忆」定位的 vault 级 agent 使用文档**。B-WIKI-AGENT-DOC(ingest/research/consolidate 流程说明)在 backlog 为 🟢⏳ 未建。调研显示 wiki-memory 的生效前提是 agent 知道「三层结构 + 三工作流」[1][2]——引擎有了,说明书没有。
2. **没有 ingest/lint 工作流的脚手架**。B-WIKI-STARTER(starter vault,`status: provisional|canonical` 生命周期)🟡⏳、B-WIKI-HEALTH-QQL(Health 模板)🟢⏳ 均未交付。Karpathy 三工作流中 Ingest/Lint 在 OpenObsidian 里没有对应模板或示例流;Health 层引擎(QQL)齐全但**没有开箱模板**——这是「引擎超前、脚手架缺位」的典型。
3. **缺「对话 → vault 蒸馏」管道**。`docs/11` 把会话转录明确定为应用数据(SQLite,「转录不进 vault、不进 git」),「线程导出为 md 入 vault」仅为可选 backlog。调研的交叉结论(§6.2:固化才是杠杆[8][28])意味着:OpenObsidian 目前**有仓库、有工具,但没有固化管道**——agent 会话中的经验没有一条默认路径沉淀为 vault 笔记。(注:转录留在应用数据是刻意决策,本报告不主张改动它,只陈述管道现状。)
4. **检索只有词法 + 结构,无语义**。P6-5 明确【待定】【默认关向量主索引】。**调研结论:对 wiki-memory 路线这不是缺陷而是与范式一致的选择**——「检索、向量、rerank 只是辅助,不定义记忆系统;记忆是被维护的知识本体」[5];且 wiki 的写入时综合本就降低了对强检索的依赖[2]。但规模阈值[16]给出重估触发条件:vault 超过 ~1,000 篇、或单次查询稳定需要载入 >5–6 篇笔记时,应重新评估引入语义检索(可选本地模型或外部 API,与 P6-5 选项单一致)。
5. **AGENTS.md「共享 memory MCP server 默认不上」的决策与调研结论的关系**:调研显示文件式 vault 本身就是多 agent 共享记忆的推荐载体(basic-memory 人机共写[19]、DeepWiki 团队共享文档[23]),OpenObsidian 的 vault + openobs-mcp 已经**是**那个共享记忆面——AGENTS.md 说的「memory MCP server」指的是 repo 文件之外的独立记忆中间件,调研证据(「别去找同步中间件」的失败模式,与 §6.5 维护坍缩同构)支持**维持该决策**,故仅陈述、不建议改动。
6. **安全机制尚未对位**。调研防御栈[15](溯源标注、写入前校验、信任加权、时间衰减)中,OpenObsidian 已有「写入前校验」的链接侧(broken_links)与「溯源标注」的雏形(Source 类型 + doc 07 Health 表的 `evidence_tier` 字段示意),但**没有记忆投毒意义上的信任分级**(agent 写入 vs 人写入 vs 外部摄入的区分)。这属于机会点而非缺陷——当前 MCP 写入面由用户显式配置,风险可控。
7. **backlog 与代码的一致性小账**:B-MCP-LINKS / B-MCP-READ-BRIEF / B-MCP-WRITE-FEEDBACK 在 backlog 标 ⏳,但 `mcp/src/main.rs` 与 `mcp/README.md` 显示三者已交付(links 六 kind、read 图简报、write broken_links 均已实现)。报告如实记录,供下次 backlog 清理时核对。

### 7.3 机会点(候选,均标注与现有 backlog 的关系;只陈述,不拍板)

**约定层**(成本最低,直接复用 6D 已规划项):
- B-WIKI-AGENT-DOC 可按「Ingest/Query/Lint 三工作流 × MCP 工具对照」来写,天然对齐 Karpathy 范式[1] 与 LangChain 定义[2];
- B-WIKI-STARTER 的 `status: provisional|canonical` 生命周期 frontmatter 与调研中的「复审日期」机制[11](「没有复审日期的页面迟早安静地说谎」)是同一件事的两半,starter 模板里可把 `reviewed:`/`source:` 字段一并给出,即 MINJA 防御栈的溯源标注[15]落地形态。

**工具层**(MCP 增量):
- **Lint 工具**:现有 `links`(dead/orphans/hubs)是图结构 lint;调研暴露的漂移六型[11]中 Terminology/Citation/Decision 漂移需要内容级检查,可以是 QQL 模板(Health 即查询已有引擎)而非新 Rust 代码;
- **固化/蒸馏工具**:若未来打通「对话 → vault」管道(差距 3),Letta sleep-time 的「后台子 agent 蒸馏」[36] 与 A-MEM Memory Evolution 的「新笔记触发邻居修订」[8] 是两个可参照的固化时机模型;
- **信任分级**:在 frontmatter 约定 `provenance:`(human / agent / ingested)是调研防御栈[15] 在本仓库的最小落地,不碰 core。

**工作流层**:
- 「Query → 回填」:Karpathy 的「好答案归档回 wiki」[1] 在 OpenObsidian 的具体形态可以是:agent 经 `run_qql` 得到的结果集,值得沉淀时经 `write_note` 写为 `type: Summary` 并自动带 `derived_into` 边——工具已全部就位,缺的只是工作流文档(回到 B-WIKI-AGENT-DOC);
- Health 模板(B-WIKI-HEALTH-QQL)可把调研的失败模式直接编译成 QQL:孤儿 Concept、单源概念(综合度)、无 `reviewed` 字段的老页面(漂移风险)——doc 07 §3 已给出示意查询,交付模板即可。

**检索层**(远期、条件触发):
- P6-5 维持默认关;把 §6.4 的规模阈值[16]写成触发条件记入文档(1,000+ 篇或单查询 >5–6 篇),到时再评估可选本地/外部向量,避免提前引入依赖染色与成本。

### 7.4 四个方向的优先级与排序依据(2026-08-06 补记)

> §7.3 的四个专项调研文档(③⑥/内容级 lint/④,见 docs/README.md 文档地图)完成后,围绕它们做了一轮优先级讨论。本节记录排序结论**以及排序的方法本身**——后者是更通用的部分,四篇专项文档的 TL;DR 各有一条指针回指本节。

**初版排序(按「价值 × 成本」)**:

| 优先级 | 方向 | 成本形态 |
|---|---|---|
| P0 | ⑥ provenance L1(纯约定 + 模板 + Health 查询) | 半天–1 天,零 Rust / 零 TS |
| P1 | 内容级 lint L1(结构启发式) | 1–3 天,core 纯函数 + QQL 模板 |
| P2 | ③ 蒸馏管道 L1(线程 → Source 导出) | 纯前端编排;字段约定依赖 P0 |
| P3 | ④ 语义检索 | 不排期,只看阈值 |

**核心发现:P0–P2 三个方向各自带有不同程度的「用户品味 / 维护纪律依赖」,这决定了排序依据该用什么。** ④(语义检索)是四方向中唯一已具备纯客观、可量化触发条件的(§6.4 阈值已被 semantic-retrieval.md §3.1 落成可测判据);另外三个方向都含无法事先推出的因子:

| 方向 | 不依赖品味的部分 | 依赖品味 / 纪律的部分 |
|---|---|---|
| 内容级 lint L1 | 检查的是 doc 14 已写成文约定的自洽性(contradicts↔Contested 双向一致、同名静默撞解析等)——不变量成立与否是事实,不是审美 | 仅个别规则的宽严参数(如 L1-A 的 contradicts 方向宽松度)需拍板 |
| ⑥ provenance | 字段立起来后,Health 查询与盖章行为是确定性的 | 设计参数(字段命名、级数、`reviewed` 初始盖不盖)无法从第一性推出;更重要的是**维护纪律**(`reviewed` 会不会有人更新)无法事先知道 |
| ③ 蒸馏 | 工具链已齐(`agent_thread_load` + `create_note`) | 价值完全系于「人事后会不会复审蒸馏产物」这一未验证习惯——蒸馏专文 §3.2 的反面证据「AI 可以生成十万张笔记,但它们对你都是陌生的」(其 [D10],社区佐证)正指此处 |

**因此排序依据从「价值 × 成本」换成「可逆性 × 可观测性」,三原则**:

1. **不可标准化的部分,就不要标准化**——把判断显式留给人/agent。四篇专项文档本已如此设计:lint 只产候选不判决、蒸馏恒为显式动作、trust 可不填。品味不进代码,进拍板记录。
2. **可逆性代替正确性**——品味参数只选「改起来便宜」的默认值:软字段、零校验、缺失完全兼容、删掉零成本。这恰是仓库既有原则(类型不绑人,open-questions P4),故拍错的代价 ≈ 0。
3. **把品味问题转成观察问题**——每个方向配一个可观测的行为信号,信号出现再加注:

| 方向 | 可观测信号(不需要品味,只需要看) |
|---|---|
| ⑥ provenance | 其 Health 查询(`group_by(provenance)`、「agent 产出未复审」)本身就是探针:建好跑一个月,看字段有没有人填——没人填 = 纪律不存在,方案自动证伪,损失为零 |
| ③ 蒸馏 | 用户是否开始**手动**把会话结论复制进笔记、或反复回翻旧线程。手动行为出现 = 管道有真实需求;不出现 = 不建 |
| 内容级 lint | 无需观察——不变量今天就该有人守 |
| ④ 语义检索 | 已量化:> ~1,000 篇 / 单查询 > 5–6 篇(semantic-retrieval.md §3.1) |

**修订后的定位**:

- **内容级 lint L1 照做**——客观、品味无关,它守的约定已在 doc 14,只是没人在守;
- **⑥ provenance L1 照做,但重新定性为「探针」而非「功能」**——它的主要价值是先行回答「这个 vault 有没有维护纪律」,而这个问题恰是 ③ 的前置判据;
- **③ 蒸馏降为「等信号」**——连 L1 都不必现在建,等 ⑥ 的探针或手动复制行为给出需求证据(零代码的 L2a 文档路径不受此限,可顺手带);
- **④ 语义检索不排期**——唯一有纯客观触发条件的方向,看阈值。

**与「只陈述不拍板」的关系**:本节是排序建议,同样不构成拍板。它提供的是一个比直觉更硬的判据:**对「价值 = 机制 × 维护纪律」结构的特性,纪律项未知时不要提前建——先用最便宜的方式测出该项的值。**

---

## 8. 引用来源

> 证据持久化:`~/Documents/Agent_Memory_Research_20260805/`(`sources.jsonl` 40 条、`evidence.jsonl` 54 条,含逐条引文与定位符)。编号 [n] 与正文一致。

**范式与方法论**
- [1] Karpathy, A. *LLM Wiki*(gist) — https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- [2] Chase, H. *Wiki Memory*(LangChain 博客, 2026-06-30) — https://www.langchain.com/blog/wiki-memory
- [3] Decoding AI. *Your Second Brain Is a Graveyard — LLM wiki as agent memory* — https://www.decodingai.com/p/llm-wiki-agent-memory
- [4] Vishal Mysore. *RAG vs Agent Memory vs LLM Wiki: A Practical Comparison* — https://dev.to/vishalmysore/rag-vs-agent-memory-vs-llm-wiki-a-practical-comparison-1oo6
- [5] aaif.io. *Karpathy's LLM Wiki as Agent Memory* — https://aaif.io/blog/karpathys-llm-wiki-as-agent-memory
- [6] hjarni.com. *Knowledge Base for AI Agents: Long-Term Memory over MCP* — https://hjarni.com/blog/knowledge-base-for-ai-agents
- [7] TeleAI. *Awesome-Agent-Memory*(资源清单)— https://github.com/TeleAI-UAGI/Awesome-Agent-Memory
- [9] Hacker News. *Karpathy LLM Wiki 讨论帖* — https://news.ycombinator.com/item?id=47640875
- [10] Herkelman, N. *Your AI Re-derives Everything It Knows*(write-time vs query-time 综合)— https://natesnewsletter.substack.com/p/your-ai-re-derives-everything-it

**约定与接口**
- [20] Howard, J. *llms.txt proposal* — https://llmstxt.org
- [21] Anthropic. *Claude Code memory 官方文档* — https://code.claude.com/docs/en/memory
- [22] MCP Servers. *Reference memory server*(知识图谱)— https://github.com/modelcontextprotocol/servers/tree/main/src/memory
- [23] Cognition. *DeepWiki: AI docs for any repo* — https://cognition.com/blog/deepwiki
- [24] Devin Docs. *DeepWiki MCP* — https://docs.devin.ai/work-with-devin/deepwiki-mcp
- [19] Basic Machines. *basic-memory*(AGPL-3.0)— https://github.com/basicmachines-co/basic-memory

**学术系统**
- [25] Packer et al. *MemGPT: Towards LLMs as Operating Systems* — arXiv:2310.08560
- [8] Xu et al. *A-MEM: Agentic Memory for LLM Agents* — arXiv:2502.12110
- [26] Gutiérrez et al. *HippoRAG: Neurobiologically Inspired Long-Term Memory for LLMs* — arXiv:2405.14831
- [27] *Memory OS of AI Agent* — arXiv:2506.06326
- [28] Park et al. *Generative Agents: Interactive Simulacra of Human Behavior* — arXiv:2304.03442
- [17] *Self-Evolving Agent-Native Retrieval via LLM-Wiki* — arXiv:2605.25480

**生产系统**
- [29] *Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory* — arXiv:2504.19413
- [30] *Zep: A Temporal Knowledge Graph Architecture for Agent Memory* — arXiv:2501.13956
- [31] Zep. *State of the Art Agent Memory*(博客)— https://blog.getzep.com/state-of-the-art-agent-memory
- [32] Zep. *Concepts*(文档)— https://help.getzep.com/concepts
- [33] getzep/zep-papers Issue #5(mem0 联创对 Zep LoCoMo 宣称的质疑)— https://github.com/getzep/zep-papers/issues/5
- [34] Letta. *Memory blocks* — https://docs.letta.com/guides/agents/memory-blocks
- [35] Letta. *Archival memory* — https://docs.letta.com/guides/agents/archival-memory
- [36] Letta. *Sleep-time agents* — https://docs.letta.com/guides/agents/sleep-time-agents
- [39] Cognee. *开源 AI 记忆平台*(repo)— https://github.com/topoteretes/cognee
- [40] Cognee. *cognify*(文档)— https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify

**基准**
- [37] Maharana et al. *LoCoMo: Evaluating Very Long-Term Conversational Memory of LLM Agents* — arXiv:2402.17753
- [38] Wu et al. *LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory* — arXiv:2410.10813

**失败模式与安全**
- [11] Glukhov. *LLM Wiki Maintenance: Knowledge Drift*(六种漂移)— https://www.glukhov.org/knowledge-management/knowledge-systems-architectures/compiled-knowledge/llm-wiki-maintenance-knowledge-drift
- [12] *Evaluating AGENTS.md*(ETH Zurich)— arXiv:2602.11988
- [13] *Context manipulation attacks: corrupted memory in web agents* — arXiv:2506.17318
- [14] Unit 42. *Indirect prompt injection poisons AI long-term memory* — https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory
- [15] Schneider, C. *Persistent memory poisoning in AI agents*(MINJA)— https://christian-schneider.net/blog/persistent-memory-poisoning-in-ai-agents
- [16] MindStudio. *LLM Wiki vs RAG: decision framework* — https://www.mindstudio.ai/blog/llm-wiki-vs-rag-knowledge-base
- [18] AWS. *Well-Architected Agentic AI Lens: memory cost* — https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost03.html

**调研方法与局限**:以 WebSearch + WebFetch 多路检索,一手来源(论文/官方 repo/官方博客)优先,社区文章作佐证;Reddit 因登录墙仅能经 HN 镜像与搜索快照间接引用;所有量化数字均至少一个一手出处,厂商自报数字已标注立场(§6.3)。

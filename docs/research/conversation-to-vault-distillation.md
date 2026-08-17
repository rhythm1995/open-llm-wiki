# 调研报告:对话 → vault 蒸馏管道

> **性质**:调研 + 工程方案文档。上游 = [`agent-memory-survey.md`](./agent-memory-survey.md)(下称「调研」)§7.3 机会点③ / §7.2 差距 3。
> 本文**只陈述不拍板**:技术调研部分尽量一手来源(标注 [D*] 为本文新增来源,引用调研处沿用其 [n] 编号);工程方案是候选设计,所有「默认值」都显式写出供人改。
> 日期:2026-08-06 · 断言均对照仓库现状核实(`app/src-tauri/src/transcript.rs`、`acp.rs`、`ui/src/lib/agent-session.ts`、`ai-context.ts`、`mcp/src/main.rs`、`docs/11`、`docs/14`、`templates/wiki-starter/`)。

---

## 1. TL;DR

1. **Open LLM Wiki 目前「有仓库、有工具、没有固化管道」**:应用内 agent(ACP 托管)的会话转录存本地 SQLite(app data、每 vault 一 db、刻意不进 vault/git,`app/src-tauri/src/transcript.rs`);「线程导出为 md 入 vault」在 doc 11 §3 只是可选 backlog,无任何代码路径。agent 会话中的经验没有一条默认路径沉淀为 vault 笔记。
2. **调研的交叉结论不变:持久化不是杠杆,固化才是**(调研 §6.2[8][26][27][28])。所以本方案不主张「把转录倒进 vault」,而是设计一条**显式、蒸馏式、人审**的固化管道:原始转录永留应用数据,蒸馏产物走 doc 14 的类型体系(Source/Summary/Entity/Concept)入 vault。
3. **固化时机的业界光谱**:手动(Claude Code 的「remember X」/ 早期 `#` 快捷键,后者已于 2025-12 v2.0.70 移除 [D2])→ 会话中 agent 自决(Claude Code Auto memory [D1])→ 会话间隙后台蒸馏(Letta sleep-time「做梦」,触发 = 消息数或上下文压缩 [D4])→ 新笔记触发邻居修订(A-MEM Memory Evolution [8])。Open LLM Wiki 无任何 LLM 内置调用,故**所有需要模型的固化都必须经用户自带的 agent(ACP / MCP)完成**——这既是约束也是隐私特性。
4. **蒸馏粒度的光谱**:原始导出 → 会话摘要 → 原子主张(mem0 ADD/UPDATE/DELETE/NOOP [29])→ 类型化 wiki 页(Karpathy Ingest [1],即 doc 14 的 ingest)。对 wiki-memory 路线,终点形态应是**类型化 wiki 页**,原始导出只是零蒸馏端点,不是目标。
5. **最小可用切片(L1)= 一个显式动作**:把线程导出为 `type: Source` 笔记——纯前端编排(复用已有 `agent_thread_load` + `create_note` 命令 + 新增纯函数 `renderThreadAsSource`),**零新 Rust 命令、零新依赖**,并复用 doc 11 Model C 已验证的归一化思路。
6. **L2 = 蒸馏本身,且有零代码路径**:导出的 Source 已在 vault 里,doc 14 §1 的 ingest 工作流就是现成的蒸馏说明书——agent 经 MCP(外部)或 ACP(应用内)即可完成 Source → Summary/Entity/Concept。应用内再加一个「一键蒸馏」按钮(seed 消息 = ingest 指令 + Source 内容)即闭环。
7. **人审门是结构性的,不是额外的**:应用内 agent 写入默认走 git 归因隔离(doc 11 §4 quarantine + 采纳/撤销),蒸馏产物天然落在 per-agent ref 等人采纳;蒸馏产物 frontmatter 直接对齐同日上游分叉的信任分级专文(`trust-provenance-frontmatter.md`)字段集(`provenance: agent` / `reviewed:`),只留钩子不互锁。
8. **风险不对称**:蒸馏丢信息/引入错误(调研 §6.2/§6.5[37][11])、错误固化扩散(一源触 10–15 页 [1])、转录含敏感内容一旦入 vault 即可能进 git(隐私)、对话注入 → 蒸馏入 vault 是记忆投毒(MINJA [15])的具体化路径。四者的共同对策就是**显式触发 + 人审**,不存在「自动化了就更安全」的方向。
9. **优先级定位(2026-08-06 补记,方法论详见 [survey §7.4](./agent-memory-survey.md))**:初版排序 P2,**修订后降为「等信号」**——本方向是四方向中品味依赖最深的:价值完全系于「人事后会不会复审蒸馏产物」这一未验证习惯(§3.2 [D10] 的反面证据正指此处)。策略 = 不提前建;**可观测信号**:用户开始手动把会话结论复制进笔记、或反复回翻旧线程——手动行为出现 = 真实需求,不出现 = 不建。零代码的 L2a 文档路径(把「对导出 Source 说 ingest」写进 B-WIKI-AGENT-DOC)不受此限,可顺手带。本方向的前置判据 = provenance 探针(survey §7.4)的观测结果。
10. **落地状态(2026-08-06)**:L2a **已写进** [`docs/14-llm-wiki-workflow.md`](../14-llm-wiki-workflow.md) §1.1 + [`templates/wiki-starter/prompts/ingest-distill.md`](../../templates/wiki-starter/prompts/ingest-distill.md)。L1 导出 UI / L2b 一键蒸馏仍等信号,不提前建。

---

## 2. 问题与现状(Open LLM Wiki 已有什么、断在哪里)

**已有(全部对照代码核实)**:

| 环节 | 现状 | 出处 |
|---|---|---|
| 应用内 agent 宿主 | ACP client 完整落地:picker / ThreadView / Composer / 三档权限 / git 归因面板 | `app/src-tauri/src/acp.rs`(2.6k 行);doc 11 §10 ✅ |
| 转录存储 | SQLite,每 vault 一 db(`agent-transcript-{FNV哈希}.db` 落 app data 目录)+ WAL;表 `threads(id, agent, created)` / `messages(id, thread_id, role, text, raw_blob, ts)`;role ∈ user/agent/tool/error | `transcript.rs`;6 个 `agent_thread_*` 命令均已注册进 `lib.rs` 的 `generate_handler!` |
| 转录归一化 | `normalizeForHandoff(msgs, fromAgent, vaultCtx)`:留 user/agent 文本、工具压一行、丢 thinking/permission——为跨 agent 移交设计,但**同一套规则就是「线程 → 可读 markdown」的现成骨架** | `ui/src/lib/agent-session.ts`(纯函数,vitest 覆盖) |
| vault 上下文构建 | `buildAiContext({current, neighbors})`:当前笔记 + 外向邻居拼 LLM 友好 markdown | `ui/src/lib/ai-context.ts` |
| agent 读写 vault | MCP 7 工具(`list_notes`/`read_note`/`write_note`/`links`/`search_notes`/`run_qql`/`vault_info`);`write_note` 返回 `broken_links[]` + `orphan_hint`(写后即审) | `mcp/src/main.rs` |
| 蒸馏产物的类型体系 | doc 14 ingest/research/consolidate 飞轮 + `templates/wiki-starter/`(Source/Summary/Entity/Concept/Query 契约 + 5 条 Health QQL) | doc 14;`templates/wiki-starter/types/*.md` |
| agent 写入的人审机制 | git 归因:turn 级快照 → per-agent ref,默认不进 HEAD,采纳/撤销两键 | doc 11 §4;`app/src-tauri/src/git_attr.rs` |

**断点(差距)**:

1. **线程到 vault 零路径**。`agent_thread_*` 六命令只有 create/list/load/append/clear/delete——没有 export;doc 11 §3 的「线程导出为 md 入 vault」仅一句 backlog,**且 `docs/backlog.md` 里没有对应 ID 条目**(grep 无蒸馏/导出相关项)——规划与 backlog 之间的小漂移,本文顺手记录。
2. **归一化只服务移交**。`normalizeForHandoff` 的产物是「给下一个 agent 的 seed」,头部语义是「承接自 X 的线程」;要成为「vault 里的 Source 笔记」需要另一套面向**人类未来读者**的骨架(frontmatter + 出处 + 不可变语义)。
3. **转录层没有「值得固化」的信号**。threads 表无标题、无摘要、无消息统计之外的元数据;「哪条线程值得蒸馏」目前只能靠人翻列表(线程列表只有 agent/时间/消息数)。
4. **MCP 侧读不到转录**。`open-llm-wiki-mcp` 是独立进程、只读 vault 目录;转录在 app data——外部 agent 想「把我刚才的会话存进 vault」也拿不到原文(这是刻意边界,见 §4)。

**刻意决策(本方案不推翻)**:doc 11 §3 明确「转录是应用数据、不是 vault 知识——不进 vault、不进 git」。理由成立:转录含大量噪声(thinking/permission 往返/逐 token 增量)、可能含敏感内容、体量增长快,进 vault 会污染图谱与 git 历史。**本方案的全部设计都以此为不变量:原始转录永留应用数据,只有蒸馏产物、且经显式动作与人审,才进 vault。**

---

## 3. 技术调研

> 围绕「如何把 agent 对话/会话经验固化成可检索的长期知识」。调研 [n] 编号沿用上游;本文新增来源标 [D*],见 §7。

### 3.1 固化时机(何时蒸馏)

四种时机模型,按「人介入多少」排序:

1. **纯手动 / 快捷键式**。Claude Code 早期 `#` 快捷键:输入以 `#` 开头的一行即存入 CLAUDE.md 记忆文件(2025 年中推出 [D3]);**2025-12 v2.0.70 移除**,官方替代是「直接告诉 Claude 去改 CLAUDE.md」[D2]。这个「从快捷键直记 → 收敛为经 agent 写」的产品演化本身是个信号:轻量直记的维护成本(写哪、去重、过期)最终压给了用户,经 agent 写能顺带做归并与改写。现存的纯手动形态是「ask Claude to remember X」→ 存 Auto memory [D1]。
2. **会话中 agent 自决**。Claude Code Auto memory:默认开启,Claude 在工作中自行判断「这条信息对未来会话是否有用」,值得才写;存储为每项目 `~/.claude/projects/<project>/memory/`(同 git repo 的各 worktree 共享),`MEMORY.md` 作索引(每会话载入前 200 行/25KB)+ 主题文件按需读;机器本地、不进版本库;写入时自动打 `modified:` 时间戳 [D1]。**关键设计点:索引(常驻)+ 主题文件(按需)的两级结构**——正是 Karpathy `index.md` + 页面 的迷你版 [1]。
3. **会话间隙后台蒸馏(sleep-time)**。Letta「Dreaming」:后台子 agent 在会话间隙「审阅近期对话、提炼有用教训、更新记忆,不打断活跃工作」;**触发 = 配置的消息数,或上下文窗口被压缩时**(不是空闲计时);记忆经 MemFS(「git 为底座的记忆文件系统」)跨会话共享;`/sleeptime` 配置 [D4]。这是「固化时机」最显式的工程答案(调研 [36] 的现行文档版)。**注意:蒸馏判断本身会出错,错误同样会被固化**(调研卡片 3 的局限)。
4. **新笔记触发邻居修订(evolution)**。A-MEM Memory Evolution:新记忆笔记加入后,回看与之相关的旧笔记,「触发对既有历史记忆的语境表征与属性的更新」,让网络持续精化 [8][D6]。LoCoMo 消融:去掉 evolution 多跳 F1 45.85 → 31.24(−14.61,最大单项贡献)[8]。对应到 wiki:**蒸馏产物落库不是终点,consolidate(修邻居、补链接、跑 Health)才是闭环**——doc 14 §3 已有此步骤,缺的只是把它接在蒸馏后面。

Generative Agents 的 reflection 是「阈值触发归纳」的源头:重要性打分累积到阈值后,把一批低层观察归纳为高层结论;消融中去掉 reflection 可信度 29.89 → 26.88 [28]。它提示第三种触发维度:**按累积量触发跨线程归纳**(N 条线程 → 一篇 Concept),比单线程蒸馏更高阶,L3 可选。

### 3.2 蒸馏方法(蒸馏成什么)

按信息压缩率从低到高的光谱:

| 形态 | 代表 | 特点 |
|---|---|---|
| **原始导出** | 各 CLI 的会话导出;basic-memory 的 Observations 直记 [19][D7] | 零信息损失、零知识密度;检索仍要重读全文;「存了 ≠ 记住了」(调研 §6.2) |
| **会话摘要** | 常规对话摘要;Letta sleep-time 的「提炼教训」[D4] | 有损但可读;LoCoMo 证据:基于摘要的检索在对抗/长程题上丢信息严重 [37] |
| **原子主张 / 事实** | mem0:抽取阶段提取「显著事实、偏好、事件」,更新阶段对每条候选决定 ADD/UPDATE/DELETE/NOOP [29][D5] | 最利于「更新」语义(旧记忆可被显式删除而非堆积);抽取本身丢信息并引入错误(调研 §4.2) |
| **「一次对话一张卡」** | Zettelkasten 心智:一条线程 = 一张笔记卡(主张 + 出处 + 链接),A-MEM 的笔记单元是其自动化形态 [8][D6] | 摘要与原子主张的中间态:**粒度 = 线程**,卡与卡靠链接复利;与 doc 14「一篇 Source 一篇 Summary」的节奏天然对齐 |
| **类型化 wiki 页** | Karpathy Ingest(一源触 10–15 页)[1];doc 14 的 ingest(Source → Summary + Entity/Concept) | 压缩率最高、检索最廉价、复利最强;错误也扩散得最远(10–15 页 [1]) |

Zettelkasten 传统给这条管道的三个现成概念:① **原子性**——「每张笔记只做一个主张、注明来源、至少指向一个链接」[D9];② **三级笔记**——fleeting(草稿)→ literature(来源笔记)→ permanent(自己的主张),映射到这里就是:**原始转录 = fleeting(留在应用数据,用完即弃的心态)、导出的 Source = literature note、蒸馏出的 Concept = permanent note**——固化管道本质是把笔记沿这三级向上搬;③ **反面警告**:Zettelkasten 社区对 AI 批量造卡的态度明确——「你可以让 AI 生成十万张笔记,但它们对你都是陌生的」[D10]:蒸馏的价值以**人审与少量精卡**为前提,批量自动化恰恰毁掉它。

**决策与教训(decisions/lessons)抽取**值得单独说:agent 会话里最高价值的往往不是事实而是**决策(为什么这么改)与教训(踩了什么坑)**——这正是 Claude Code 建议写进 CLAUDE.md 的内容(「Claude 第二次犯同一个错时」「code review 指出它本应知道的事」[D1]),也是 Auto memory 的典型条目(构建命令、调试心得、偏好 [D1])。对 Open LLM Wiki:决策/教训最自然的落点是 **Concept(主张)或 Entity 画像的补充**,而非 Summary——L2 的蒸馏提示词应显式分槽(事实/决策/教训/待办),而非一整段摘要。

### 3.3 代表系统对照表

| 系统 | 存储形态 | 固化时机 | 蒸馏粒度 | 人审门 | 对 Open LLM Wiki 的参照点 |
|---|---|---|---|---|---|
| Claude Code Auto memory [D1] | markdown(MEMORY.md 索引 + 主题文件),机器本地、不入 git | 会话中 agent 自决 + 用户「remember X」 | 经验/偏好条目 | `/memory` 可浏览编辑 | 「agent 自决写什么」已产品化;但它**在版本库外**,恰说明我们要反过来:进 vault = 进 git = 有版本真相 |
| Claude Code `#` 快捷键 [D2][D3] | CLAUDE.md | 人快捷键 | 一行 | 无(直写) | 已被官方移除——轻量直记入口让位给经 agent 的写 |
| Letta sleep-time [D4] | core blocks + archival + MemFS(git 底座)[34][35] | 消息数 / 上下文压缩触发,后台 | 教训归纳 + 记忆块更新 | 无显式门(可配) | L3 的直接蓝本;**触发器选型照抄:消息数 + 压缩,而非空闲计时** |
| mem0 [29][D5] | 记忆库(+图变体 mem0g,+2%) | 每次交互后抽取 | 原子事实,ADD/UPDATE/DELETE/NOOP | 无 | UPDATE/DELETE 语义 → 蒸馏进 vault 时「并入既有 Concept vs 新开页」的判断 |
| A-MEM [8][D6] | Zettelkasten 笔记网络 | 写入时 + evolution | 笔记卡(关键词/标签/语境/链接) | 无 | 蒸馏后必须跑 consolidate 的消融证据(−14.61 F1) |
| Generative Agents [28] | 观察流 + reflection 树 | 重要性累积阈值 | 低层观察 → 高层归纳 | 无 | 跨线程归纳(N 线程 → 一 Concept)的触发思路 |
| basic-memory [19][D7] | markdown 即记忆,Entity/Observation/Relation,人机共写 + sync | 随时(MCP `write_note` 等) | 观察条目 | 人可直接编辑 | 形态最近的对照组;**AGPL-3.0,仅作概念参照(许可红线)**;它不区分原始/蒸馏,是我们刻意要区分的 |
| Karpathy LLM Wiki [1] | 三层文件 + index/log | Ingest 工作流(人/LLM) | 类型化 wiki 页 | LLM 全权但人可改 | doc 14 即其落地;「好答案归档回 wiki」[1] 是 Query → 回填的出处 |

### 3.4 质量、隐私与安全风险

**质量(蒸馏会丢信息、会引入错误)**:
- 蒸馏是有损压缩:LoCoMo 上基于摘要/观察的检索丢信息,长上下文在对抗题 F1 崩到 2.1 [37]。**对策:原始转录永不删除**(应用数据保留),蒸馏产物 frontmatter 回指线程 id,可回溯。
- 错误会随综合扩散:一个源触 10–15 页 [1],蒸馏错一次、错进 10–15 页;六种知识漂移与「矛盾抹平」在蒸馏产物上同样发生(调研 §6.5 [11])。**对策:蒸馏产物不是权威,`reviewed:` 未填前只算 provisional;Health QQL 已能查出单源/无复审页面(doc 14 §3.1)。**
- 负面基准证据:LLM 生成的 AGENTS.md 类上下文文件使编码 agent 成功率 −3%、成本 +20%,人写的才 +4%(调研 [12])——**蒸馏产物若质量差,喂回 agent 是负资产**。这支持「人审门 + 宁缺毋滥」。

**隐私(转录含敏感内容)**:
- 转录可能含凭证、路径、隐私对话(agent 会话的常态)。现状「转录留应用数据、不进 git」本身就是一道隐私屏障;**蒸馏入 vault = 可能进 git = 可能被 push**,屏障就此穿透。因此:蒸馏必须是**显式人触发的动作**(绝不自动批量),导出前 UI 应提示「此内容将进入 vault 并可能随 git 提交」;L3 任何自动化都维持逐次确认。
- Claude Code 的对照:Auto memory 明确**机器本地、不跨机、不进版本库** [D1]——业界对「agent 自动写的记忆」同样默认不进共享版本面。我们让蒸馏产物进 vault 是**更激进**的选择,正当性来自「显式 + 人审 + git 可还原」,三者缺一不成立。
- 敏感内容进入 agent 侧存储不是假想:有安全博客报告 Claude Code 会未经提示自动读取项目里的 `.env*` 凭证文件(「credentials are silently loaded into memory」,该文称是运行时内存而非模型上下文,机制细节以其原文为准)[D8];社区亦有关于 .env 密钥被落进本地文件历史的讨论(Reddit,登录墙未深核)[D8b]。两者机理不同,但共同佐证:**agent 工作流天然吸附凭证类内容,转录是其一**。蒸馏管道对隐私的态度因此必须是「默认不动、动则显式、显式带警告」。

**安全(记忆投毒的具体化路径)**:
- MINJA 证明经纯查询接口即可向 agent 记忆注入,「注入发生在二月,伤害发生在四月」[15];Unit 42 的链条是**间接注入 → 进入会话摘要 → 持久 365 天 → 静默外泄** [14]。蒸馏管道把这两条链的中间段产品化了:恶意网页/笔记内容诱导 agent 在会话里说出带毒「教训」→ 用户蒸馏入 vault → 之后的会话把毒当知识读回(vault 内容进 agent 上下文,doc 11 §5 已点破这是不可信输入)。
- 防御栈对位(调研 [15]):**溯源标注** = `provenance:` 字段(§5.3);**写入前校验** = `write_note` 断链审计已有;**信任加权/时间衰减** = 信任分级专文的领域,本文只留钩子;**用户确认** = 人审门(L1/L2 显式动作、L3 quarantine)。

---

## 4. 与 Open LLM Wiki 的适配分析

**五层落点(对照 doc 07 §3)**:

| 五层 | 蒸馏管道的落点 |
|---|---|
| Raw | 导出的线程笔记 = `type: Source`(不可变,更新 = 重新导出产新 Summary);原始转录仍在应用数据,是比 Source 更底层的「Raw 的 Raw」,不进五层 |
| Wiki | L2 蒸馏产物 = Summary/Entity/Concept,关系边 `source`/`derived_into`/`mentions` 全走现有机制 |
| Schema | 沿用 `templates/wiki-starter/` 类型契约;新增 `provenance:`/`reviewed:` 两个**软字段**(软类型零校验原则,doc 03) |
| Navigation | 无新增:图谱自动画出新 Source/Summary 的边;蒸馏产物经 `search_notes`/`run_qql` 可检索 |
| Health | 「蒸馏未审」可编译成一条 QQL(`provenance = "agent"` 且 `NOT has reviewed`,示意见 §5.3)——Health 即查询的又一实例;引擎已具备(专文实测任意 frontmatter 字段可查),模板可后补 |

**与 doc 11 刻意决策的相容性**:
- 转录留应用数据 → **不变**。管道只读转录(load),不改存储、不动表结构(L1;L3 若需「已蒸馏」标记,加一列或一张映射表,仍属应用数据——【默认】加 `distilled_note TEXT` 列记导出路径,见 §6)。
- 「导出为 md 入 vault」从可选 backlog 升级为**显式动作 + 蒸馏工作流**,不是推翻而是把那句 backlog 做完整。
- Model C 的归一化规则(留什么/压什么/丢什么)直接复用为导出骨架的基础,**不伪造、不注入、不破坏契约**的原则照旧。

**架构分层适配(AGENTS.md)**:
- **core 保持 IO-free**:蒸馏的「纯逻辑部分」(线程 → markdown 渲染、路径 slug、frontmatter 生成)是可测纯函数。但 core 的领域是 vault 索引/查询,线程渲染不属其领域——**【默认】放 `ui/src/lib/distill.ts`**(与 `agent-session.ts`/`ai-context.ts` 同层,vitest 可测、浏览器 mock 可用);若未来 MCP 侧也要渲染,再评估下沉 Rust(届时放 `app` 层工具函数或新 crate,而非 core)。**需人拍板。**
- **app 保持薄命令层**:L1 零新命令(编排走 ui);L2/L3 至多 1–2 个命令,必须注册进 `generate_handler!`。
- **ui 浏览器 mock 对称**:注意现状——`AgentPanel.tsx` 对 agent/transcript 命令是**直接 `invoke`,不经 `ipc.ts`/`mock.ts`**,浏览器 mock 模式本就没有转录数据。L1 导出按钮应 `ipc.isMock()` gate(同 git/Reveal in Finder 先例),或在 mock.ts 补线程 fixture 供预览——【默认】前者(桌面专用),见 §6。
- **QQL 只作 IR 不做用户面**(doc 07 §5 已撤用户面):Health 查询经 MCP `run_qql` / 保存的 `type: Query` 笔记消费,不开 UI 例外。

**许可红线**:本方案零 copyleft 参照源码——basic-memory(AGPL-3.0)只作概念对照(调研卡片 8 同口径);Letta/mem0 只引文档与论文;实现全部自写。

---

## 5. 工程方案(候选,需人拍板)

### 5.0 设计原则与不变量

1. **原始转录永留应用数据**——不进 vault、不进 git(doc 11 决策,不动)。
2. **蒸馏产物走类型体系**——Source/Summary/Entity/Concept + doc 14 字段约定,不发明平行类型。
3. **人审门结构性存在**——L1/L2 显式动作;L3 即使自动蒸馏也经 git 归因 quarantine(采纳/撤销)+ `reviewed:` 字段双门。
4. **Open LLM Wiki 不内置 LLM 调用**——一切「智能」经用户自带 agent(ACP 子进程 / MCP 客户端)。隐私上这是特性:转录内容只流向用户自己选的 agent。
5. **能不加依赖就不加**(§5.5);能不加命令就不加(L1 零命令)。
6. **可回溯**:蒸馏产物 frontmatter 记 `thread_id`/`agent`/导出日期,原始转录是它的「底片」。

### 5.1 分期 L1/L2/L3

**L1 — 线程导出为 `type: Source` 笔记(最小可用,显式动作)**
- **范围**:AgentPanel 的线程视图(历史会话浮层 + 当前线程菜单)加「导出到 vault」按钮 → 调 `agent_thread_load` 取消息 → `renderThreadAsSource()`(新纯函数)渲染 markdown → 调已有 `create_note` 命令落盘。**零新 Tauri 命令、零 core 改动、零新依赖。**
- **改哪些模块**:`ui/src/lib/distill.ts`(新,纯函数)+ `distill.test.ts`(新)+ `ui/src/components/AgentPanel.tsx`(按钮 + 保存提示)。mock 模式按 §4 决策 gate 或补 fixture。
- **测试/验收**:vitest 覆盖渲染(角色混合/空线程/超长截断策略/frontmatter 转义);typecheck;手动验收 = 真机导出一条线程,图谱出现新 Source 节点。
- **验收标准**:导出产物经 MCP `write_note` / `links kind=dead` 复查零断链(默认骨架不含 wikilink,除非显式链接到真实存在的笔记)。

**L2 — 蒸馏步骤(Source → Summary/Entity/Concept)**
- **L2a 零代码路径**:导出的 Source 已在 vault,用户对外部 agent(Claude Code/Cursor 经 MCP)或在应用内 agent 说「按 doc 14 ingest 这篇」即可。需要做的只是**文档**:把这条路径写进 B-WIKI-AGENT-DOC(调研差距 1)。
- **L2b 应用内一键蒸馏**:AgentPanel 对已导出 Source 加「蒸馏」按钮 → 新线程,seed 消息 = ingest 指令(改写成提示词模板,放 `templates/wiki-starter/prompts/ingest-distill.md`【示意路径】)+ Source 路径;agent 经 ACP fs 工具写入(受三档权限门控),git 归因 quarantine 兜底。纯函数 `buildIngestSeed(sourcePath, sourceContent)` 入 `distill.ts` + vitest。
- **分槽提示词**:蒸馏指令显式要求分「事实 / 决策与理由 / 教训 / 待办」四槽(§3.2),分别落 Summary 要点与 Concept 候选,而非一段摘要。
- **测试/验收**:vitest(seed 构建);真机验收 = 一次端到端蒸馏后 consolidate(doc 14 §3)跑通,Health QQL 数字变化符合预期。

**L3 — 固化时机自动化(sleep-time 式,远期)**
- **触发器**(参照 Letta [D4],不用空闲计时):① 线程结束(`agent_stop` / picker 切换即结束当前线程)时,若线程满足「值得蒸馏」启发式则**提示**(默认)或自动排队(可选);② 消息数阈值(【默认】≥ 20 条且含 ≥ 1 次文件写——供人改)。
- **纯本地部分**(无需 LLM):「值得蒸馏」评分 = 纯函数(消息数/文件写数/错误数加权),位置同 L1 渲染函数(`ui/src/lib/distill.ts`)。
- **依赖外部 LLM 的部分**:蒸馏执行本身——仍经用户 agent(起一个后台线程跑 L2b 的 seed)。**Open LLM Wiki 侧没有任何新模型依赖。**
- **跨线程归纳**(reflection 式 [28],可选远期):N 条同源线程 → 一篇 Concept 候选,触发与形态均未定,只占位。
- **默认关**。开关与阈值归 doc 11 §9.5 的 mode/config 表面。

### 5.2 数据与接口设计(示意)

**导出 md 骨架(L1 产物,示意)**:

```markdown
---
type: Source
status: Unprocessed
agent: opencode
thread_id: 123
created: 2026-08-06
evidence_tier: opinion        # 默认值,现有五档词表内最贴近;是否新增 conversation 档需人拍板(§6)
provenance: agent             # 对齐信任分级专文字段集(§5.3)
reviewed:                     # 预留字段,空 = 未复审
---

# 对话记录:opencode · 2026-08-06(线程 #123,42 条消息)

> 导出自 Open LLM Wiki 应用内 agent 线程。原始转录仍存应用数据(SQLite),
> 本笔记是其蒸馏底稿;更新 = 重新导出 + 旧 Summary 标 Superseded(Source 不可变)。

**我:** ……
**opencode:** ……
- 工具:read docs/14-llm-wiki-workflow.md
- 工具:write notes/x.md(+12/-3)
```

- 路径:【默认】`agents/thread-<id>-<agent>-<YYYY-MM-DD>.md`(文件夹不承载语义,纯组织;供人改)。
- 骨架复用 `normalizeForHandoff` 的取舍规则(留/压/丢),头部语义换成「面向未来读者」;**不复制其实现,抽公共纯函数**(两者同层同风格,重构与否开工定)。

**Tauri 命令**:L1 无新增。若 L3 需要查询「线程是否已导出」,示意签名(届时**必须注册进 `lib.rs` 的 `generate_handler!`**):

```rust
// 示意:L3 才需要;app 薄层,逻辑纯函数化可测
#[tauri::command] agent_thread_mark_distilled(root, thread_id, note_path) -> Result<(), String>
```

**MCP 工具(可选,暂不做)**:外部 agent 无法读应用数据转录(进程边界,§2 断点 4)。若未来要 `distill_thread` 类工具,需解决 db 路径发现(同一 FNV 哈希约定)——把 app data 布局暴露给独立进程是耦合点,【默认不做】,列入 §6。

### 5.3 与 provenance / 信任分级的衔接(只留钩子)

该方向已有专文:[`trust-provenance-frontmatter.md`](./trust-provenance-frontmatter.md)(与本文同日上游分叉)。本文**不自造字段**,直接对齐其推荐字段集:

- `provenance: human | agent | ingested` —— 蒸馏产物一律填 `agent`(产出者维度);「是哪个 agent、哪条线程」由本文的 `agent:` / `thread_id:` 字段承载,与专文三维设计(producer / origin / trust)正交不冲突;
- `reviewed:` —— 留空 = 未复审,人复核后填 `YYYY-MM-DD`(专文的时间衰减锚点);
- `trust: 0-3`(可选)—— 本文不设默认,按专文口径「不填则靠 provenance + reviewed 隐式推」。

专文已本地实测:QQL 能直接读任意 frontmatter 字段(`has reviewed`、`group_by(provenance)` 均通,零 core 改动)——所以 §4 Health 行的「蒸馏未审」查询(**示意**:`WHERE provenance = "agent" AND NOT has reviewed SHOW title`)引擎侧已就绪,只欠模板。软类型零校验(doc 03 / open-questions P4):字段缺席完全兼容。

### 5.4 测试与 CI 影响

| 层 | 影响 | 新增测试 |
|---|---|---|
| core(`open-llm-wiki-core`) | **零改动**(方案刻意不碰) | 无 |
| app(`open-llm-wiki-app`) | L1 零改动;L3 或加 1 命令 | 若加命令:`cargo test -p open-llm-wiki-app` 覆盖(SQLite 侧仿 `transcript.rs` 现有纯测试模式) |
| ui 纯逻辑 | `distill.ts` 新纯函数 | vitest:`renderThreadAsSource`(角色混合/空线程/转义/截断)+ `buildIngestSeed`;对齐 `agent-session.test.ts` 风格 |
| ui e2e(playwright) | 可选 | 现有 `smoke.spec.ts`/`palette-search.spec.ts` 不受影响;导出流在 mock 模式不可用则不加 e2e,留真机验收 |
| CI 三 job | core-and-ui 会跑新 vitest(typecheck + test:cov);app job 仅在加命令时受影响;e2e job 不受影响 | — |

收工门槛(AGENTS.md):typecheck + test:cov + 涉及的 `cargo test -p`(+ e2e 若触及)。

### 5.5 新增依赖与许可

- **L1/L2:零新增**——rusqlite/serde 已在,渲染是手写字符串拼接(与 `normalizeForHandoff` 同风格)。
- L3 若做后台调度:优先复用现有 ACP 线程机制,不引新 crate;确需新依赖时先查许可(MIT/Apache 优先,GPL/AGPL 一票否决)并登记 `THIRD_PARTY_NOTICES.md`。

---

## 6. 风险与开放问题

| # | 问题 | 默认(供人改) | 需人拍板? |
|---|---|---|---|
| 1 | 蒸馏渲染纯函数放哪 | `ui/src/lib/distill.ts`(不进 core) | ✅(若 MCP 侧也要用则重议) |
| 2 | `evidence_tier` 对会话记录取什么 | `opinion`(现有词表内);候选新档 `conversation` | ✅ |
| 3 | 导出路径与命名 | `agents/thread-<id>-<agent>-<date>.md` | ✅ |
| 4 | mock 模式行为 | `isMock()` gate(桌面专用,同 git 功能先例) | ✅ |
| 5 | 「已蒸馏」标记落哪 | threads 表加 `distilled_note TEXT` 列(应用数据内) | ✅(L3 前可不动) |
| 6 | MCP 是否暴露转录导出 | 不做(进程边界 + app data 耦合) | ✅ |
| 7 | L3 触发阈值 | 线程结束提示;≥ 20 消息 + ≥ 1 文件写;默认关 | ✅ |
| 8 | 蒸馏提示词模板位置 | `templates/wiki-starter/prompts/`(随脚手架分发) | 小,可开工定 |
| 9 | **蒸馏丢信息**:摘要错误无法从产物自查 | 保留 `thread_id` 回溯 + `reviewed:` 未填前 provisional | 不需要(结构已兜) |
| 10 | **隐私**:转录含凭证/隐私,入 vault = 可能进 git | 导出恒为显式动作 + UI 提示;L3 自动化维持逐次确认 | ✅(提示文案) |
| 11 | **记忆投毒**:对话注入 → 蒸馏入 vault → 读回放大(MINJA [15] 路径) | 人审门 + `provenance:` / `reviewed:`(对齐 [`trust-provenance-frontmatter.md`](./trust-provenance-frontmatter.md)) | 部分(字段集由专文拍板) |
| 12 | backlog 漂移:doc 11 的「导出为 md」backlog 无对应 ID | 本文记录;补 ID 与否由人 | ✅(顺手即可) |
| 13 | doc 11 §3 表结构写 `normalized_text`,代码实为 `text` 列 | 记录漂移,不改历史文档 | 否(仅记录) |

---

## 7. 引用来源

> 上游调研的 40 个来源见 [`agent-memory-survey.md` §8](./agent-memory-survey.md);本文沿用其编号 [n]。
> 下列 [D*] 为本文新增,全部一手来源优先,2026-08-06 获取。

- [D1] Anthropic. *How Claude remembers your project*(Claude Code 官方记忆文档:CLAUDE.md 层级 / Auto memory 机制 / 「remember X」/ `/memory`)— https://code.claude.com/docs/en/memory
- [D2] claudelog. *Claude Code Changelog*(v2.0.70:「Removed # shortcut for quick memory entry (tell Claude to edit your CLAUDE.md instead)」)— https://www.claudelog.com/claude-code-changelog/ ;佐证 issue:https://github.com/anthropics/claude-code/issues/14868
- [D3] Boris Cherny(Claude Code 作者之一). `#` 快捷键发布公告(二手,转述)— https://www.threads.com/@boris_cherny/post/DHq60G7vkNz/
- [D4] Letta. *Sleep-time agents / Dreaming*(触发 = 消息数或上下文压缩;MemFS = git-backed memory filesystem)— https://docs.letta.com/guides/agents/sleep-time-agents
- [D5] *Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory* — arXiv:2504.19413(摘要页核对:抽取/巩固显著信息;图变体 +2%;LoCoMo 相对 +26%、p95 −91%、token −90%+;ADD/UPDATE/DELETE/NOOP 两阶段管线细节沿用调研 [29])— https://arxiv.org/abs/2504.19413
- [D6] Xu et al. *A-MEM: Agentic Memory for LLM Agents*(Zettelkasten 笔记结构;Memory Evolution = 新笔记触发邻居语境/属性更新;量化沿用调研 [8])— https://arxiv.org/abs/2502.12110
- [D7] Basic Machines. *basic-memory* README(「Your knowledge lives as Markdown files」;Entity/Observations/Relations;MCP 工具含 `write_note`/`build_context`;AGPL-3.0)— https://github.com/basicmachines-co/basic-memory
- [D8] Knostic. *Claude Code Automatically Loads .env Secrets, Without Telling You*(安全博客,机制细节以其原文为准)— https://www.knostic.ai/blog/claude-loads-secrets-without-permission
- [D8b] Reddit r/SideProject. *Claude Code silently stores your .env API keys in local file history*(社区报告,登录墙未深核,仅作佐证)— https://www.reddit.com/r/SideProject/comments/1rec44l/
- [D9] Zettelkasten 社区讨论与原则(原子性:「Each note should make one claim, name its source, and point to one [link]」;AI 造卡工作流)— https://forum.zettelkasten.de/discussion/2658/how-do-you-use-ai-to-create-notes-for-zettelkasten ;https://www.atlasworkspace.ai/blog/zettelkasten-method-guide ;官方站 AI 篇:https://zettelkasten.de/posts/how-to-build-zettelkasten-master-ai/
- [D10] Reddit r/Zettelkasten. *Zettelkasten and AI*(反面证据:「AI 可以生成十万张笔记,但它们对你是陌生的」)— https://www.reddit.com/r/Zettelkasten/comments/1fac79c/

**诚实标注**:
- 一手证据(本次直接获取):[D1][D4][D5][D6][D7] 的引述内容经原文页核对;[D2] 的 changelog 条目经搜索快照确认(原站未逐页抓取)。
- 二手/社区来源(已降级使用,仅作佐证不作结论依据):[D3][D8][D8b][D10];[D9] 中「一主张一卡」原则是社区文章表述,与 Ahrens 原典一致但未逐字核对原典。
- 沿用上游一手来源:凡标 [n] 的数字与引文,其一手出处见上游 §8;本文不重复核验。
- **推断(无直接一手来源)**:「原始转录 = fleeting、导出 Source = literature note、Concept = permanent note」的三级映射是本文类比,非某文原话;L1/L2/L3 方案中的全部「默认值」均为本文提议,无一来自既有决策。

**调研局限**:WebSearch 在本环境部分失效,两处检索经备用通道完成;`#` 快捷键的引入时间以公告帖(二手)为据、移除时间以 changelog 快照为据,未逐版核对官方 release notes。

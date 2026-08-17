# 调研报告: AgriciDaniel/claude-obsidian — Skills 形态的 LLM Wiki「第二大脑」

> **性质**:调研文档。**只陈述、不拍板**——是否借鉴、如何借鉴仍由人决策。
> 调研日期:2026-08-17 · 来源:[AgriciDaniel/claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) · 版本:v1.9.2(master @ 2026-08-01)· 许可:MIT · 规模:★ 10,944 / Fork 1,270(GitHub API 2026-08-17)· 语言:Bash / Python / Markdown(无编译产物,Claude Code 插件形态)· 状态:活跃(2026-04-07 建仓,4 个月内 1.0 → 1.9.2)
> 证据持久化:本次调研为 GitHub API 元数据 + zread 直读 `README.md`、`WIKI.md`、`skills/wiki-retrieve/SKILL.md`、`skills/wiki-lint/SKILL.md`、`docs/dragonscale-guide.md`、`hooks/hooks.json`、`wiki/comparisons/claude-obsidian-ecosystem.md`,未落地独立 evidence.jsonl;关键断言均可由上述文件复核(路径前缀均为该仓库根)。
> 上游关联:[../07-llm-wiki-architecture.md](../07-llm-wiki-architecture.md)、[../14-llm-wiki-workflow.md](../14-llm-wiki-workflow.md)、[../11-in-app-agent-roadmap.md](../11-in-app-agent-roadmap.md)、[agent-memory-survey.md](./agent-memory-survey.md)、[semantic-retrieval.md](./semantic-retrieval.md)、[content-lint-contradiction.md](./content-lint-contradiction.md)、[trust-provenance-frontmatter.md](./trust-provenance-frontmatter.md)、[openkb-survey.md](./openkb-survey.md)

---

## 1. TL;DR

1. **同源异形**:它与我们出自同一思想源头(Karpathy LLM Wiki pattern),但形态是 **Claude Code 插件**——15 个 skills + slash commands + hooks + 12 个 Bash/Python 脚本,LLM agent 是运行时,脚本只做确定性杂活(锁、BM25、嵌入、打分)。我们是原生 Tauri app + Rust core。**它不是又一个笔记 app,而是「用 Claude Code 驱动 Obsidian vault」的编排层**。
2. **市场信号强烈**:建仓 4 个月 ★ 10.9k / fork 1.3k,是 LLM Wiki 赛道目前热度最高的实现(对照:obsidian-copilot ★ 5.8k、smart-connections ★ 4.4k、OpenKB ★ 3.4k)。LLM Wiki 模式的需求被真实、快速地验证了。
3. **Vault schema 与我们高度同构**:`.raw/`(不可变源)+ `wiki/`(sources/entities/concepts/comparisons/questions + index/log/hot),frontmatter `type` + `status`(seed→developing→mature→evergreen)唯一状态真相——与我们的 Source/Summary/Entity/Concept + `status:` + `.raw` 不可变约定几乎一一对应,差异在我们多一层 provenance/trust/reviewed 软字段纪律。
4. **最有工程含金量的是 v1.7「Compound Vault」**:chunk 级混合检索(contextual prefix + BM25 + ollama cosine rerank,复刻 Anthropic Contextual Retrieval),**50-query 基准 +32pp top-1 / −41% 错误率**(对比 v1.6 页级 hot→index→drill);配套按文件 advisory lock 解决并行 ingest 子代理互踩;全部 opt-in + 特性探测 + 退出码降级,装不上就回旧行为。
5. **Hot cache 是全生态独有机制**(他们自评):`wiki/hot.md` ≈500 词会话缓存,SessionStart hook 静默注入、**PostCompact 压缩后再注入**、Stop hook 提醒更新——一套极廉价的跨会话上下文恢复闭环。
6. **DragonScale 扩展四机制**各有一个可借鉴核:fold(log 卷积)、确定性页址(`c-NNNNNN` 计数器 + flock + 单写者规则)、**语义 tiling 重复页检测**(ollama 嵌入 cosine 分带 + 手工校准流程 + 规模上限 5000 硬失败)、**boundary-first autoresearch**(`(出度−入度)×新近度` 前沿打分喂「下一个研究什么」,且诚实标注「这是议程控制,不是纯记忆」)。
7. **弱项即我们的差异化**:双硬依赖(Claude Code 订阅 + Obsidian)、一切结构操作烧 agent tokens、无原生查询语言(查库 = agent 读 index.md)、检索栈要用户自装 python3 + ollama 且索引靠手动刷新、tiling O(N²) 5000 页硬上限。我们「本地确定性 core(图谱/QQL/lint 不耗 token)+ 原生 app + MCP」正面对着这些缝隙。
8. **对我们最值得抄的三件事(思想,非代码)**:① hot cache 会话注入(含压缩后再注入)对应我们应用内 ACP agent 的上下文恢复;② frontier 打分对应 doc 14 §3.3「下一篇吃什么」的确定性化;③ 语义重复页检测的**校准纪律与降级姿势**对应我们 L1-B `duplicate_names` 的 L2 增强与 semantic-retrieval 触发条件量化。
9. **许可干净**:MIT 非 copyleft;按仓库纪律**零逐字复制**,只借鉴机制与数据点,不引入任何代码 → 无需登记 THIRD_PARTY_NOTICES。

---

## 2. 项目概况

### 2.1 一句话

> You drop sources. Claude reads them, extracts entities and concepts, updates cross-references, and files everything into a structured Obsidian vault. **The wiki is the product. Chat is just the interface.**(README / WIKI.md)

### 2.2 形态与分发

| 维度 | 事实 |
|---|---|
| 运行时 | Claude Code(生产验证);skills 格式实验性兼容 Codex / Cursor / Windsurf / Gemini CLI |
| 组成 | 15 skills(`wiki`/`wiki-ingest`/`wiki-query`/`wiki-lint`/`wiki-retrieve`/`wiki-cli`/`wiki-mode`/`wiki-fold`/`autoresearch`/`canvas`/`save`/`defuddle`/`obsidian-bases`/`obsidian-markdown`/`think`)+ 4 agents + 4 slash commands + hooks.json + 12 scripts + 9 套 hermetic 测试(~1240 断言,`make test`) |
| 安装 | ① clone 为 vault + `setup-vault.sh`;② Claude Code 插件市场(`claude plugin install`);③ 复制 WIKI.md 进现有 vault |
| 传输层 | obsidian-cli(默认)> mcp-obsidian / mcpvault > 文件系统 Read/Grep 兜底;`detect-transport.sh` 自动探测写入 `.vault-meta/transport.json` |
| 分发模型 | 双轨:GitHub 公开版(MIT,全部功能)+ Skool「AI Marketing Hub Pro」社区早访问(2800+ 成员);README 明确「核心无付费独占功能」 |
| 作者背景 | Agrici Daniel(AI Marketing Hub,SEO/营销向);README/FAQ 是明显的 SEO 优化产物(FAQ 直接回答「best AI second brain app」类搜索词) |

### 2.3 与我们的形态对照

他们把**确定性工作压进脚本、判断工作全留给 agent prompt**;我们反过来,**确定性工作(graph/QQL/lint/检索)进 Rust core、agent 只做判断与落笔**。这不是优劣问题,是形态约束:插件形态没有自己的进程,只能借宿主(Claude Code)与脚本。他们 v1.7 越是把检索/锁/打分做成脚本,就越是在「往我们的方向」演化——这本身是对「确定性层有价值」的第三方背书。

---

## 3. 核心机制拆解

### 3.1 Vault schema(WIKI.md)

```
.raw/    # Layer 1:不可变源(规则:never modify)
wiki/    # Layer 2:LLM 生成知识库
  index.md / log.md / hot.md / overview.md
  sources/ entities/ concepts/ domains/ comparisons/ questions/ meta/
```

- frontmatter 扁平 YAML(Obsidian Properties 不支持嵌套);`type: source|entity|concept|domain|comparison|question|overview|meta`。
- **status 生命周期**:seed → developing → mature → evergreen;lint 检查 frontmatter 缺字段。
- **矛盾用 callout 表达**:`> [!contradiction] [[A]] claims X, but [[B]] says Y`,双方页面都插;另有 `[!gap]` / `[!stale]`。语义上等价我们的 `contradicts:` 边 + `status: Contested`,但**它是自由文本、无一致性校验**;我们的 L1-A `contradiction_consistency` 是结构校验,更强。
- **六种 vault 用例**(Website/GitHub/Business/Personal/Research/Book)× **四种方法论模式**(v1.8:Generic/LYT/PARA/Zettelkasten,`.vault-meta/mode.json` 路由新页落位)正交组合;切换模式不自动迁移旧页。
- source 型 frontmatter 有 `confidence: high|medium|low` + `key_claims`;粗粒度,对照我们的 `evidence_tier` + `trust: 0-3` + `last_verified` 是弱版本。

### 3.2 检索:v1.6 页级 → v1.7 chunk 级混合(skills/wiki-retrieve)

v1.6 查询路径:`Read(hot.md) → Read(index.md) → Read(3-5 pages) → synthesize`(token 经济:hot ~500 / index ~1000 / 每页 100-300)。v1.7 承认其缺陷:**答案住在某一段落时,页级粒度必输 chunk 级**。

v1.7 管线(opt-in,`setup-retrieve.sh`):

1. **切块**:按段落边界 ~500 token 目标 / 200 字符重叠。
2. **Contextual prefix**(Anthropic 2024-09 研究的复刻):每 chunk 生成 1-2 句「本 chunk 在全页语境中说什么」前缀,拼进索引文本。三档:Anthropic API(Haiku,prompt caching)→ `claude` CLI 子进程 → synthetic(frontmatter 标题 + 首段,零 LLM)。**外发双重同意门**:`--allow-egress` 旗标 + 安装时确认,默认本地。
3. **BM25**:纯 Python 倒排索引,永在的稀疏层。
4. **Cosine rerank**:本地 ollama `nomic-embed-text`,嵌入缓存按 body hash 增量。
5. 查询侧 `retrieve.py --top 5 --explain`(每阶段可解释);按页去重返回候选,**调用方读整页再综合**(chunk 只用于定位,不直接当上下文喂)。

**基准**(wiki/meta/retrieval-benchmark-v1.7.md,50 查询):+32pp top-1 准确率、−41% 错误率 vs v1.6 基线。成本口径:prefix 生成约 $12/千文档(Haiku + prompt caching)。

工程姿势值得整段抄进我们的纪律库:**特性探测**(`[ -x scripts/retrieve.py ] && [ -d .vault-meta/chunks ] …`,不满足则调用方 MUST 回退 v1.6 读序,skill 永不弄坏基础插件)、**退出码语义**(10 = 未配置 → 友好提示而非栈迹)、**优雅降级**(任一层缺失其余仍出有用结果)、**索引显式不自动刷新**(文档明说,刷新是 ingest 会话后的手动步骤)。

### 3.3 Hot cache + hooks 闭环(hooks/hooks.json)

- `wiki/hot.md` ≈500 词,固定四段:Last Updated / Key Recent Facts / Recent Changes / Active Threads。**整体覆写,是缓存不是日志**。
- `SessionStart`(startup|resume):① `cat wiki/hot.md` 注入;② 清理 1 小时以上的陈旧锁;③ prompt 版兜底(教 agent 静默重读,「不要播报你读了什么」)。
- **`PostCompact`:上下文被压缩后 hook 注入内容会丢失 → 提示 agent 静默重读 hot.md**。这是对「长会话记忆衰减」的最廉价对策,我们此前调研(agent-memory-survey)里没有见到同等简洁的实现。
- `Stop`:检测本会话 `wiki/` 有 diff → 提醒 agent 更新 hot.md(仍然 <500 词、仍然整体覆写)。
- `PostToolUse`(Write|Edit):**检查锁列表非空则跳过本次自动 commit**(写进行中不落 git);否则 `git add wiki/ .raw/ .vault-meta/` + 自动 commit。

注意闭环里的分工:hot.md 的**生成**是 agent 蒸馏(Stop 时),**消费**是 hook 注入(SessionStart / PostCompact)——与我们 doc 14 §1.1「只有显式蒸馏产物进 vault,原始转录不进」的立场天然兼容。

### 3.4 wiki-lint:10 类检查,只观察不动手

孤儿页 / 死链 / 陈旧主张 / 提及多次却缺页的概念 / 缺交叉引用 / frontmatter 缺字段 / 空章节 / index 陈旧条目 / 页址校验(DragonScale)/ 语义 tiling(DragonScale)。姿势:**先出报告再问人**;安全项(补 frontmatter 占位、建 stub、补 wikilink)可自动修,判断项(删孤儿、解矛盾、并重复页)必须人审——与我们的「lint 只产候选、永不自动改 status」完全同频。

结构类检查我们已有对等物(`links kind=dead|orphans|suggest`、L1 系列、QQL health 十一条);**他们独有的是「stale claims:旧页主张被新源反驳/更新」作为 lint 一等公民**——我们把它放在 research/consolidate 流程(doc 14 §3.2.1)而非 lint 目录,思想等价。

### 3.5 DragonScale Memory 四机制(docs/dragonscale-guide.md,全 opt-in)

| # | 机制 | 核心设计 | 对我们的参照 |
|---|---|---|---|
| 1 | **Fold 算子** | 取 log 最近 2^k 条 → 抽取式卷积页(每条结论可溯源到子条目);fold id 确定性(`fold-k3-from-…-to-…-n8`)→ 结构性幂等;默认 dry-run | WORKLOG / vault log 的「概览层」;我们暂无对应物,优先级低 |
| 2 | **确定性页址** | `address: c-000042`(创建序计数器,**非内容哈希**);flock 守护计数器文件;**分代 rollout**:新页必须有址(error),legacy 页缺址仅提示(informational),`legacy-pages.txt` + 日期基线分离两代 | 我们用路径 + git 做身份,无此需求;但「rollout 基线 + 分代豁免」对任何**给存量 vault 引入新不变量**的场景都是好模式(参考 OWF 档 1 的宽容规则) |
| 3 | **语义 tiling lint** | 页级嵌入 cosine 找重复页;带 0.90/0.80 种子阈值;**手工校准流程**(降阈值采样 ≥50 对 → 人工标 duplicate/similar/distinct → 定带、`calibrated: true`);文档直言种子值「非文献真值,预期假阴性」;缓存按 sha256(model+body) 增量,frontmatter 改动不触发重算;flock + 原子写;>500 页警告、>5000 硬失败退出码 4 | **直接命中我们 L1-B `duplicate_names` 的盲区**:撞名精筛只看标题/alias,语义级「同物不同名」它看不见。校准流程、退出码分级(10 ollama 不可达 / 11 模型缺)、规模上限,全是 semantic-retrieval.md「默认关 + 触发条件量化」想要的工程细节 |
| 4 | **Boundary-first autoresearch** | `boundary_score(p) = (out_degree − in_degree) × recency_weight(p)`,读 wiki 建 wikilink 图,输出 top 前沿页作 `/autoresearch` 无主题时的**候选建议**;用户仍可选/改/拒;文档专门一节「**这是议程控制,不是纯记忆**」并保持 opt-in | **doc 14 §3.3 plan(下一篇吃什么)的确定性版本**。我们现在靠 prose 指引(喂最饿 Concept / Contested 加权 / 深度拓宽交替);一条 `boundary` 型查询可以把它变成可跑的信号。「议程控制」的诚实标注也值得学:任何「系统建议你下一步研究什么」的机制都有导向性,应显式标注并默认关 |

### 3.6 多写者安全

- `scripts/wiki-lock.sh` 按文件 advisory lock:并行 ingest 子代理写同一页时一个拿锁写、一个记 skip 下轮重试;陈旧锁 60 秒自刈(README FAQ)+ 会话启动 1 小时大扫除(hooks);PostToolUse 自动 commit 在锁列表非空时**推迟**。
- 边界诚实:页级并发安全 ≠ 全库安全——**页址分配器仍要求单写者**(flock 只防计数器竞态,不把整库变成多写者系统)。
- 对照我们:写入走 MCP `write_note` / 应用内 ACP,git quarantine + 人采纳门(doc 11)天然串行化,当前无并行子代理场景;**若未来做批量 ingest 并行子代理,这套「按文件锁 + commit 让路」是现成设计参照**。

### 3.7 autoresearch 自主研究环

三轮(广搜 3-5 角度 → 补缺口 → 综合校验),`program.md` 用户可配(轮数 / 每会话页数 / 信源偏好 / 置信度规则 / 领域约束);**Web 出口卫生**(v1.8.2+):拒绝 `file://` / `javascript:` / RFC1918 主机(SSRF),剥 `<script>` 与 wikilink 注入,fetch 体 50KB 上限。产物落库走同一 ingest:综合页 + 源页 + 实体/概念页全交叉引用。
对照:我们的 research(doc 14 §2)记录缺口喂 plan,闭环同构;我们暂无 agent 自主上网检索路径(应用内 agent 无 web 工具),但**出口卫生清单在任何未来「agent 拉网页」功能里都该原样照办**(等价红线我们在 plugin/MCP 沙箱讨论中已有,这是可抄的细则清单)。

---

## 4. 与 Open LLM Wiki 逐项对照

| 维度 | claude-obsidian | Open LLM Wiki(我们) |
|---|---|---|
| 形态 | Claude Code 插件(skills/hooks/脚本) | 原生 Tauri app + Rust core + MCP server |
| 思想源头 | Karpathy LLM Wiki pattern | 同源(docs/07、docs/14) |
| 结构操作成本 | 全烧 agent tokens(读 index、改页、写 log) | graph/QQL/lint 本地确定性,**零 token** |
| 查询语言 | 无;agent 读 index.md 人肉导航 | QQL 一等公民(Health 十一条 + group_by/histogram) |
| 检索 | v1.7 chunk 级混合(prefix+BM25+rerank,opt-in) | `search_notes` 标题加权全文;语义检索调研中、默认关 |
| 图谱 | Obsidian 内置 graph view(配色/过滤脚本配置) | 原生图谱视图(status/type/文本过滤、pin、框选) |
| 矛盾处理 | `[!contradiction]` callout(自由文本,无校验) | `contradicts:` 边 + `Contested` 状态 + L1-A 一致性校验 |
| lint | 10 类,prompt 判读 + 脚本辅助,报告落 `wiki/meta/` | L1 core 纯函数(`lint_vault` MCP)+ L2 agent 工作流,只产候选 |
| 会话记忆 | **hot.md ≈500 词 + SessionStart/PostCompact 注入**(独有) | 转录永留 SQLite(doc 11),vault 侧无对应物 |
| 信任/溯源 | source `confidence: high/medium/low` | provenance / reviewed / trust 0-3 / evidence_tier + 人审门(quarantine) |
| 多写者 | 按文件 advisory lock + commit 让路 | 单写者 + git quarantine 人采纳 |
| 「下一步研究什么」 | boundary score 确定性打分(诚实标注议程控制) | doc 14 §3.3 prose 指引(Contested 加权 / 深度×拓宽) |
| 起步模板 | 六用例 × 四方法论模式 scaffold | `templates/wiki-starter` 单一形态 |
| 规模上限 | tiling O(N²),>5000 页硬失败;BM25 纯 Python 全量重建 | core Rust,proptest 守护;未做规模基准(空白) |
| 安装门槛 | Claude Code 订阅 + Obsidian;检索栈另需 python3 + ollama | 单 app;MCP/skills 供外部 agent |
| 许可 | MIT | Apache-2.0 |

---

## 5. 对 Open LLM Wiki 的价值(建议借鉴项)

> 全部为**思想/机制/数据点层面**的借鉴;按仓库许可纪律零逐字复制,不引入其代码。

### P1(机制对位、增益明确)

1. **Hot cache 会话恢复闭环**(→ doc 11 应用内 agent / doc 14)
   starter vault 约定一个 `hot.md` 型缓存页(≈500 词、四段式、整体覆写);应用内 ACP agent **会话启动注入 + 上下文压缩后再注入**;会话结束由 agent 蒸馏更新(与 §1.1「转录不进 vault、蒸馏产物才进」不冲突——hot.md 正是显式蒸馏产物)。零代码起步:先作为 starter 约定 + 提示词写进 doc 14;日后 app 原生支持注入点。**PostCompact 再注入是对长会话最便宜的记忆对策,此前 survey 未覆盖此形态。**
2. **Frontier(boundary)打分进 consolidate plan**(→ doc 14 §3.3)
   `(出度−入度)×新近度` 可先以 QQL + `links` 组合近似落地成一条 starter health 查询(入度 `mentioned_in.len()` 已可表达;出度需 core 确认是否暴露 forward 度数,否则以 `mentions.len()` 近似);保留他们「议程控制需显式标注 + 默认不主动推荐」的立场——与我们「lint 只产候选」同一哲学。
3. **语义重复页检测的工程纪律**(→ content-lint §5.2 / semantic-retrieval)
   不是「要不要做嵌入」,而是抄三件套:① **校准流程**(种子带 → 人工标 ≥50 对 → 定带 + calibrated 标记);② **退出码分级降级**(ollama 不可达 = skip,不是 fail);③ **规模上限显式硬失败**。以及一个外部数据点:v1.7 基准(+32pp top-1 / −41% 错误)与 Anthropic 原文(35–49% 失败率下降)可共同作为 semantic-retrieval.md「触发条件量化」的参照系。

### P2(低成本、择机)

4. **检索基准方法论**:给 `search_notes` / `run_qql` 建一个 50-query 回归评测集(他们 benchmark-runner.py 的思路),任何检索改动有数可依——我们目前检索无基准,这是空白。
5. **方法论模式模板变体**:为 `templates/wiki-starter` 提供 LYT/PARA/Zettelkasten 的落位变体(纯内容层,mode.json 型路由约定即可),对齐 v1.8 的真实需求信号。
6. **条件自动 commit**:「写进行中(锁列表非空)则推迟 auto-commit」——若我们日后加 vault 自动快照,这是防半写状态进 git 的现成模式。

### P3(观察/情报)

7. Fold 日志卷积(WORKLOG/vault log 的概览层):价值依赖日志体量,暂缓。
8. 生态情报:其 [ecosystem 对比页](https://github.com/AgriciDaniel/claude-obsidian/blob/master/wiki/comparisons/claude-obsidian-ecosystem.md) 指出两个我们未调研的邻近实现——`llm-wiki`(BM25+向量混合检索,qmd)与 `obsidian-wiki`(delta tracking,增量重摄取);且他们自认 top 缺口 = **无增量摄取**(每次全量重跑)与无视觉输入。**增量摄取恰是我们「Source 不可变 + Superseded + 重新 ingest」模型的强项,值得在定位叙事中显式对照。**
9. 跨项目知识库:他们在别项目 CLAUDE.md 里放「读 hot → index → 页面」的分层读取指令;`mcp/README.md` 可补一段等价 snippet,教外部 agent 分层读我们的 vault(token 经济同构)。

### 不建议借鉴

- 双硬依赖形态(Claude Code + Obsidian)、hooks/插件市场分发——形态不同,无意义。
- prompt 层 lint 判决与自动修复边界之外的一切「系统替人判断」——双方立场一致,本就不做。
- 议程控制默认化:任何「建议下一个研究对象」的机制保持显式、默认被动。

---

## 6. 定位与市场信号

1. **赛道被验证**:4 个月 ★ 10.9k,说明「把 LLM 当知识库维护者而非问答机」的需求真实且在爆发期;我们不需要再论证赛道,需要的是**站到被验证的需求旁边**。README 的「wiki vs RAG」「compounding knowledge」叙事与 docs/07 一致,可直接引用其市场数据作论据。
2. **生态位错位,短期非正面竞争**:他们服务「以 Obsidian 为家、已有 Claude Code 订阅」的用户;我们服务「要原生图谱/QQL、不愿为结构操作付 token 税、要人审门」的子集。他们的存在反而是**渠道验证**:其用户群中想要查询能力与更低 token 成本者,是我们 MCP server + skills 的天然受众。
3. **他们公开承认的天花板**(自家 cherry-picks + 文档):无增量摄取(全量重跑)、检索栈需自装依赖且索引手动刷新、tiling 5000 页硬上限、无多深度查询。**逐条都是我们 core 路线图的对照卖点**(增量 ingest 模型、Rust 本地检索、规模基准、QQL 多粒度)。
4. 分发观察:该作者的 SEO 化 README / FAQ / 双轨社区(公开 MIT + Pro 早访问)是这个赛道的有效增长手段;我们 Apache-2.0 + 技术叙事是不同打法,记录备查。

---

## 7. 许可与合规

- 上游 **MIT**(非 copyleft),法律上允许借鉴乃至引用;但按本仓库纪律执行更严标准:**零逐字复制**(含其 SKILL.md 文案、脚本、CSS),只参考机制、数据流、阈值与流程思想,表达一律自写。
- 不引入其任何代码/依赖 → **无需登记 THIRD_PARTY_NOTICES.md**。
- 其生态对比页引用的 kepano/obsidian-skills 同为 MIT,若日后参考 Obsidian 官方 skills 知识(OFM/Bases/Canvas 规范),同样只作规范性参考。

---

## 8. 结论

claude-obsidian 是 LLM Wiki 模式在「插件形态」下的当前最优解,用 10.9k★ 验证了赛道,并用 v1.7 的检索基准、hot cache、锁、DragonScale 四机制展示了大量**可迁移的工程思想**。对我们:① 抄思想清单见 §5(P1 三项:hot cache 闭环、frontier 打分、语义去重的校准纪律);② 定位上把「增量摄取、本地零 token 结构操作、QQL、人审门」树成对其公开短板的对照;③ 合规上零复制、零依赖,无登记义务。

---

## 9. 证据清单(上游路径 → 断言)

| 上游文件 | 支撑断言 |
|---|---|
| `README.md` | 星标/定位/15 skills/六用例×四模式/v1.7 特性摘要/生态对比表/FAQ(hot vs index、锁 60s 自刈)/MIT |
| `WIKI.md` | vault schema、frontmatter 契约、status 生命周期、ingest/query/lint 操作规程、hot.md 格式与 token 经济、六模式细节 |
| `skills/wiki-retrieve/SKILL.md` | 三层混合检索架构、egress 同意门、特性探测与退出码、成本口径、v1.7.x roadmap |
| `skills/wiki-lint/SKILL.md` | 10 类检查、页址校验规则、tiling 检测/范围/安全/校准/规模、auto-fix 边界 |
| `docs/dragonscale-guide.md` | 四机制全规格、单写者规则、flock 前置、退出码 10/11、禁改计数器文件、议程控制警示 |
| `hooks/hooks.json` | SessionStart/PostCompact/Stop/PostToolUse 四 hook 的确切行为 |
| `wiki/comparisons/claude-obsidian-ecosystem.md` | 16+ 邻近项目矩阵、自认 top-5 缺口、kepano/obsidian-skills 信号 |
| GitHub API(2026-08-17) | ★ 10,944 / fork 1,270 / created 2026-04-07 / pushed 2026-08-01 / MIT |

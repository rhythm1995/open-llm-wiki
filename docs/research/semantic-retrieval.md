# 调研报告:语义检索(向量/embedding)—— 条件触发的远期选项

> **性质**:调研 + 工程方案文档(技术选型预研)。**只陈述、不拍板**——开工与否、怎么选,仍由人在触发条件满足时决策。
> 调研日期:2026-08-06 · 上游:[agent-memory-survey.md](./agent-memory-survey.md) §7.3 检索层 / §7.2 差距 4;对应 [open-questions](../open-questions.md) P6-5、P6-8。
> **本文不主张现在开工**。P6-5 的默认是【关向量主索引】,调研结论(上游 §7.2)支持维持该默认:对 wiki-memory 路线,词法+结构检索够用,检索只是辅助而非记忆本体。本文交付的是「**触发条件 + 届时可执行的方案**」。
> 诚实标注:许可核实到一手来源的条目标 ✅(本次现场核到 LICENSE 文件 / model card license 字段);凭记忆或二手推断的标 ⚠️(开工前需复核)。

---

## 1. TL;DR

1. **维持默认关。触发条件(三选一即重估)**:① vault 笔记数持续 > ~1,000(`vault_info.notes` 可测);② 单次 agent 查询稳定需要载入 > 5–6 篇笔记才能回答;③ 词法检索空结果/低质结果成为可感知的日常摩擦(代理指标见 §3.1)。阈值来自上游调研 §6.4(MindStudio 决策框架 + 成本交叉点:~3K token 的 wiki 比 RAG 便宜,~30K 反超)。
2. **触发后推荐组合(需人拍板)**:`fastembed-rs`(Apache-2.0 ✅,基于 ort/ONNX Runtime)+ `BAAI/bge-small-zh-v1.5`(MIT ✅,512 维,中文主场)作第一刀;双语/跨语言需求上来后再评估 `bge-m3`(MIT ✅,1024 维 ⚠️,体积 ~10 倍)。备选:UI 侧 transformers.js(Apache-2.0 ✅)免 Rust 打包面,代价是 WKWebView 性能与内存。
3. **向量层不进 core**。core 的铁律是纯逻辑 IO-free(`core/src/lib.rs`:不碰文件系统/网络/时间),而向量索引的运行时绑定、模型下载/加载、磁盘持久化全是 IO。论证与落点方案见 §4:独立 crate(`openobs-semantic` 或 app 内模块),与 core 仅通过「`&[Note]` 进、`(path, score)` 出」的窄接口并列,不动 `VaultIndex`/`EdgeKind`/QQL。
4. **P6-8 语义边级联问题的立场**:检索向量与图谱语义边是两件事,可解耦——S1/S2(检索)完全不碰 core;只有 S3(语义边进图谱,可选)才触发 P6-8 评审,届时倾向 doc 12 §4 已记录的两选项之一(进 core EdgeKind 级联 vs 仅前端缓存层),本调研不替它拍板。
5. **中文支持是硬需求,vault 中英混合**。纯英文模型(all-MiniLM-L6-v2)不作候选,只作体积基线;候选表(§3.3)以中文/双语模型为主。许可逐个核到 model card(HF 官方 API,2026-08-06):**jina-embeddings-v3 权重为 CC-BY-NC-4.0(非商用)✅ 已证实——许可红线,明确排除**(jina-v2-base-zh 实为 Apache-2.0,可用但偏旧,见 §3.3)。
6. **模型权重不随包分发**。默认策略是「按需下载 + 本地缓存 + 可用户自备」(fastembed-rs 原生支持缓存目录与 HF 镜像端点),保住「默认纯 MIT 分发、不加重分发体积」的红线;模型文件不进 CI、不进 git。
7. **外部 API(OpenAI/Voyage 等)与「本地优先、无云」产品红线存在张力**,只能作为显式 opt-in 的次级选项,且 Anthropic 无官方 embedding API(核实见 §3.5)。本地路线永远优先。
8. **笔记场景做向量比经典 RAG 便宜得多**:一篇笔记 ≈ 一个 chunk,无切块工程;索引增量就是 LiveVault 已有的路径级 delta;混合排序用 RRF(reciprocal rank fusion)一行公式即可,rerank 可后置。工程量集中在打包与模型分发,不在算法。
9. **优先级定位(2026-08-06 补记,方法论详见 [survey §7.4](./agent-memory-survey.md))**:本方向是四个调研方向中**唯一触发条件完全量化、不依赖品味/纪律**的(§3.1:笔记数 > ~1,000 / 单查询 > 5–6 篇等);正因如此它不需要「探针」,但也因依赖与分发成本较重而维持**「不排期、只看阈值」**。四方向的排序方法论(品味依赖度分级 + 可逆性 × 可观测性)记录于 survey §7.4。

---

## 2. 问题与现状

### 2.1 现有检索能力盘点(对照仓库事实)

- **词法检索**(`core/src/search.rs`):倒排索引(标题/正文两套)+ 标题命中 ×2 加权;多词 **AND** 语义;返回 `Vec<(NodeId, f64)>` 分数降序。纯函数,在 `&[Note]` 上构建,**IO-free**。分词为 unicode 感知的「字母数字+下划线」切分——**无词干化、无中文分词**(中文句子会被切成整段 token,词法检索对中文本就不友好,这是语义检索在中文场景价值更大的原因之一)。
- **结构检索**:wikilink 图谱(backlinks/forward/dead/orphans/hubs/suggest,`core::graph` + MCP `links`)+ QQL 聚合查询(`run_qql`,QQL 定位为 IR)。
- **检索面**:桌面 app 的 `search_notes` Tauri 命令与 MCP `search_notes` 工具共用同一 core 实现(`mcp/src/main.rs`:query 按空白切词 → AND 检索)。agent 侧检索面就是这 7 个 MCP 工具。
- **索引形态**:`VaultIndex::build` 一次性快照;打开 vault 全量 WalkDir 一次,之后写/删/改名/watcher 走 **LiveVault 路径级 delta** + `build_from_map`(`docs/02-architecture.md`)。向量层若要接增量,衔接点就在这里(§4)。

### 2.2 为什么对 wiki-memory 路线够用

上游调研 §7.2 差距 4 的结论:「检索、向量、rerank 只是辅助,不定义记忆系统;记忆是被维护的知识本体」;wiki 的**写入时综合**本就降低了对强检索的依赖——查询读的是成品综合页,不是从原始块里捞。且 LLM-Wiki 在组合性问题上比 Dense RAG 高 15.6 F1(上游 [17]),多跳综合靠结构(wikilink/QQL)而非向量近邻。

### 2.3 P6-5 选项单(原文)

> P6-5 | 语义边 / embedding(6C) | 【待定】未开 | 选项:**不做 / 可选本地模型 / 可选外部 API / 先 mock 向量只做 UI**。**默认关向量主索引**。开 6C 前必须拍板。

本文是对「可选本地模型 / 可选外部 API」两个选项的技术预研;「先 mock 向量只做 UI」对应本文 S0 的一种更轻形态(§5.2)。

---

## 3. 技术调研

### 3.1 触发条件(把上游 §6.4 阈值落成可测判据)

| # | 判据 | 阈值 | 测量方法(均可在现有代码上实现) |
|---|---|---|---|
| T1 | vault 规模 | `vault_info.notes` 持续 > **~1,000** | MCP `vault_info` 已返回 notes 数;加一条 Health QQL/指标即可盯 |
| T2 | 单查询载入量 | agent 单次查询稳定需载入 **> 5–6 篇**笔记 | 代理指标:agent 会话中 `read_note` 调用密度(需转录统计,doc 11 的转录在应用数据,可离线统计);或人工记录 |
| T3 | 词法检索失效频率 | 空结果率高、或「词不命中但人知道有」成为日常摩擦 | 代理指标:`search_notes` 空返回占比(可在 MCP/app 侧加计数,不上传);用户反馈 |
| T4(成本侧) | 综合页膨胀 | 单次查询载入的 wiki 内容 > **~30K token**(上游成本交叉点:此时 wiki 每次查询比 RAG 贵) | 与 T2 同源:载入笔记的 token 合计 |

判据间关系:T1/T4 是规模信号,T2/T3 是体验信号。**任一持续成立即重估**;都不成立则维持默认关。阈值本身来自上游 §6.4 的 MindStudio 框架(⚠️ 厂商博客立场,作方向性参考;量级与上游其它来源一致)。

### 3.2 本地 embedding 运行时选项对照表

> 许可核实:ort / candle / fastembed-rs / transformers.js 的 LICENSE 文件本次均已直取核实(✅);体积/编译时间为记忆推断(⚠️),S0 spike 实测为准。

| 维度 | **ort**(pykeio/ort,Rust ONNX Runtime 绑定) | **fastembed-rs**(Anush008) | **candle**(Hugging Face Rust ML 框架) | **transformers.js**(UI 侧) |
|---|---|---|---|---|
| 许可 | MIT **或** Apache-2.0 双许可 ✅(LICENSE-MIT/LICENSE-APACHE 文件核实) | Apache-2.0 ✅(LICENSE 文件核实) | MIT **或** Apache-2.0 双许可 ✅(LICENSE-MIT 文件核实) | Apache-2.0 ✅(LICENSE 文件核实) |
| 定位 | 底层:ONNX Runtime(本次核到绑定 ORT 1.28)的 Rust 绑定,自己管 tokenizer | 高层:开箱即用的 embedding 库,**内部用 ort 推理 + HF tokenizers**;部分新模型(Qwen3-Embedding 等)走 candle 后端 | 底层:从零编译的推理框架,可跑 safetensors/ONNX;有 Bert/JinaBert 句向量示例 | JS 库,ONNX Runtime Web(WASM 默认、WebGPU 可选),跑在浏览器/webview |
| 模型来源 | 自带模型文件(用户自备) | **首次使用自动下载 + 本地缓存**(`FASTEMBED_CACHE_DIR` 默认 `.fastembed_cache`;`HF_ENDPOINT` 可换镜像)✅ | 用户自备权重文件 | 默认从 HF Hub 下载(可配置为本地文件),浏览器缓存 |
| 中文模型支持 | 取决于自带哪个 ONNX | 内置列表含 **bge-small-zh-v1.5 / bge-large-zh-v1.5 / bge-m3 / multilingual-e5 系列 / paraphrase-multilingual-mpnet-base-v2 / nomic-embed-text / Qwen3-Embedding** ✅ | 需自己写模型代码(bert 示例可改) | 支持 sentence-similarity/feature-extraction,模型面同 ONNX 生态 |
| 二进制/打包影响 | ⚠️ ONNX Runtime 动态库随包(macOS 单架构 dylib 量级数十 MB;universal binary 需 x86_64+aarch64 两份);ort 默认特性会**构建期下载**预编译 ORT | 同 ort(底层就是它);另加首次模型下载 | 静态编译进二进制,无外部 dylib;⚠️ 编译时间显著增加(数分钟量级) | 不进 Rust 打包面;⚠️ ONNX Runtime Web wasm 量级 ~10MB,前端 bundle 增量;WKWebView 内存/性能需实测 |
| macOS/Tauri | Tauri 2 支持 resources/sidecar 携带 dylib;需处理签名与 universal lipo | 同左 | 最干净,无打包附带物 | WKWebView 支持 WASM;WebGPU 在 WKWebView 的可用性需实测 |
| 维护面 | 活跃(2.0.0-rc 迭代中,本次核到) | 活跃,模型列表跟进新模型(Qwen3 等) | HF 官方维护,但 520 个 open issue,句向量路径要自维护 | HF 官方维护,生态最大 |
| 一句话 | 要自己搭管线时的底座 | **最短路径:一行 API + 内置中文模型列表** | 想零 dylib、全静态时的重路径 | 想完全不碰 Rust 打包时的 UI 路径 |

**小结**:四者许可全部干净(MIT/Apache),没有 copyleft 风险。取舍不在许可,在**打包形态**(dylib 随包 vs 静态编译 vs 前端 wasm)与**工程面大小**。

### 3.3 embedding 模型候选对照表(中文双语;许可核到权重级)

> vault 内容中英混合 → **中文支持是硬需求**。模型权重许可与代码许可独立判断:代码 MIT 不代表权重可商用分发。
> 许可核实方式:HF 官方 API(`huggingface.co/api/models/<id>`,镜像 model card frontmatter license 字段),2026-08-06 逐条直取 ✅;参数数取同接口 `safetensors` 字段 ✅。基准数字一律注明厂商自报 vs 第三方。

| 模型 | 权重许可 | 维度 | 参数/体积 | 语言 | 水位(基准) | 备注 |
|---|---|---|---|---|---|---|
| BAAI/bge-small-zh-v1.5 | **MIT** ✅ | 512 ✅ | 24M ✅(ONNX ~90MB ⚠️) | 中文主场 ✅ | C-MTEB 总分 **57.82**、检索 61.77 ✅(model card,**厂商自报**) | 检索查询需前缀「为这个句子生成表示以用于检索相关文章:」✅;小而快,**首推** |
| BAAI/bge-m3 | **MIT** ✅ | 1024 ⚠️ | 568M ⚠️(ONNX ~2.2GB ⚠️);HF 下载 ~3500 万/月 ✅、有官方 ONNX 导出 ✅ | 100+ 语言、中英俱佳 ⚠️ | MIRACL/MKQA 多语言检索强项(**厂商自报** ⚠️ 数字待 S0 复核) | dense+sparse+multi-vector 三模 ✅;体积/延迟是 small 的 ~10 倍,二期选项 |
| intfloat/multilingual-e5-small | **MIT** ✅ | 384 ⚠️ | 117.7M ✅ | 100 语言 ✅ | MTEB 多语言 ~62 ⚠️(记忆推断,待核) | 需 `query:`/`passage:` 指令前缀 ⚠️;中文略弱于 bge-zh(社区共识 ⚠️) |
| sentence-transformers/all-MiniLM-L6-v2 | **Apache-2.0** ✅ | 384 ✅ | 22.7M ✅ | **仅英文** ✅ | model card 仅列单任务(如 ArguAna 50.17)✅ | **不作候选**(中文硬需求),仅作体积/延迟基线 |
| Qwen/Qwen3-Embedding-0.6B | **Apache-2.0** ✅ | 1024 ⚠️ | 595.8M ✅ | 多语言、中文强(**厂商自报** ⚠️) | MTEB 多语言榜首梯队(**厂商自报** ⚠️) | fastembed-rs 经 candle 后端支持 ✅;体积/延迟显著大于 small 系,二期评估 |
| jinaai/jina-embeddings-v2-base-zh | **Apache-2.0** ✅ | 768 ⚠️ | 160.8M ✅ | 中英 ✅ | 发布较早(2023),HF 下载 ~1.3 万/月 ✅——生态已转向新模型 | 可用但**不作首选**:同规模有更活跃选择;带 transformers.js 兼容标签 ✅ |
| jinaai/jina-embeddings-v3 | **CC-BY-NC-4.0** ✅(非商用) | 1024 ⚠️ | 572.3M ✅ | 多语言、中文好 ⚠️ | MTEB 高(**厂商自报** ⚠️) | 🔴 **许可红线:非商用条款与 MIT 产品定位冲突,排除**(能力再强也不可用) |

**小结**:首选 `bge-small-zh-v1.5`(MIT + 小 + 中文主场 + fastembed-rs 内置),双语升级路径 `bge-m3`(MIT),更强但更重的是 `Qwen3-Embedding-0.6B`(Apache-2.0)。jina 对照是许可红线实例:v3 能力在榜首梯队但 CC-BY-NC 一票否决;同厂 v2-base-zh 许可干净却已不活跃——**模型能力强 ≠ 可用,权重许可与活跃度都要逐个核**。

### 3.4 混合检索与笔记场景特性

- **无 chunking 负担**:经典 RAG 的大头工程(长文档切块、重叠窗口、块级元数据)在笔记场景几乎免费——一篇笔记 ≈ 一块(典型笔记远小于 512 token 的模型上限;超长笔记截断或取标题+首段即可,策略简单)。这是「笔记向量层」远比「通用 RAG 引擎」轻的根本原因。
- **融合算法:RRF(reciprocal rank fusion)**:`score(d) = Σ 1/(k + rank_i(d))`,经验取 k=60(Cormack, Clarke & Büttcher, SIGIR 2009,DOI 10.1145/1571941.1572114,本次已核;Elasticsearch/Weaviate 等的默认混合法)。词法榜与向量榜各自取 top-k 后融合,免分数归一化,十行代码。备选:线性加权(需归一化,调参烦)。
- **rerank 可后置**:wiki-memory 场景候选集小(千级笔记)、笔记短、已有 wikilink 结构,RRF 足够;cross-encoder rerank 是二期优化项,不是前置依赖。
- **AND 语义的并存**:现有词法检索是多词 AND(严格收敛);向量检索天然 OR(相似即召回)。混合后建议:默认走向量+RRF 的宽召回,词法 AND 作为精确模式保留(MCP `mode` 参数,§5.3)。

### 3.5 外部 API 与产品红线的张力

- **Anthropic 无官方 embedding API**(✅ 本次核实):官方 cookbook 原文「Anthropic 不提供自家 embedding 模型,与 Voyage AI 合作作为首选文本 embedding 提供方」([anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook/blob/main/third_party/VoyageAI/how_to_create_embeddings.md));Claude Platform 官方文档的 Embeddings 页同样指向 Voyage AI。Voyage AI 已于 2025-02 被 MongoDB 收购(~$220M ⚠️ 金额见官宣);现役模型 voyage-4-large 等,~$0.12/1M token(**厂商定价** ⚠️)。
- **OpenAI**:`text-embedding-3-small` ~$0.02/1M token、`text-embedding-3-large` ~$0.13/1M token(⚠️ 定价为记忆推断,以官网为准)——成本不是问题,**隐私才是**:笔记内容出本地即违反「本地优先、无云」产品红线(doc 07 §0/§6)。
- **本地 Ollama**:用户自装 Ollama + embedding 模型(nomic-embed-text、bge-m3 等,许可各自干净 ⚠️ 开工核)是「外部 API 选项」里唯一不破红线的形态——数据不出机器,且用户自备、我们不打包。可作为 opt-in 第三档。
- **结论**:外部云 API(Voyage/OpenAI)只能作**显式 opt-in 的次级选项**,UI 上必须显式开关 + 数据出境提示;产品默认与文档口径坚持本地。与 P6-5「可选外部 API」选项一致,但优先级排最后。

---

## 4. 与 OpenObsidian 的适配分析

### 4.1 向量进 core 的侵入面 vs 外挂索引层

**core 的铁律**(`core/src/lib.rs` 模块注释):不碰文件系统、不碰网络、不碰时间;穷尽单测 + proptest。向量主链路与之冲突的点:

1. **运行时加载是 IO**:ONNX Runtime 初始化、模型文件读取、(fastembed 的)模型下载——全是副作用。塞进 core 等于破窗。
2. **依赖染色**:ort 拖入 ONNX Runtime 动态库与构建期下载;candle 拖入分钟级编译时间。core 是 MCP/CLI/CI 复用的纯逻辑心脏,给它加重量级可选依赖,三个下游全受影响。
3. **可测性退化**:core 现在的测试全是确定性纯函数;模型推理引入版本相关数值,proptest 守护失效。

**结论:向量层不进 core**。若未来有纯算法部分(如 RRF 融合、余弦相似度)想共享,以纯函数小模块进 core 无 IO 障碍(类比 `search.rs` 的形态),但**运行时与索引持久化不进**。

**落点**(推荐,需人拍板):新 crate `openobs-semantic`(或先作 `app/src-tauri` 内模块 + feature gate),职责:模型加载、embedding 计算、向量索引读写、混合排序。它消费 core 的 `Note`(或由 app 传入 `(path, title, body)`),输出 `Vec<(path, f32 score)>`,与 `SearchIndex` **并列**而非内嵌。

### 4.2 P6-8 语义边级联问题的立场

P6-8 问的是「语义边是否进 core `EdgeKind`」,级联面(doc 12 §4):graph.rs 枚举、IPC 快照序列化契约、graph-filter 按 kind 过滤、渲染虚线、QQL 边 kind 过滤、MCP links/briefing 暴露。

本文立场:**检索 ≠ 语义边,两者解耦**。

- S1/S2(检索面)完全不产生 EdgeKind 变更——向量相似度只用于排序,不进图谱。P6-8 在 S1/S2 阶段**不被触发**。
- S3(语义边喂图谱,可选)才触发 P6-8 评审;两个选项(进 core 级联 vs 仅前端缓存层)维持 doc 12 原文,本文只补一条输入:若向量层在 core 之外,「语义边仅前端/app 缓存层」选项的实现成本显著更低(不需要 core schema 变更),评审时值得加权。

### 4.3 LiveVault 增量衔接

现有增量路径(`docs/02`):写/删/改名 → LiveVault 路径级 delta → `build_from_map`;watcher debounce 350ms emit 相对路径列表。向量层的镜像增量:

- **写**:同一批 delta 路径 → 逐篇重算 embedding(单篇延迟量级:small 系模型 CPU 上 ~10–50ms ⚠️,S0 实测)→ 更新向量索引文件;**与 LiveVault 同节奏、同路径键,永不全量**(除非索引文件缺失/版本不符 → force 重建,对齐 `index_vault(force)` 自愈心智)。
- **删/改名**:向量条目按 path 键删除/改键。
- 笔记短 + 增量粒度细 → 写放大可忽略;批量重建(换模型/首次索引)千篇量级 ~分钟级(§5.4)。

---

## 5. 工程方案(候选,需人拍板;分期 = 「触发后怎么做」)

### 5.0 架构决策点(触发时必须拍的 5 个问题)

| # | 决策点 | 选项 | 本文倾向(不拍板) |
|---|---|---|---|
| D1 | 运行时落点 | fastembed-rs(ort 底座)/ 裸 ort / candle / transformers.js(UI 侧)/ Ollama 外挂 | fastembed-rs:最短路径、内置中文模型、缓存/镜像现成 |
| D2 | 模型 | bge-small-zh-v1.5 / bge-m3 / multilingual-e5-small / Qwen3-Embedding-0.6B | bge-small-zh-v1.5 首刀;bge-m3 二期 |
| D3 | 索引位置 | vault 内 `.openobsidian/`(P6-4 已建约定)/ app data | `.openobsidian/`:跟 vault 走、gitignore 默认(对齐 P6-7 布局文件先例)、换机即带 |
| D4 | 是否进 core | 进 VaultIndex/EdgeKind / 外挂并列层 | 外挂(§4.1 论证);QQL 不碰 |
| D5 | 混合策略 | 纯向量 / RRF 混合 / 词法优先向量可选 | RRF 混合(MCP/UI 可 mode 切回纯词法) |

### 5.1 推荐路径(组合 + 备选 + 理由)

**推荐**:fastembed-rs + bge-small-zh-v1.5 + 独立 crate(`openobs-semantic`,feature gate)+ 向量索引存 `.openobsidian/embeddings.bin`(示意)+ MCP `search_notes` 加 `mode` 参数(`lexical` | `semantic` | `hybrid`,默认 **lexical 直到用户显式开启**)+ RRF 混合 + 模型按需下载(用户首次开启语义检索时触发,带大小/许可提示)。

理由:许可全绿(Apache-2.0 + MIT 权重)、中文硬需求满足、工程量集中在打包而非算法、与 core/MCP/QQL 现有面正交、默认分发体积不变(模型不进包)。

**备选 A**(打包阻力大时):transformers.js 走 UI 侧(WKWebView WASM),Rust 零打包面;代价是 WKWebView 内存/性能与索引持久化要经 IPC 落盘,链路更长。
**备选 B**(用户已有 Ollama):app 探测本地 Ollama embedding 模型,零分发、零打包;代价是多一个外部依赖进程、延迟不可控。
**回退**:中文质量不达预期 → 回 bge-m3 / Qwen3-Embedding-0.6B;仍不达预期 → 该方向判负,回词法+结构(§6 R1)。

### 5.2 分期(S0 spike 是关键闸口)

- **S0 · spike(1–2 天,验证三件事)**:① fastembed-rs 在 Tauri 构建里跑通单篇 embedding,实测 dylib 体积、构建期行为、macOS 签名/universal 影响;② bge-small-zh-v1.5 对 2–3 篇真实 vault 笔记算相似度,人工看中文质量;③ 实测单篇延迟。**任一不过即止,成本封顶**。附带产出:P6-5 的「先 mock 向量只做 UI」若单独成立,可用随机/哈希假向量验 UI,与 S0 正交。
- **S1 · 离线索引 + MCP 检索面**:独立 crate + `.openobsidian/` 索引文件 + 全量/增量索引命令 + `search_notes` mode 参数(默认 lexical)。agent 先用上,UI 不动。
- **S2 · UI 面 + 混合排序**:全库搜索接入 hybrid(RRF)+ 设置面板开关(含模型下载提示、许可说明)+ 索引状态可视化(条数/陈旧度)。
- **S3 ·(可选)语义边喂图谱**:接 P6-8 评审;相似度 top-k 边 → 建议链接 UX(doc 12 §6C2 已设计 Accept/Dismiss)或前端缓存层。**不进 core 默认**。

### 5.3 数据与接口示意(非承诺)

```
.openobsidian/
  graph-layout.json      # 已有(P6-4)
  semantic-index.bin     # 新增示意:magic + model_id + dim + {path, mtime, f32[dim]}*
                         # gitignore 默认(对齐 P6-7 先例);模型 id 不符即重建
```

```rust
// app/src-tauri 新增命令(示意;须注册进 generate_handler!)
index_semantic(root, force?) -> {indexed, skipped, ms}
// openobs-semantic(示意)
fn embed_batch(runtime, model, &[Note]) -> Vec<(String /*path*/, Vec<f32>)>;
fn hybrid(lexical: &[(NodeId, f64)], vector: &[(String, f32)], k: usize) -> Vec<(String, f64)>; // RRF
```

```jsonc
// MCP search_notes 扩展(示意;默认行为不变)
{ "query": "...", "mode": "lexical|semantic|hybrid", "limit": 20 }
// semantic/hybrid 在索引缺失时:返回 lexical 结果 + "semantic": "unavailable" 字段,不报错
```

**QQL 不碰**:不新增边 kind、不加排序算子;QQL 继续只做结构 IR(doc 12 §0「不把向量当主索引」)。

### 5.4 成本与性能预算(量级预期,⚠️ 均待 S0 实测校准)

| 项 | 量级预期 | 依据 |
|---|---|---|
| 单篇 embedding(small 系,CPU) | ~10–50ms | 24M 参数模型单序列推理常识量级 ⚠️ |
| 千篇全量索引 | ~30s–2min | 上式 ×1000,单线程 ⚠️ |
| 向量索引体积(1000 篇 × 512 维 f32) | ~2MB | 1000×512×4B;加元数据 <5MB |
| 查询延迟 | embed(query) ~10–50ms + 千级暴力点积 <1ms | 千级规模无需 ANN(HNSW 等 10 万级再谈) |
| 分发体积增量 | ORT dylib 数十 MB/架构 ⚠️;模型 0(按需下载) | S0 的打包闸口就是它 |
| 成本交叉点对照 | 若 T4 触发(单查询载入 ~30K token,上游 §6.4 的成本反超点),查询侧的 RAG 收益远大于本表的一次性索引成本 | 即:真触发时,向量检索的成本收益成立;未触发时这些成本一分也不该花 |

### 5.5 测试与 CI

- **core 保持 IO-free**:不新增 core 测试面;若 RRF/余弦进 core,照 `search.rs` 形态补单测 + proptest(融合结果集性质:去重、k 截断、分数单调)。
- **openobs-semantic / app 层**:模型不进 CI(体积 + 下载不稳)。测法:① 纯逻辑部分(索引序列化/增量 merge/RRF)用**固定假向量**单测——与模型无关,CI 常绿;② 真模型冒烟测试 feature-gated,本地/S0 手动跑;③ MCP 集成测延续 `mcp/src/main.rs` 现有 fixture 风格(mode=lexical 路径常绿,semantic 路径在 CI 断言 graceful 降级)。
- **CI 三 job 零变更**:core-and-ui / app / e2e 均不引入模型文件与 ORT 依赖(feature 默认 off)。

### 5.6 新增依赖与许可登记(触发时)

| 依赖 | 许可 | THIRD_PARTY_NOTICES 义务 |
|---|---|---|
| fastembed-rs | Apache-2.0 ✅ | 登记;NOTICE 归属 |
| ort(fastembed 传递依赖) | MIT / Apache-2.0 ✅ | 登记;**ONNX Runtime 二进制为 MIT**(微软,⚠️ 随 dylib 的许可声明随包) |
| tokenizers(HF) | MIT / Apache-2.0 ⚠️ | 登记 |
| bge-small-zh-v1.5 权重 | MIT ✅ | **权重不随包 → 不进分发声明**,但下载提示里展示许可;若未来改随包,须登记 |
| (备选)candle | MIT / Apache-2.0 ✅ | 登记 |
| (备选)transformers.js + onnxruntime-web | Apache-2.0 ✅ | 登记 |

**对「默认纯 MIT 分发」的影响**:只要坚持「模型按需下载 / 用户自备」,默认分发物不新增任何权重,红线不破。若某天决定随包模型(换开箱体验),bge-small-zh-v1.5 的 MIT 权重允许,但需在 THIRD_PARTY_NOTICES 单列「模型权重」节——这是产品决策,不是许可障碍。

---

## 6. 风险与开放问题

| # | 风险 / 问题 | 状态 |
|---|---|---|
| R1 | **中文质量不达预期**:bge-small-zh-v1.5 在中英混合、术语密集的笔记上检索质量未知 | 需 S0 人工评测;回退链见 §5.1(需人拍板回退与否) |
| R2 | **jina 系权重许可**:v3 为 CC-BY-NC-4.0(非商用)✅ 已证实(HF API 2026-08-06)→ **排除**;v2-base-zh 实为 Apache-2.0 ✅(本次纠正了「v2 也是 NC」的记忆误判,模型可用但生态已不活跃,不作首选)。若未来 v3 许可放宽需重核 | 🔴 许可红线实例;排除已明确,不需拍板 |
| R3 | **ORT dylib 打包/签名/universal**:macOS 公证、universal binary 两份 dylib、构建期下载的二进制供应链信任 | 需 S0 实测;失败转备选 A/B(需人拍板备选) |
| R4 | **模型下载体验与可达性**:HF Hub 在部分网络环境不可达(fastembed 支持 `HF_ENDPOINT` 镜像可缓解);下载失败需 graceful 降级到词法 | 设计已含;不需拍板 |
| R5 | **索引与 vault 不同步**:外部编辑/git checkout 大批改文件后向量索引陈旧 → 依赖 watcher delta + force 重建自愈(对齐 LiveVault 心智) | 设计已含;不需拍板 |
| R6 | **触发判据的测量成本**:T2/T3 需要埋点或转录统计,涉及隐私口径(统计只留本地) | 若决定埋点需人拍板口径 |
| R7 | **P6-8 悬而未决**:S3 前 core EdgeKind 级联问题必须书面选一种(doc 12 §4 默认倾向进 core,本文补充了「外挂层成本更低」的输入) | 需人拍板(S3 阶段) |
| R8 | ⚠️ 本文所有标 ⚠️ 的数字与推断(模型 ONNX 体积、单篇延迟、bge-m3 维度/参数量、e5 前缀约定、Ollama 模型许可、OpenAI/Voyage 定价、Qwen3 中文水位) | 开工前逐项复核;S0 spike 是体积/延迟类数字的唯一事实闸口 |

---

## 7. 引用来源

> 一手来源优先;许可条目注明核实方式。调研工具:WebSearch/WebFetch,配额受限期间部分条目以 HF/GitHub 官方页面直取。

**仓库事实(断言对照)**
- `core/src/search.rs`(词法检索接口)、`core/src/lib.rs`(IO-free 铁律)、`core/src/index.rs`(`Note` 结构)
- `mcp/src/main.rs`(7 工具;`search_notes` 实现;`list_md` 跳过 `.` 前缀目录)
- `docs/open-questions.md` P6-5/P6-8 · `docs/12-graph-and-agent-roadmap.md` §4(6C 级联)/ §0 · `docs/02-architecture.md`(LiveVault 增量、依赖原则)· `docs/07-llm-wiki-architecture.md` · `docs/11-in-app-agent-roadmap.md`(红线表写法)· `THIRD_PARTY_NOTICES.md`
- [agent-memory-survey.md](./agent-memory-survey.md) §4.2 路线二 / §6.4 规模阈值 / §7.2 差距 4 / §7.3 检索层

**运行时(许可均核到 LICENSE 文件,2026-08-06)**
- ort(pykeio/ort,MIT/Apache-2.0 双许可;绑定 ONNX Runtime 1.28)— https://github.com/pykeio/ort
- fastembed-rs(Apache-2.0;ort + tokenizers 底座;模型首用下载 + 缓存/镜像;内置 bge-zh/bge-m3/e5/Qwen3 等)— https://github.com/Anush008/fastembed-rs
- candle(MIT/Apache-2.0 双许可;CPU/CUDA/WASM;Bert 句向量示例)— https://github.com/huggingface/candle
- Transformers.js(Apache-2.0;ONNX Runtime Web WASM/WebGPU;HF Hub 模型)— https://github.com/huggingface/transformers.js

**模型(许可/参数经 HF 官方 API `huggingface.co/api/models/<id>` 直取核实,2026-08-06;基准数字标注于正文)**
- BAAI/bge-small-zh-v1.5(MIT;512 维;24M 参数;C-MTEB 57.82)— https://huggingface.co/BAAI/bge-small-zh-v1.5
- BAAI/bge-m3(MIT;有官方 ONNX 导出;下载 ~3500 万/月)— https://huggingface.co/BAAI/bge-m3
- intfloat/multilingual-e5-small(MIT;117.7M 参数)— https://huggingface.co/intfloat/multilingual-e5-small
- sentence-transformers/all-MiniLM-L6-v2(Apache-2.0;384 维;22.7M 参数;仅英文)— https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Qwen/Qwen3-Embedding-0.6B(Apache-2.0;595.8M 参数)— https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
- jinaai/jina-embeddings-v2-base-zh(Apache-2.0;160.8M 参数)— https://huggingface.co/jinaai/jina-embeddings-v2-base-zh
- jinaai/jina-embeddings-v3(**CC-BY-NC-4.0**;572.3M 参数)— https://huggingface.co/jinaai/jina-embeddings-v3

**外部 API 事实**
- Anthropic cookbook(Voyage AI 合作原文)— https://github.com/anthropics/anthropic-cookbook/blob/main/third_party/VoyageAI/how_to_create_embeddings.md
- Claude Platform Docs · Embeddings(指向 Voyage AI)— https://platform.claude.com/docs/en/build-with-claude/embeddings
- MongoDB 收购 Voyage AI 官宣(2025-02)— https://investors.mongodb.com/news-releases/news-release-details/mongodb-announces-acquisition-voyage-ai-enable-organizations

**方法**
- RRF:Gordon V. Cormack, Charles L. A. Clarke, Stefan Büttcher. *Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods*. SIGIR 2009, pp. 758–759. DOI: [10.1145/1571941.1572114](https://dl.acm.org/doi/10.1145/1571941.1572114)(公式 `1/(k+rank)`,经验取 k=60;本次经检索核实)

**调研局限**:许可类结论全部有一手出处(LICENSE 文件 / HF 官方 API);但 bge-m3 等个别 model card 正文未能整页直取,其维度/参数/基准细节按保守口径标 ⚠️,开工前用同一 HF API 一次性复核即可。体积/延迟/打包影响类数字一律为量级推断,**S0 spike 是唯一事实闸口**。OpenAI/Voyage 定价为撰写时口径,触发重估时以官网为准。

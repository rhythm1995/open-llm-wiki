# 待你拍板的事(Open Questions)

> 实现过程中我**拿不准 / 需要你定**的决策,记在这里。其余我用合理默认值推进,你验收时校准。
> 每条标【默认】= 我已先按此实现;【待定】= 我跳过了,等你。

## 工程

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| Q1 | 项目正式名 | ✅【已定】Open LLM Wiki | 正式名定为 Open LLM Wiki。 |
| Q2 | YAML 解析库 | ✅【默认已落地】`serde_yaml 0.9.34` | 已确认编译/运行通过。维护模式但稳定;想换活跃分支 `serde_yml` 可一行替换(仅 `parse_frontmatter` 一处)。 |
| Q3 | 编辑器 | ✅【已升级】CodeMirror + BlockNote 双模 | 源码 + WYSIWYG 读写同一 `.md`;保真见 FEATURE-INDEX / plan §Editor。 |
| Q4 | UI 组件库 | ✅【MVP 默认】Tailwind 4 + Radix + Phosphor + shadcn(cva/clsx/tw-merge) | MVP 不引入 Mantine(避免与 Tailwind 的 reset/provider 冲突);Mantine 的 Combobox 等可在 v2 按需引入。 |
| Q5 | Tauri 版本 | 【默认】Tauri 2.x | 最新稳定。 |
| Q6 | 包管理器 | 【默认】pnpm | 前端标准选择。 |

## 产品

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| P1 | 图谱默认布局 | ✅【已定】力导向(**d3-force-3d**,force-graph)为默认 | type 分层 + 时间轴可切换(B-GRAPH-LAYER/TIME)。 |
| P2 | QQL 语法 | ✅【已定】DQL 风格基线 | 基线已落地;继续扩展常用子集(B-QQL-EXPAND),不追求 Dataview 逐字全兼容。 |
| P3 | 是否支持 cairn 协议原生 | 【默认】是 | 识别 Source/Summary/Entity/Concept + 关系键。 |
| P4 | 类型文档 | ✅【已定要做】仅 UI 提示 | **做**(B-TYPE-DOC):关联说明笔记/字段提示;**永不** schema 校验或阻止保存(防止类型绑人)。原「v1 不做」作废。 |

## 暂时跳过(待你验收后继续)

- ~~QQL 文本解析器~~ ✅ **已落地**(P2 选定 DQL 风格,`qql::parse` 实现 + 测试 + demo 接通)。当前 QQL 全链路:text → AST → 结果,皆在纯内核。

> "index 切片的 Graph 结构"原为待定项,已按 Q7 默认落地,不再跳过。

## 新增待定(实现中产生)

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| Q7 | 关系边如何进图 | ✅【默认已落地】enriched `Note`(含 frontmatter→map + relation_links),`Graph::build` 消费 `Note`,Wiki + Relation 统一为同一套边结构 | 已实现,反向链接、悬空检测对两类边一视同仁。验收时若你想要 Graph 仍吃 `ParsedNote`,可再议。 |

## Phase 6 已拍板 / 仍待定

> 主规划:[12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md)。

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| P6-1 | 下一阶段顺序 | ✅【已定】先图 polish(6A)→ agent 图面(6B)→ wiki(6D)→ 可选语义(6C) | 2026-08-01 产品确认。文档阶段名统一 **6A–6D**(非裸 A/B/C/D)。 |
| P6-2 | 图谱引擎 | ✅【已定 · 2026-08-09 再换】**force-graph Canvas + d3-force-3d** 主路径 + preset | 历史:sigma → Cytoscape + cose(2026-08-02 翻案)→ force-graph(2026-08-09,`ForceGraphLayer`,视觉/交互重做)。 |
| P6-3 | 参考项目代码 | ✅【已定】仅概念;GPL(inkeep)零拷贝;MIT(varshithm7x)亦不整文件移植 | 原创实现 + MIT 红线(零逐字复制)。 |
| P6-4 | 布局坐标落盘**位置** | ✅【默认已落地】vault 内 **`.open-llm-wiki/graph-layout.json`**(B-GRAPH-POS-PERSIST) | **新约定**:本库此前无统一 per-vault 配置目录;6A1 建立之。localStorage 仅无 vault/mock 回退。内存跨帧暖启动**已有**,本项仅加磁盘层。 |
| P6-7 | 布局文件是否进 git / 自动提交 | ✅【默认已落地】**gitignore 布局文件**;写盘**不**走结构自动 commit | 与「结构自动 + 正文手动」策略对齐:频繁拖拽/reheat 若 auto-commit 会污染 log。用户可手动 un-ignore 以共享布局。若要「团队共享默认布局」可再改为 tracked + 仅 pin/导出时提交。 |
| P6-5 | 语义边 / embedding(6C) | 【待定】未开 | 选项:不做 / 可选本地模型 / 可选外部 API / 先 mock 向量只做 UI。**默认关向量主索引**。开 6C 前必须拍板。 |
| P6-6 | MCP `suggest`(未链提及) | ✅【已落地】随 B-MCP-LINKS 交付(`links` 的 `suggest` kind) | 完整 mention 扫描可二期;不阻塞 dead/orphans/hubs。 |
| P6-8 | 6C 语义边是否进 core `EdgeKind` | 【待定】开 6C 前评审 | 进 core → 序列化/filter/QQL/MCP 级联;或仅前端缓存层。见 [12 §4](./12-graph-and-agent-roadmap.md)。 |

## iCloud 存储(17 号方案产生,待拍板)

> 主文档:[17-icloud-storage-plan.md](./17-icloud-storage-plan.md);依据:[research/icloud-vault-storage.md](./research/icloud-vault-storage.md)。

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| IC-1 | `icloud-managed`(Desktop & Documents 同步)下 git 自动化是否一刀切 off | ✅【已拍板 2026-08-21】**宽松**:managed 不关,只提示 | 严格 `icloud` 才默认关(可显式开启)。已落地:`core/src/storage.rs` `git_auto_allowed`。 |
| IC-2 | 欢迎屏"存储三选一"与 16 号首屏哲学(MG 叙事)如何嵌合 | ✅【已拍板 2026-08-21】不重构,加一枚 iCloud 按钮 | MG 叙事不动;`WelcomeEmpty` 增"在 iCloud 中创建"入口。 |
| IC-3 | eviction 采样时机 | ✅【已拍板 2026-08-21】打开 vault 时一次(默认) | 有界 200 样本;已落地 `detect_storage`。 |



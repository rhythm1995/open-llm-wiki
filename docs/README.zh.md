# Open LLM Wiki — 设计文档

<!-- README-I18N:START -->

[English](./README.md) | **简体中文**

<!-- README-I18N:END -->

想**使用**这款应用（安装、写笔记、看图谱、库健康、接 Agent）请先读 **[用户文档](./user/README.zh.md)**（[English](./user/README.md)）。[`site/`](../site/) 会把同一批 Markdown 渲成 `/docs`。下面是给贡献者和编码 agent 的设计 / 实现文档。

## AI / 施工快速入口

| 你想… | 打开 |
|---|---|
| **我是用户，想学会用** | [**user/README.zh.md**](./user/README.zh.md) |
| **已实现功能 → 代码** | [**FEATURE-INDEX.md**](./FEATURE-INDEX.md) |
| **还没做 / 切片顺序** | [**plan.md**](./plan.md) + [backlog.md](./backlog.md) |
| **待拍板** | [open-questions.md](./open-questions.md) |
| **架构分层** | [02-architecture.md](./02-architecture.md) · [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) |

## 文档地图

编号规格与调研正文目前是中文（实现真相）。用户文档默认英文，可在页顶切到中文。

| 文档 | 回答什么 | 状态 |
|---|---|---|
| [user/README.zh.md](./user/README.zh.md) | **用户文档**(教程 / 操作指南 / 参考 / 概念；双语) | 维护中 |
| [FEATURE-INDEX.md](./FEATURE-INDEX.md) | **已落地功能索引**(功能名 → 代码) | 维护中 |
| [plan.md](./plan.md) | **未完成实施计划** | 维护中 |
| [backlog.md](./backlog.md) | ID 状态总表 | 维护中 |
| [01-vision.md](./01-vision.md) | 定位、原则、与 O/T 差异 | 稳定 |
| [02-architecture.md](./02-architecture.md) | 栈、分层、IPC | 随实现更新 |
| [03-data-model.md](./03-data-model.md) | vault/note/关系形式定义 | 稳定 |
| [04-features.md](./04-features.md) | 功能目录规格 | 以 backlog 为准校状态 |
| [05-tdd-strategy.md](./05-tdd-strategy.md) | 测试策略 | 稳定 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事 | 历史+前瞻 |
| [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) | 实现真相 + mermaid | 随实现更新 |
| [08-media-and-split-preview.md](./08-media-and-split-preview.md) | 附件/媒体规格 | 随媒体迭代更新 |
| [09-big-features-v1.md](./09-big-features-v1.md) | SHEET/PLUGIN/MCP 切片 | 已落地参考 |
| [10-menus-and-search.md](./10-menus-and-search.md) | 菜单/命令/搜索 | 已落地参考 |
| [11-in-app-agent-roadmap.md](./11-in-app-agent-roadmap.md) | 应用内 Agent(ACP 托管) | ✅ 已落地(Phase 7 完工,真机验收 2026-08-19 完成) |
| [12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md) | 图 polish → 外部 Agent(MCP) | 6A 推迟;6B MCP + **库健康/Agent 查库** ✅;6D ✅;勿重建 QueryPanel |
| [13-client-logging.md](./13-client-logging.md) | 客户端日志 | 已落地参考 |
| [14-llm-wiki-workflow.md](./14-llm-wiki-workflow.md) | LLM Wiki 工作流(ingest/research/consolidate)+ 蒸馏 L2a + lint L1/L2 | 已落地参考(持续增补) |
| [15-owf-format.md](./15-owf-format.md) | **OWF-1 格式规范**(档 1:装订现状 + 钉版本;`format: owf/1` 声明 + 宽容规则测试锁;档 2 候选项存档 §9) | ✅ 已生效 |
| [16-first-run-mg-philosophy.md](./16-first-run-mg-philosophy.md) | 首次启动理念 MG：叙事 + 品牌硬约束 + **可复制生成/优化 prompt** | 审阅满意 v4；已嵌 WelcomeEmpty |
| [17-icloud-storage-plan.md](./17-icloud-storage-plan.md) | **iCloud 存储支持**产品方案（入口 / G1–G6 防护 / 文案 / 分期，含 3 张示意图） | ✅ 已落地 2026-08-21（M1+M2+M3；§13 落地记录） |
| [research/icloud-vault-storage.md](./research/icloud-vault-storage.md) | iCloud vault 存储可行性调研（15 来源：dataless 文件 / LWW 冲突 / git-in-iCloud churn） | 参考；17 号方案依据 |
| [research/agent-memory-survey.md](./research/agent-memory-survey.md) | agent 长期记忆调研(40 来源 / 54 证据);**§7.4 = 四专项的优先级与排序依据** | 参考 |
| [research/conversation-to-vault-distillation.md](./research/conversation-to-vault-distillation.md) | 对话→vault 蒸馏管道:调研+方案(survey §7.3③) | L2a 已写进 doc 14 §1.1;L1/L2b UI 等信号 |
| [research/trust-provenance-frontmatter.md](./research/trust-provenance-frontmatter.md) | 信任分级/provenance frontmatter:调研+方案(survey §7.3⑥) | **P0 L1 已落地**(模板+Health);L2 写入路径等探针 |
| [research/content-lint-contradiction.md](./research/content-lint-contradiction.md) | 内容级 lint/矛盾检测:调研+方案 | **L1 core ✅**;L2 工作流 ✅(doc 14 §3.2.3);MCP/UI 暂不做 |
| [research/semantic-retrieval.md](./research/semantic-retrieval.md) | 语义检索:调研+方案(维持默认关,触发条件量化) | 候选方案,默认关 |
| [research/openkb-survey.md](./research/openkb-survey.md) | OpenKB 调研:编译式 Wiki + PageIndex + Skill/Deck Factory(与 OWF/语义检索互证) | 参考 |
| [research/canvas-isolation.md](./research/canvas-isolation.md) | 画布与图谱/QQL/wikilink/搜索的隔离事实(刻意设计);入口隐藏决策 | 已落地参考 |
| [open-questions.md](./open-questions.md) | 待拍板 | 维护中 |

## 一句话定位

**本地优先、文件即真相、Apache 2.0 的知识管理 app**;原创实现;图谱可视化与实时聚合查询做成原生一等公民;类型为可选约定。

## 法律摘要

Apache-2.0;原创独立实现,只参考公开思想与功能对照;**零逐字复制**第三方源码(绝不引入 GPL/AGPL 等 copyleft 源码)。见根 [README](../README.md)。

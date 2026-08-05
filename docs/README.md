# OpenObsidian — 设计文档

## AI / 施工快速入口

| 你想… | 打开 |
|---|---|
| **已实现功能 → 代码** | [**FEATURE-INDEX.md**](./FEATURE-INDEX.md) |
| **还没做 / 切片顺序** | [**plan.md**](./plan.md) + [backlog.md](./backlog.md) |
| **待拍板** | [open-questions.md](./open-questions.md) |
| **架构分层** | [02-architecture.md](./02-architecture.md) · [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) |

## 文档地图

| 文档 | 回答什么 | 状态 |
|---|---|---|
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
| [11-in-app-agent-roadmap.md](./11-in-app-agent-roadmap.md) | 应用内 Agent(ACP 托管)· 规划 | 📋 规划(高优) |
| [12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md) | 图 polish → 外部 Agent(MCP) | 主规划(图推迟) |
| [13-client-logging.md](./13-client-logging.md) | 客户端日志 | 已落地参考 |
| [14-llm-wiki-workflow.md](./14-llm-wiki-workflow.md) | LLM Wiki 工作流(ingest/research/consolidate) | 已落地参考 |
| [open-questions.md](./open-questions.md) | 待拍板 | 维护中 |

## 一句话定位

**本地优先、文件即真相、MIT 的知识管理 app**;原创实现;图谱可视化与实时聚合查询做成原生一等公民;类型为可选约定。

## 法律摘要

MIT;原创独立实现,只参考公开思想与功能对照;**零逐字复制**第三方源码(绝不引入 GPL/AGPL 等 copyleft 源码)。见根 [README](../README.md)。

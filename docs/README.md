# OpenObsidian — 设计文档

本目录是 OpenObsidian 的**完整设计**,先于代码存在(01–06)。读完这六份,任何人应当能独立按图施工。[07](./07-llm-wiki-architecture.md) 是**实现后的架构总览**,反映代码落地真相(含 mermaid 图),与前瞻设计互补。

| 文档 | 回答什么 |
|---|---|
| [01-vision.md](./01-vision.md) | 它是什么、为什么、跟 Obsidian/Tolaria 的差异、设计原则 |
| [02-architecture.md](./02-architecture.md) | 技术栈、分层、IPC、数据流 |
| [03-data-model.md](./03-data-model.md) | vault / note / frontmatter / wikilink / 类型 / 关系 的形式定义 |
| [04-features.md](./04-features.md) | 全功能目录与逐项规格(图谱、实时聚合、软类型、编辑器…) |
| [05-tdd-strategy.md](./05-tdd-strategy.md) | 测试金字塔、红绿循环、覆盖率门槛 |
| [06-roadmap.md](./06-roadmap.md) | 分阶段交付;"全部功能"如何被切成可完成的里程碑 |
| [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) | LLM Wiki 五层 × 软件架构双视角总览(实现真相 + mermaid 图;**反映落地,非前瞻设计**) |
| [**backlog.md**](./backlog.md) | **未完成清单总表**(还没做的有哪些;含原 v1 边界改待办) |
| [deferred.md](./deferred.md) | 未做项的难点 / 前置 / 为什么难 |
| [open-questions.md](./open-questions.md) | 待拍板决策 |

## 一句话定位

**一个本地优先、文件即真相、MIT 许可的知识管理 app**——以 Tolaria 的公开设计思想为蓝本(clean-room 重写,零代码复制),补齐 Obsidian 最被需要的两件事:**图谱可视化** 与 **实时聚合查询**,同时把"类型"从牢笼降级为可选的约定。

## 如何阅读

- 想了解**为什么造**:从 [01-vision](./01-vision.md) 开始。
- 想动手**写代码**:先 [02-architecture](./02-architecture.md) + [05-tdd-strategy](./05-tdd-strategy.md),再看 [06-roadmap](./06-roadmap.md) 当前阶段。
- 想知道**功能规格**:[04-features](./04-features.md)。
- 想知道**还没做完什么**:直接看 [backlog](./backlog.md)。

## 法律状态(摘要)

MIT 许可;设计**参考 Tolaria 的代码/UI 实现 + 公开文档**,与 Obsidian 公开功能对照,重写为自己的表达;**未逐字复制任何第三方源码**。详见仓库根 [README](../README.md) 的「许可与溯源」。

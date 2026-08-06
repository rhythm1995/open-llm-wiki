---
type: Type
status: Active
---

# Query

**Health 层 · 存成笔记的查询。** 一条 QQL 本身就是一篇 `type: Query` 的笔记——
这就是 OpenObsidian 的核心洞察:**不存 Health 快照,存「能算出 Health 的查询」**。
查询是笔记,所以能被 `[[link]]`、被别的查询再聚合,自举进图谱。

## 字段

| 字段 | 含义 |
|---|---|
| `type` | `Query`(固定) |
| `status` | `Active` |
| `metric` | 短 slug,标它量的是哪个健康指标(如 `contested`、`orphans`、`hunger`、`evidence`、`synthesis`、`provenance`、`drift`、`duplicates`) |

## 正文约定

QQL 本身放在一个 ```qql ``` 围栏代码块里(单一事实源:人能读、agent 能抄、零漂移):

````markdown
---
type: Query
status: Active
metric: contested
---

# Contested concepts

一句话说它量什么。

```qql
WHERE type = "Concept" AND status = "Contested" SHOW title
```
````

## 怎么跑

复制 ```qql ``` 块里的文本,通过:

- **MCP** `run_qql`:把 QQL 字符串当参数传入(Claude Code / Cursor 等)。
- **core** 直接求值:见 [docs/14-llm-wiki-workflow.md](../../../docs/14-llm-wiki-workflow.md)。

## 语法要点(避免写出跑不通的查询)

- 子句只有 `WHERE` / `SORT` / `LIMIT` / `SHOW` / `RENDER`,顺序不限,可跨行。
- **没有** `GROUP BY` 子句:分组是 `RENDER group_by(<字段>)`。
- **没有** `IS EMPTY`:「空」用反链入度 `mentioned_in.len() = 0`。
- **没有** `IS MISSING`:「缺字段」用 `NOT has <字段>`(如 `NOT has reviewed` 挑出从未复审的页);缺字段的页在 `group_by` 里落 `(none)` 桶。
- 长度统一写 `<字段>.len()`,如 `mentioned_in.len()`(不是 `len(mentioned_in)`)。
- 完整语法见 [`core/src/qql.rs`](../../../core/src/qql.rs) 文件头注释。

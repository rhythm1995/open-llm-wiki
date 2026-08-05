---
type: Type
status: Active
---

# Summary

**Wiki 层 · LLM 生成的派生知识。** 把一篇 [[source|Source]] 提炼成结构化的 TL;DR + 要点 + 原文引用。
Summary 是「用你自己的话重述」,不是复制粘贴;引用原文必须带出处。

## 字段

| 字段 | 含义 |
|---|---|
| `type` | `Summary`(固定) |
| `status` | `Active` → `Superseded`(Source 被重新摄取后,旧的标这个) |
| `source` | 关系 → 它提炼自的 [[Source]] |
| `mentions` | 关系列表 → 它触及的 [[entity|Entity]] / [[concept|Concept]] |
| `generated` | 生成日期 `YYYY-MM-DD` |

## 关系方向(重要)

- **正向**:`source` 指向它来自的 Source;`mentions` 列出它谈到的 Entity/Concept。
- **反向**:`mentioned_in` 不用手填——图谱从所有 Summary 的 `[[wikilink]]` 自动算出反链,喂给 Entity/Concept 的入度。
- 所以:在 Summary 正文 / `mentions:` 里 `[[链接]]` 到某个 Entity,那个 Entity 的 `mentioned_in.len()` 就 +1。

## 正文结构(建议)

```markdown
## TL;DR
一句话。

## Key points
- …

## Quotes
> 原文逐字引用 —— [[source]]
```

## 规则

- 一个 Source 不算「摄取完」,直到它的 `status: Digested` 且 `derived_into` 指向至少一篇 Summary。
- 改写过的 Summary 留 `status: Active`;Source 重新摄取产的新 Summary 才把旧的标 `Superseded`。

---
type: Type
status: Active
---

# Source

**Raw 层 · 不可变原始源。** 一篇被摄取进 wiki 的外部材料:文章、论文、视频、对话记录、报告……
Source 只记录「这是什么、从哪来、可信度如何」;它的内容被提炼进一篇或多篇 [[summary|Summary]]。

## 字段

| 字段 | 含义 |
|---|---|
| `type` | `Source`(固定) |
| `status` | `Unprocessed`(待摄取)→ `Digested`(已产出 Summary)。**唯一状态真相。** |
| `url` | 原始链接(若有) |
| `evidence_tier` | 证据质量,见下表 |
| `last_verified` | 上次核实日期 `YYYY-MM-DD`;陈旧(> 6 个月)进复核队列 |
| `derived_into` | 关系 → 派生出的 [[Summary]] |

### `evidence_tier` 取值(高 → 低)

`independent_research` > `industry_report` > `analysis` > `vendor_source` > `opinion`

> 这个字段喂给 [[evidence-distribution]] 健康查询:同样 3 篇来源,3 篇 `independent_research` 和 3 篇 `vendor_source` 的分量天差地别。

## 规则

- **不可编辑**:要更新就重新摄取 → 产**新** Summary → 旧 Summary 标 `Superseded`。版本真相由 git 保证。
- 一个 Source 可以 `derived_into` 多篇 Summary(不同角度的提炼)。

## 最小实例(复制即用)

```markdown
---
type: Source
status: Unprocessed
url: https://example.com/the-article
evidence_tier: analysis
last_verified: 2026-08-04
derived_into: "[[your-summary]]"
---

# 文章标题

原始材料的笔记 / 摘录。摄取后把 status 改成 Digested。
```

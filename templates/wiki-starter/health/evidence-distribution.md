---
type: Query
status: Active
metric: evidence
---

# Evidence distribution

**证据质量分布。** 按 `evidence_tier` 分组数 Source。
同样 N 篇来源,N 篇 `independent_research` 和 N 篇 `vendor_source` 的可信度天差地别——这条查询把这种**偏差**亮出来。

```qql
WHERE type = "Source" RENDER group_by(evidence_tier)
```

> tier 高 → 低:`independent_research` > `industry_report` > `analysis` > `vendor_source` > `opinion`。
> `group_by(<字段>)` 是 RENDER 模式,不是子句;它对每个 tier 出一组 + 计数。

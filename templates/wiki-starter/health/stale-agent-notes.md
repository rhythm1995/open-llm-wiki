---
type: Query
status: Active
metric: provenance
---

# Stale agent notes

**复审超期。** agent 产出、但从未复审或复审太早的页。时间衰减的锚点是 `reviewed`(最近复审日)**而不是 `created`**:
agent 昨天生成、今天被人复核的页,比人两年前写了再没人看的页更可信。

```qql
WHERE provenance = "agent" AND (NOT has reviewed OR reviewed < "2026-05-08") SHOW title
```

> QQL 无日期算术:把 `"2026-05-08"` 换成「今天 − N 天」再跑(N 建议 ~180 天,与 [[source]] 的 `last_verified` 口径对齐),
> 由跑 consolidate 的 agent/人插值当天 cutoff。本查询把「从未复审」与「复审太早」一并捞出。
> 处理方式:人复核后更新 `reviewed: <今天>`;无法复核的标 `Contested` 或记 Open gap。

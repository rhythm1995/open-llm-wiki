---
type: Query
status: Active
metric: drift
---

# Stale sources

**Source 漂移(结构侧)。** 两条一组:① `last_verified` 超期(世界可能已变 → 重核实;变了就重新 ingest 产**新** Summary,旧的标 `Superseded`);② 缺 `last_verified` 字段(第一条捕不到缺字段的页,故需第二条)。

```qql
WHERE type = "Source" AND last_verified < "2026-02-06" SORT last_verified ASC SHOW title, last_verified
```

```qql
WHERE type = "Source" AND NOT has last_verified SHOW title
```

> QQL 无日期算术:第一条的阈值由跑 lint 的 agent/人插值(建议 ~6 个月,与 [[source]] 的字段约定一致)。
> ISO 日期串字典序 = 日期序。内容是否**语义上**过时不在这两条的射程,留给 agent/人判断。

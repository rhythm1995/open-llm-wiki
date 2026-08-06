---
type: Query
status: Active
metric: provenance
---

# Agent-unreviewed pages

**溯源健康(最该盯的)。** `provenance: agent` 产出、却从没有人复核过的页——错误与投毒积累的头号温床。
`provenance` 三值(`human` / `agent` / `ingested`)见类型契约(如 [[summary]]);字段可选、永不校验,缺失完全兼容。

```qql
WHERE provenance = "agent" AND NOT has reviewed SHOW title
```

> 这条查询也是**探针**:装好后跑一段时间,如果字段一直没人填,说明维护纪律不存在——先解决纪律,再谈更多字段。

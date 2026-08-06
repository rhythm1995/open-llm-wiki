---
type: Query
status: Active
metric: drift
---

# Unreviewed pages

**漂移风险(不限产出者)。** 没有 `reviewed` 日期的 Concept/Entity/Summary——「没有复审日期的页面迟早会安静地说谎」。
与 [[agent-unreviewed]] 互补:那条盯 agent 产出;这条连人多年前写下、再没看过的页也捞出来。

```qql
WHERE type IN ("Concept", "Entity", "Summary") AND NOT has reviewed SHOW title
```

> 处理方式:复核后补 `reviewed: <YYYY-MM-DD>`;写 ≠ 复审,只有人/流程确认后才更新这个字段。

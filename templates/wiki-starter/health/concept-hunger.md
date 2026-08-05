---
type: Query
status: Active
metric: hunger
---

# Concept hunger

**概念饥饿度。** 每个概念的引用深度(`mentioned_in.len()`),**最浅的在前**——即最该补料的概念。
`depth` 列就是它的入度:支撑它的 Summary 数。排在最上面的 = 当前证据最薄、最值得下一篇 Source 去喂。

```qql
WHERE type = "Concept" SHOW title, mentioned_in.len() AS depth SORT mentioned_in.len() ASC
```

> 想看「按状态分组有多少概念」(分布而非明细),把上面换成 `WHERE type = "Concept" RENDER group_by(status)`。

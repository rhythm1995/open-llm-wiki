---
type: Query
status: Active
metric: provenance
---

# Knowledge mix

**知识构成。** Wiki 层页按 `provenance` 分组,一眼看清「人写的 / agent 写的 / 摄取的」各占多少。
缺字段的页落 `(none)` 桶——这个桶本身就是**字段腐烂探针**:`(none)` 越涨越多,说明约定正在被遗忘。

```qql
WHERE type IN ("Concept", "Entity", "Summary") RENDER group_by(provenance)
```

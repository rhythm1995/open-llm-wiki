---
type: Query
status: Active
metric: duplicates
---

# Duplicate titles

**同名撞车(粗筛)。** 两个以上 Concept/Entity 共享同一 title——疑似概念重复 / 混淆;
而且撞名时 `[[wikilink]]` 解析**静默偏向第一篇**(first-wins),链接会悄悄指错页。

```qql
WHERE type IN ("Concept", "Entity") RENDER group_by(title)
```

> 看 count > 1 的桶。局限:`group_by` 按原值分桶,大小写不归一;alias 撞名、title × alias 交叉撞 QQL 够不到
> (由 core 的 `lint::duplicate_names` 归一化精筛)。处置:合并,或改名并留 `aliases:`。

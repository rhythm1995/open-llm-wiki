---
type: Query
status: Active
metric: orphans
---

# Orphans

**孤儿。** 没有任何笔记指向它的 Entity / Concept(反链入度 = 0)。
孤儿要么是「创建了但还没被任何 Summary 引用」(该补链),要么是「过时的死页」(该删 / 该归档)。

> QQL 没有 `IS EMPTY` 运算符。「无入边」用图谱算的反链入度 `mentioned_in.len() = 0` 表达——
> 入度由正文 `[[wikilink]]` 生成,与 frontmatter 是否写了 `mentioned_in:` 键无关。

```qql
WHERE type IN ("Entity", "Concept") AND mentioned_in.len() = 0 SHOW title
```

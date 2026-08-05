---
type: Query
status: Active
metric: synthesis
---

# Single-source concepts

**综合度(单源 / 薄证据概念)。** 引用深度 < 2 的概念——也就是只有 0 或 1 篇 Summary 支撑的主张。
一个「事实」如果只挂在一个来源上,它更像「某一家之言」而非「综合结论」;这条查询把它们挑出来,提示去交叉验证。

```qql
WHERE type = "Concept" AND mentioned_in.len() < 2 SHOW title
```

> 目标基线:`Active` 概念入度 ≥ 2 才算「综合过」。深度 ≥ 4 边际收益递减,这时该去**拓宽**而不是继续加深。

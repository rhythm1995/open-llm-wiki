---
type: Query
status: Active
metric: contested
---

# Contested concepts

**矛盾健康度。** 列出所有被标了 `status: Contested` 的概念——也就是有 `contradicts` 反驳、且尚未和解的主张。
这是「需要更多见证来定论」的清单,也是「重新摄取时最该补料」的目标(一个 Contested 概念既提深度、又可能和解矛盾,双倍价值)。

```qql
WHERE type = "Concept" AND status = "Contested" SHOW title
```

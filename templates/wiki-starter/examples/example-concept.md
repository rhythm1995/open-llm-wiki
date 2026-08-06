---
type: Concept
status: Contested
provenance: agent
trust: 1
---

# Example Concept

> 🧪 **示例,可删。** 演示一个 Concept(主张:「所以呢」),且故意标成 `Contested`——
> 这样你把 starter 装好后,跑 [[contested-concepts]] 和 [[single-source-concepts]] 都能看到它(非空)。

**主张:长上下文让「上下文」本身成为产品的护城河。**

- 被 [[example-summary]] 提到 → 反链入度 = 1(单源 / 薄证据,所以也会出现在 [[single-source-concepts]] 里)。
- `status: Contested` 表示这个主张目前有未和解的反驳(示例里没真写 `contradicts:`,真实用时一旦加上,被反驳方就应改 `Contested`)。
- `provenance: agent`(agent 产出)+ `trust: 1`(可选的显式信任级:未复核);没写 `reviewed`,所以也会出现在 [[agent-unreviewed]] 里。

跑 [[concept-hunger]] 时它会排在最前(深度最浅 = 最该补料)。

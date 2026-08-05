---
type: Type
status: Active
---

# Entity

**Wiki 层 · 具名实体。** 一个现实世界里被多篇 Source 反复提到的「东西」:人、组织、产品、项目、事件、工具。
Entity 页面**综合**所有提到它的 Summary,给出一个跨来源的稳定画像。

## 字段

| 字段 | 含义 |
|---|---|
| `type` | `Entity`(固定) |
| `status` | `Active`(实体一般稳定;废弃了可归档) |
| `mentioned_in` | **图谱自动算**(不用手填):指向它的所有 [[summary|Summary]] 形成的反链。`mentioned_in.len()` = 入度。 |
| `related_to` | 关系列表 → 相关的其他 [[Entity]] |

## 与 Concept 的区别

- **Entity = 名词**(「谁/什么」):Anthropic、Claude、Karpathy、……
- **Concept = 主张**(「所以呢」):「上下文是护城河」「AI 让个人涨、组织不涨」。

一篇 Summary 通常既 `mentions` 几个 Entity,又触及几个 Concept。

## 健康信号

- `mentioned_in.len() = 0` 的 Entity 是**孤儿**(没人引用)→ 见 [[orphans]] 查询。
- 单 Entity 入度过低,说明它还没被多篇来源交叉验证。

## 最小实例

```markdown
---
type: Entity
status: Active
related_to:
  - "[[another-entity]]"
---

# Anthropic

跨来源的综合画像。每条说法都 `[[链接]]` 回来源 Summary。
```

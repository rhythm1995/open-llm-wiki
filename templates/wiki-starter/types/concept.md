---
type: Type
status: Active
---

# Concept

**Wiki 层 · 可被引用 / 可被反驳的主张。** Concept 是 wiki 里最高价值的合成单元:一个跨来源提炼出来的论断,
可以被别的 Concept **支持 / 相关 / 反驳**。被反驳过(且未和解)的 Concept 标 `Contested`,它是健康度雷达的重点。

## 字段

| 字段 | 含义 |
|---|---|
| `type` | `Concept`(固定) |
| `status` | `Active`(成立)或 `Contested`(有未和解的反驳)。**唯一状态真相。** |
| `mentioned_in` | **图谱自动算**:指向它的所有 [[summary|Summary]] 的反链。入度 = 支撑它的来源数。 |
| `related` | 关系列表 → 相关的 [[Concept]] |
| `contradicts` | 关系列表 → 它反驳的 [[Concept]](一旦出现,被反驳方应标 `Contested`) |
| `provenance` | 谁产出:`human` / `agent` / `ingested`。可选软字段,缺失不校验 |
| `reviewed` | 最近复审日期 `YYYY-MM-DD`;写 ≠ 复审。可选 |
| `trust` | 显式信任级 `0–3`(**可选**):0=草稿/未核,1=agent 产出未复核,2=已复核,3=人确认/多源交叉。不填则靠 `provenance`+`reviewed` 隐式推 |

## `status` 决策

- 写下 `contradicts:` 的那一刻,把**被反驳**的那篇 Concept 的 `status` 改成 `Contested`。
- 反驳被和解(新证据倒向一方 / 合并)后,再把 `status` 改回 `Active` 并说明理由。

## 健康信号(Concept 是雷达中心)

| 信号 | 触发查询 |
|---|---|
| 有未和解反驳 | `status = "Contested"` → [[contested-concepts]] |
| 支撑不足(单源 / 薄) | `mentioned_in.len() < 2` → [[single-source-concepts]] |
| 该补料了(引用浅) | 按 `mentioned_in.len()` 升序 → [[concept-hunger]] |

> 目标是**状态相关**的:`Active` 概念入度 ≥ 2 算稳;`Contested` 需 ≥ 3(活跃辩论要比定论多见证)。

## 最小实例

```markdown
---
type: Concept
status: Active
provenance: agent
trust: 1
reviewed: 2026-08-04
related:
  - "[[a-related-concept]]"
---

# 上下文是护城河

主张的论证。每条都 `[[链接]]` 回来源 Summary。
```

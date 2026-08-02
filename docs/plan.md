# 实施计划(未完成 / 进行中)

> **未做单一入口之一**(与 [backlog.md](./backlog.md) 互补):本文写**顺序与切片**;backlog 写 ID 状态表。  
> 已落地功能请查 [FEATURE-INDEX.md](./FEATURE-INDEX.md)。

---

## 产品优先级(2026-08-02)

1. **编辑器 / 写作** — **主路径 + 保真门禁已收敛** ✅(见 §Editor)  
2. **非图杂项**(日志端口、分发、AGENTS 叙述、wiki 脚手架文档…)  
3. **图 / Agent / 6C** — **低优暂缓**  

下一刀由产品在 2 里点名,或可选编辑器微体验(§Editor 可选)。

---

## §Editor — 当前主线(本迭代已收敛)

| ID | 状态 | 说明 |
|---|---|---|
| §C 主路径 | ✅ | 格式条/查找替换/媒体/大纲/双模… |
| B-ED-WYSIWYG-FMT | ✅ | WYSIWYG 格式条对齐 source |
| B-ED-BROKEN-LINKS | ✅ | Inspector 断链黄条 |
| B-BN-FIDELITY + DEEP | ✅ | 双层门禁:app wikilink + **真 BN 引擎** parse→serialize |

### 编辑器明确后置 / 不做

- Live Preview 内核  
- 全屏相册  
- `![[Note]]` 全文嵌入  
- 嵌套多层任务列表 / HTML 表 / GFM 字节全同(BN Lossy 边界,见风险清单)  

### 编辑器若再开刀(可选)

- 真机 e2e:切 source↔WYSIWYG 后 diff 抽样  
- 某类用户 md 被改坏 → 加进 `SAFE_FIDELITY_FIXTURES`  
- source 任务列表按钮等微体验

---

## §Media — 已收口 ✅

M1 wiki 图嵌入 · M2 迁笔记搬图 · MediaIndex · 孤儿清理 — 见 FEATURE-INDEX / 08。

---

## §Graph / Agent — 低优先级(暂缓)

见 [11-graph-and-agent-roadmap.md](./11-graph-and-agent-roadmap.md) 与 backlog §I。  
**不主动开 6A 帧率 / 6B MCP links / 6C 语义**,除非产品再改优先级。

| 可后续 | 说明 |
|---|---|
| B-GRAPH-FPS | 真机 |
| B-MCP-LINKS 等 | 6B |
| B-WIKI-STARTER | 6D 文档向,可与编辑器并行但非阻塞 |

---

## 其它未完成

| 主题 | 去哪 |
|---|---|
| backlog 总表 | [backlog.md](./backlog.md) |
| 待拍板 | [open-questions.md](./open-questions.md) |

## 文档约定

| 类型 | 文件 |
|---|---|
| 已做 → 代码 | FEATURE-INDEX.md |
| 未做计划 | plan.md(本文) |
| ID 状态 | backlog.md |

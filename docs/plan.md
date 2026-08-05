# 实施计划(未完成 / 进行中)

> **未做单一入口之一**(与 [backlog.md](./backlog.md) 互补):本文写**顺序与切片**;backlog 写 ID 状态表。  
> 已落地功能请查 [FEATURE-INDEX.md](./FEATURE-INDEX.md)。

---

## 产品优先级(2026-08-02)

1. **编辑器 / 写作** — **主路径 + 保真门禁已收敛** ✅(见 §Editor)  
2. **非图杂项** — 已收口:IPC 日志打点 ✅ · source 任务按钮 ✅ · **wiki 脚手架(§I-D)✅** · **universal dmg 脚本 ✅** · AGENTS tldraw 叙述 ✅;剩签名 / Updater(🔑 凭证门)  
3. **图 / Agent / §I** — **人侧本期不做,推迟到很后**(图打磨 ROI 低 / 图不好做;2026-08-02 决策);6B agent 侧 MCP 与 6D wiki 脚手架**已交付**  

`feat/phase1-core` 已合 main(`84accb0`);当前开发在 `release/v0.1.0`(v0.1.0 tag 已打)。下一刀:真机验收(B-GRAPH-FPS / 应用内 Agent 端到端)+ 发布收口;或产品点名新项。

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
- ~~source 任务列表按钮~~ ✅(B-ED-TASK-BTN,`toggleTaskList`)

---

## §Media — 已收口 ✅

M1 wiki 图嵌入 · M2 迁笔记搬图 · MediaIndex · 孤儿清理 — 见 FEATURE-INDEX / 08。

---

## §Graph / Agent — 本期不做,推迟到很后

> **2026-08-02 决策**:§I 图谱 polish(6A)整期推迟——图打磨 ROI 低、实现成本高(「图不好做」)。引擎保留,远期重启。

见 [12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md) 与 backlog §I。  
**不主动开 6A 帧率 / 6B MCP links / 6C 语义**,除非产品再改优先级。

| 可后续 | 说明 |
|---|---|
| B-GRAPH-FPS | 真机验收(图相关唯一活跃项) |
| ~~B-MCP-LINKS / READ-BRIEF / WRITE-FEEDBACK / CONFIG~~ | 6B agent 侧 ✅(backlog §I-B) |
| ~~B-WIKI-STARTER / HEALTH-QQL / AGENT-DOC~~ | 6D ✅(`templates/wiki-starter/` + [14](./14-llm-wiki-workflow.md)) |

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

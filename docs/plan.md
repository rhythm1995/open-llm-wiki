# 实施计划(未完成 / 进行中)

> **未做单一入口之一**(与 [backlog.md](./backlog.md) 互补):本文写**顺序与切片**;backlog 写 ID 状态表。  
> 已落地功能请查 [FEATURE-INDEX.md](./FEATURE-INDEX.md)。

---

## 产品优先级(2026-08-02)

1. **编辑器 / 写作** — **主路径 + 保真门禁已收敛** ✅(见 §Editor)  
2. **非图杂项** — 已收口:IPC 日志打点 ✅ · source 任务按钮 ✅ · **wiki 脚手架(§I-D)✅** · **universal dmg 脚本 ✅** · AGENTS tldraw 叙述 ✅;剩签名 / Updater(🔑 凭证门)  
3. **图 / Agent / §I** — 人侧图 polish 仍推迟。**例外(2026-08-15)**:6B NL 表面按「库健康 + Agent 短指令」落地,不重建 QueryPanel。6B MCP 与 6D wiki 脚手架已交付。

**v0.1.0 已发布并合回 main**(2026-08-19);真机验收(B-GRAPH-FPS / 应用内 Agent 端到端)已全部完成。下一刀:**发布面补全**(`B-RELEASE-ASSETS` 补 Linux + macOS x64 产物;签名 / Updater 凭证门);或产品点名新项。

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
**不主动开 6A 图 polish / 6C 语义**,除非产品再改优先级。6B 人侧查库已按库健康 + Agent seed 交付(见 backlog `B-HEALTH-DASH`)。

| 可后续 | 说明 |
|---|---|
| ~~B-GRAPH-FPS~~ | ✅ 2026-08-19 真机验收完成(图相关已无活跃项) |
| ~~B-MCP-LINKS / READ-BRIEF / WRITE-FEEDBACK / CONFIG~~ | 6B agent 侧 ✅(backlog §I-B) |
| ~~B-WIKI-STARTER / HEALTH-QQL / AGENT-DOC~~ | 6D ✅(`templates/wiki-starter/` + [14](./14-llm-wiki-workflow.md)) |

---

## 评估后不做:core+mcp 抽独立通用库(2026-08-06)

曾评估把「人机共用记忆系统」(core 引擎 + MCP server + wiki-starter 方法论)拆成**独立项目/项目无关通用库**。**探查结论:技术可行、接缝干净**——`core` 已是 IO-free 独立 crate(依赖仅 serde + serde_yaml,特有残留只有 lint 的 LLM Wiki 本体字面量、media 的 `tauri:`/`asset:` scheme、命名);`mcp` 结构上已独立(单二进制、自带 walker、零 Tauri 耦合,唯一系带是 `path = "../core"` + 品牌命名);templates/docs 14 无代码引用可整体搬。**人拍板:不做**——记忆系统继续作为 Open LLM Wiki 内置模块演化。若未来重启,上述探查事实可直接复用(mcp 去品牌化 + 换依赖源即可 standalone)。

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

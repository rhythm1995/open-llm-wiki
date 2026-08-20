# 实施计划(未完成 / 进行中)

> **未做单一入口之一**(与 [backlog.md](./backlog.md) 互补):本文写**顺序与切片**;backlog 写 ID 状态表。  
> 已落地功能请查 [FEATURE-INDEX.md](./FEATURE-INDEX.md)。

---

## 产品优先级(2026-08-02)

1. **编辑器 / 写作** — **主路径 + 保真门禁已收敛** ✅(见 §Editor)  
2. **非图杂项** — 已收口:IPC 日志打点 ✅ · source 任务按钮 ✅ · **wiki 脚手架(§I-D)✅** · **universal dmg 脚本 ✅** · AGENTS tldraw 叙述 ✅;剩签名 / Updater(🔑 凭证门)  
3. **图 / Agent / §I** — 人侧图 polish 仍推迟。**例外(2026-08-15)**:6B NL 表面按「库健康 + Agent 短指令」落地,不重建 QueryPanel。6B MCP 与 6D wiki 脚手架已交付。

**v0.1.0 已发布并合回 main**(2026-08-19);真机验收(B-GRAPH-FPS / 应用内 Agent 端到端)已全部完成;**四平台产物已补齐**(`B-RELEASE-ASSETS` ✅:macos-13 runner 退役 → 换 `macos-15-intel`,ubuntu apt 挂死 → 超时/重试)。**§L TDD 补齐 ✅**(L-1–L-5,2026-08-20)。下一刀:签名 / Updater(凭证门);或产品点名新项。

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

## §TDD — 已落地功能的测试缺口(2026-08-20)

> **盘点结论**:`core` + `ui/src/lib` 纯逻辑基本齐。缺的不是解析 / 图谱 / QQL 引擎,而是产品胶水(store / 编辑器 / 图谱 UI / IPC 契约)。  
> ID 总表见 [backlog §L](./backlog.md)。策略仍是 [05-tdd-strategy.md](./05-tdd-strategy.md):**先写失败测试,后写刚好够绿的实现**;禁止一个用例断言十件事;组件测行为不测颜色。  
> vitest 默认不计未被 import 的文件,覆盖率数字偏乐观——补测时以行为契约为准,不以百分比为目标。

### 切片顺序(ROI)

1. **L-1 逻辑几乎没测(优先)** — ✅ 2026-08-20:store 生命周期、source Editor、图谱 UI、Nav、Settings、FindBar、Git/归档 UI、IronCalc 回退、skills 安装器、官网 lib。  
2. **L-2 引擎有测、契约没测** — ✅ 2026-08-20:笔记/附件 IPC 真目录 roundtrip;MCP 8 tools 均有 `tools_call`。  
3. **L-3 有测试但薄** — ✅ 2026-08-20:ToolCard / AgentActivity、表格冻/图/嵌入、e2e 图谱过滤与反链。  
4. **L-4 App 壳邻接行为** — ✅ 2026-08-20:status-chip / ContextMenu / ColResizeHandle / ErrorBoundary / ReadingPane / `formatLogArg`。不挂整棵 `App.tsx`(热键 / 拖窗仍是编排胶水,策略不强制)。  
5. **L-5 加厚 + 热键纯函数** — ✅ 2026-08-20:TabBar 中键/右键/拖拽、NoteList 过滤/重命名/右键、Editor 右键+拖图、`matchAppHotkey`/`findOpenPlan`、persist/theme/locale hooks。仍不挂 App。

### L-1 验收(每条独立、可失败定位)

| ID | 测什么(用户契约) | 不测什么 |
|---|---|---|
| B-TDD-STORE | open / 恢复上次笔记 / 新建删改名 / tab / 防抖保存 / 切 vault 清历史 | Tauri watcher 真事件(已有 `vault-watch.ts`) |
| B-TDD-EDITOR | 空态、格式条落到 CM 正文、⌘F 句柄、插图按钮打开文件框 | CM 主题色 / 语法高亮 |
| B-TDD-GRAPH-UI | 空图、节点/边统计、type 过滤改统计、布局切换、点节点打开笔记 | Canvas 粒子/力仿真(mock `ForceGraphLayer`) |
| B-TDD-NAV | Inbox/All/Archive、type/tag 计数与筛选、文件夹、拖入移动 | 图标配色 |
| B-TDD-SETTINGS | 关=不渲染;主题/语言/模式/附件/布局 patch;诊断 tab | Agent 接入面板(已有独立测) |
| B-TDD-FINDBAR | 计数、下一/上一、替换、Esc 关、IME Enter 不触发 | CM 高亮样式 |
| B-TDD-GIT-UI | mock 横幅禁用 pull/push;桌面 status/log/commit;归档还原 / 非仓库 init | 真 git(已有 `git_tests`) |
| B-TDD-IRONCALC | wasm 不可用 → `null`(回退自研);可用时灌格并 `free` | 真 wasm 数值引擎 |
| B-TDD-SKILLS | CLI `list` / `install` 双写 skill、`--force` / `--no-hooks`、拒非目录 | npm 发布 |
| B-TDD-SITE | locale / 截图文件名 / docs slug / markdown 消毒与内链 | GSAP 动效 |

### L-4 验收

| ID | 测什么(用户契约) | 不测什么 |
|---|---|---|
| B-TDD-STATUS-CHIP | 五色桶词根 + 先匹配者赢 + 未识别回退 | Inspector 排版色 |
| B-TDD-CTX-MENU | 点项/遮罩/Esc/滚动关;陈旧滚动忽略;溢出夹紧 | 菜单阴影 |
| B-TDD-COL-RESIZE | 左右拖方向、min/max、松手卸监听 | 手柄 hover 色 |
| B-TDD-ERR-BOUNDARY | schema vs 普通文案、自定义 fallback、展开/复制 | `location.reload` 真刷新 |
| B-TDD-READING-PANE | 空态、标题、wikilink 跟随、图 URL、sheet 缺/有、旧渲染丢弃 | 阅读区排版 |
| B-TDD-DIAG-LOG | `formatLogArg` 四形态 | Tauri `installConsoleForwarder` |

### L-5 验收

| ID | 测什么(用户契约) | 不测什么 |
|---|---|---|
| B-TDD-TABBAR | 中键关、关其它、复制路径、拖拽 reorder | 激活条颜色 |
| B-TDD-HOTKEYS | 修饰键表、无 path 不 ⌘W、面板开不循环;Find 拒画布/表格并还原 wysiwyg | 挂整棵 App / 窗口拖拽最大化 |
| B-TDD-EDITOR-MORE | 右键粗体、拖 png 落盘插 md;列命中 `[[target]]` | CM `posAtCoords` 真坐标 |
| B-TDD-NOTELIST-MORE | 过滤、Esc/IME 重命名、归档 mock 横幅、右键三动作 | Reveal in Finder |
| B-TDD-HOOKS | 读写 localStorage、坏 JSON 回退、`t()` 跟语言 | 无痕模式抛错路径 |

官网纯展示与凭证门(签名 / Updater)不进本切片。

---

## 其它未完成

| 主题 | 去哪 |
|---|---|
| backlog 总表 | [backlog.md](./backlog.md) |
| TDD 缺口 ID | [backlog.md](./backlog.md) §L |
| 待拍板 | [open-questions.md](./open-questions.md) |

## 文档约定

| 类型 | 文件 |
|---|---|
| 已做 → 代码 | FEATURE-INDEX.md |
| 未做计划 | plan.md(本文) |
| ID 状态 | backlog.md |

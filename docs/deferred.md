# 延后与难点清单(Deferred)

> 这里集中归档**尚未实现、且不仓促塞空心 stub** 的能力。每条写明:**现状 / 难在哪 / 做扎实需要什么 / 前置**。难度标记:🔴 硬 · 🟡 中 · 🟢 易。
>
> **未做总表**请看 [backlog.md](./backlog.md)(含原 v1 边界改待办)。本文补「为什么难」。  
> roadmap 一句话状态见 [06-roadmap](./06-roadmap.md)。

---

## ✅ ~~原 v1 边界三项~~(已落地)

| 项 | backlog | 落地 |
|---|---|---|
| 类型文档 | B-TYPE-DOC | Inspector 提示;`types/{Type}.md` |
| 图谱分层/时间轴 + UI | B-GRAPH-* | `graph-modes` + GraphView select |
| QQL 扩展 | B-QQL-EXPAND | CONTAINS/STARTSWITH/ENDSWITH/IN |

---

## 🟡 编辑器与菜单(产品打磨 · 非空 stub)

> 总表见 [backlog §C–D](./backlog.md)。此处记**现状 / 难在哪 / 做扎实需要什么**。

### 编辑器

- **现状**:CodeMirror **source** + BlockNote **wysiwyg** 双模,同一 `.md`;`[[` 补全/跳转;source 有 qql-widget 与 ⌘F(CM search);wysiwyg 有 chip/`[[` 建议菜单。
- **难在哪 / 缺口**:
  1. **保真**(B-BN-FIDELITY):BlockNote JSON↔md 有损子集;缺差分测试集与禁用特性表。
  2. **双模不齐**:qql 仅 source 实时 widget;⌘F 在 wysiwyg 走 `window.find()`。
  3. **写作台感不足**:source 无格式工具条/产品化 slash;正文无 app 级右键;图片粘贴/预览弱。
  4. **模式心智**:切换入口偏隐,无「有损风险」提示。
- **做扎实需要**:先 B-ED-CTX-MENU + B-PALETTE-EXPAND(体感);再 B-ED-FMT-BAR / FIND-PARITY / QQL-WYSIWYG;并行 B-BN-FIDELITY 测试门禁。

### 菜单与命令

- **现状**:⌘K 薄命令集;列表行/图谱节点有 ContextMenu;顶栏视图切换 + 三栏显隐。
- **难在哪 / 缺口**:
  1. **无系统应用菜单**(B-APP-MENU):File/Edit/View 桌面惯例缺失。
  2. **⌘K 过瘦**(B-PALETTE-EXPAND):缺模式切换、保存、归档、Reveal、主题/语言、快捷键标注。
  3. **右键覆盖不均**:编辑器正文 / Nav 树 / Tab 栏无菜单。
  4. **无设置页**(B-SETTINGS)。
- **做扎实需要**:Tauri menu 插件或先把动作全挂进 palette;ContextMenu 扩到 Nav/Tab/Editor;设置可用 localStorage 键聚合起步。

---

## 🟡 图谱大图性能(>400 → 万级)—— **功能+打磨已齐 · 真机帧率验收仍开放**

- **已落地**:
  1. `graph-model` / Worker FR / Barnes-Hut / LOD / sigma WebGL / 标签避让 / 增量预算
  2. 多布局:力导向 + type 分层 + 时间轴 + UI 切换
  3. 交互双路径:拖拽/pin/框选/邻域/ghost/右键
- **仅真机验收(不阻塞)**:1k ≥30fps / 5k / 10k LOD。基准:`tools/gen-benchmark-vault.mjs`。

## ✅ ~~图谱右键菜单~~(已落地)

- **已实现**(Phase 2 图谱重做):右键节点 → 自实现 `ContextMenu` 组件(轻量,非 Radix)→「聚焦 1 跳 / 复制 `[[wikilink]]` / 隐藏此类型」。hit-testing 复用左键跳转的坐标判定;空场区右键仍走顶部过滤面板。

## ✅ ~~内联 `` ```qql `` 查询块渲染~~(已落地)

- **已实现**(Phase 5+ 续五):笔记正文里的 ` ```qql … ``` ` 代码块在编辑器内**实时求值**,结果以只读块级 widget 渲染在块下方;阅读视图同样求值渲染。
  - 纯逻辑 `qql-block.ts`(`findQqlBlocks` 围栏块定位 + `resultToHtml` 把 ResultSet→HTML,**编辑器 widget 与阅读视图共用同一渲染器 → 两路一致**,17 单测)。
  - CodeMirror 6:`qql-widget.ts`(StateField 缓存 query→result + ViewPlugin 在闭围栏下一行行首放块级 widget + WidgetType;doc 变化防抖 400ms 重算,语法错降级为 `⚠` 文案)。
  - 阅读视图:marked 渲染后 effect 查 `pre code.language-qql` → run_qql 求值(按 query 缓存)→ 注入 sanitize 过的结果节点。
  - **mock**:`mock-qql` 子集(type/status/tag/LIMIT/COUNT/GROUP/histogram)供 vite dev;完整语义仍以 Rust core 为准(全量移植 TS 为独立大件)。

- **已实现**(commit `f6d9a09`):常用 QQL 存成一篇 `type: Query` 的普通笔记,frontmatter
  声明软类型、正文放 ```` ```qql ```` 块。因此自动进索引/图谱/检索,可被 `[[]]` 链接、可被
  别的 QQL 查到——自举。QueryPanel 加「保存 / 已保存查询列表 / 点击重跑 / × 删除(软删)」。
  纯逻辑 `saved-query.ts`(15 单测)。

## 🟡 BlockNote 双模 + Markdown round-trip 保真

- **现状**:CodeMirror 源码 + BlockNote WYSIWYG **双模已落地**,读写同一 `.md`;frontmatter 走侧栏。阅读视图(marked + DOMPurify)仍可用。
- **难在哪**:BlockNote JSON↔Markdown **有损**子集(嵌套列表/表格/对齐等);来回切换可能漂移。
- **做扎实需要**:保真差分测试集 + 明确禁用特性表;长文档性能基线。
- **前置**:测试集 + 基线(非阻塞日常使用)。

## 🔴 F-SHEET(ironcalc 嵌入式表格)

- **现状**:延后。
- **难在哪**:npm 上只发布了 `@ironcalc/wasm` 引擎,**没有 React UI**;自己造表格 UI 是周级以上工程(行列寻址、公式栏、选区、复制粘贴语义、冻结行列、溢出渲染、图表)。
- **做扎实需要**:等 ironcalc 的 React 组件正式发布;或自研 UI 壳(消费 wasm 引擎的 cells/formulas)。文件格式(嵌入 .md 还是独立 .sheet)也要定。
- **前置**:ironcalc React 组件可用性复核;若不可用,评估是否自研或换库(如 x-spreadsheet 等)。

## 🔴 F-PLUGIN(插件系统)

- **现状**:延后。
- **难在哪**:"插件系统"不是注册器,是**对外 API 契约 + 沙箱 + 生命周期 + 分发 + 安全模型**的整套。空心注册器是反价值占位。①API 表面:暴露哪些内部能力(笔记读写、图谱、命令注册、设置、事件);②沙箱:Web Worker / iframe / QuickJS,插件崩溃不能拖垮主进程;③生命周期:install/enable/disable/uninstall + 数据迁移;④分发与版本:清单文件、语义版本、依赖;⑤安全:第三方插件不能任意访问文件系统。
- **做扎实需要**:先把 v1 内部 API 固化稳定,再谈对外暴露的子集;定插件清单格式;选沙箱方案并写 PoC。
- **前置**:v1 内部能力稳定 + 一份"插件能做什么/不能做什么"的权限清单。

## 🟡 打包与分发(macOS / Windows / Linux)

- **现状**:**CI 骨架已落地**(task #54)。① `tauri.conf.json` 的 bundle 配置完整(productName / identifier `dev.openobsidian.desktop` / icon 全套 / category / 各平台目标);② 本地从仓库根 `ui/node_modules/.bin/tauri build` 已验证可出包 —— `target/release/bundle/macos/OpenObsidian.app` + `OpenObsidian_0.1.0_aarch64.dmg`,运行时 diag_log 0 `[webview]` 报错;③ `.github/workflows/ci.yml`(push/PR 跑 core 测试 + UI 测试/类型 + openobs-app 集成测试,含 git_tests)+ `release.yml`(tag/手动触发,macOS-arm64 / macOS-x86_64 / ubuntu / windows 矩阵打 dmg/AppImage/deb/msi/exe → 起草 GitHub Release)。**默认出未签名包**;配了对应 secret 才签名/公证。
- **仍 gated 在用户侧(未做)**:① macOS 代码签名 + 公证(需 APPLE_CERTIFICATE / APPLE_ID 等 secret);② Windows 安装包签名(需证书);③ 自动更新 Updater(需 TAURI_PRIVATE_KEY + 决定是否上 —— 影响签名 manifest 设计);④ 通用 universal `.dmg`(当前 arm64/x86_64 各一份,未 lipo 合并)。这些 workflow 已接好环境变量槽位,补 secret 即启用,无需改代码。
- **难在哪**:流程性而非算法难。剩下的都是凭证/决策门,不是工程未知。
- **做扎实需要**(剩余):签名密钥管理 + 公证流程脚本化(已脚本化,等密钥)。随包资源:`LICENSE` + `THIRD_PARTY_NOTICES.md` + `licenses/blocknote-LICENSE.md`(画布已为 Excalidraw MIT,不再随包 tldraw 许可证)。
- **前置**:决定是否上自动更新;macOS 开发者账号 / Windows 证书。

## ✅ ~~F-CANVAS 换 Excalidraw(纯 MIT)~~(代码已落地)

- **已实现**:`@excalidraw/excalidraw`;`canvas.ts` 自有 schema;旧 tldraw 快照只读;懒加载 `CanvasView`。见 `THIRD_PARTY_NOTICES.md`。

## ✅ ~~标签循环快捷键~~(已落地)

- **已实现**(Phase 5+ 续五):`tabReduce` 加 `cycle` 动作(环回到首/尾,纯逻辑 + 单测);`store.cycleTab(direction)` 切换并读盘;App 全局 keydown 挂 **Ctrl+Tab / Ctrl+Shift+Tab / ⌘/Ctrl+Shift+[ / ⌘/Ctrl+Shift+] / ⌘/Ctrl+PageUp / PageDown**。
- **浏览器 dev 抢占(已知)**:Ctrl+Tab 在浏览器里被抢占(`preventDefault` 无效),仅在 Tauri 桌面 webview 里生效;⌘Shift+[] 与 PageUp/Down 在桌面可用。键位可用性的最终目视仍需在 Tauri 桌面构建里确认(我无 GUI)。

## ✅ ~~恢复上次打开的笔记~~(已落地)

- **已实现**(commit `146c357`):打开 vault 时优先恢复上次看的笔记,而不是总跳到首个 `.md`。
  按 vault root 分键存(`openobs.lastPath:<root>`)。恢复决策放在 `openVault`(有 entries + 回退
  路径,语义最干净,避免 App 侧"默认选择 vs 用户选择"无法区分的死结);命中且仍存在才恢复,
  否则回退首个 `.md`。纯逻辑 `last-note.ts`(6 单测)。

## 🔴 完整 MCP server(F-AI 写侧)

- **现状**:读侧"复制为 AI 上下文"已落地(当前笔记 + 邻居正文拼成 LLM 友好 markdown 入剪贴板)。
- **难在哪**:完整 MCP server 是让 **agent 反向读写 vault** 的独立工程——stdio / HTTP 的 JSON-RPC、tools 注册(read_note / write_note / search / query / list)、资源订阅、**权限模型**(哪个 client 可写)、并发写冲突。
- **做扎实需要**:复用 `openobs-core` 的纯逻辑;定 server 传输与 tools 表面;权限白名单;不在此仓促做空心 stub。

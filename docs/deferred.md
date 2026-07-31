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

## 🟡 编辑器(主路径齐 · 可选加深)

> 总表见 [backlog §C–D/§H](./backlog.md)。

### 编辑器

- **现状**:双模 + 格式条/右键/保真提示/WYSIWYG qql ✅;附件 v1 + source 并排 ✅([08](./08-media-and-split-preview.md));§C 主路径齐。
- **仍缺口 / 可选**:
  1. **保真深化**(B-BN-FIDELITY):门禁已有,完整差分/禁用特性表可继续加。
  2. ~~**WYSIWYG 插图**~~ ✅:粘贴/拖入与 source 同路径(attachments + md 图)。
  3. **Live Preview / 相册 / 音视频**:明确不做(08 非目标)。

### 菜单与命令

- **现状**:系统菜单 v2 + 命令注册表 + ⌘K/⌘P/⌘⇧F + Settings + 右键 ✅(§D/§H,[10](./10-menus-and-search.md))。
- **可选后续**:菜单文案随 locale 重建。

---

## 🟡 图谱大图性能(>400 → 万级)—— **代码齐 · 缺真机帧率数字**

- **已落地**:
  1. `graph-model` / Worker FR / Barnes-Hut / LOD / sigma WebGL / 标签避让 / 增量预算
  2. 多布局:力导向 + type 分层 + 时间轴 + UI 切换
  3. 交互双路径:拖拽/pin/框选/邻域/ghost/右键
- **核实(2026-07-31)**:
  - ✅ 生成器存在:`tools/gen-benchmark-vault.mjs`(默认 1000 篇 → `./benchmark-vault/`,可改 count)。
  - ❌ **无** CI/自动化帧率测量;脚本注释写明「帧率只能在 GUI 里目视」。
  - 开放项仍是 **B-GRAPH-FPS**:本机 `node tools/gen-benchmark-vault.mjs 1000` → Tauri 打开 vault → 观察 1k/5k 交互是否可接受。

## ✅ ~~图谱右键菜单~~(已落地)

- **已实现**(Phase 2 图谱重做):右键节点 → 自实现 `ContextMenu` 组件(轻量,非 Radix)→「聚焦 1 跳 / 复制 `[[wikilink]]` / 隐藏此类型」。hit-testing 复用左键跳转的坐标判定;空场区右键仍走顶部过滤面板。

## ✅ ~~内联 `` ```qql `` 查询块渲染~~(已落地)

- **已实现**(Phase 5+ 续五):笔记正文里的 ` ```qql … ``` ` 代码块在编辑器内**实时求值**,结果以只读块级 widget 渲染在块下方;阅读视图同样求值渲染。
  - 纯逻辑 `qql-block.ts`(`findQqlBlocks` 围栏块定位 + `resultToHtml` 把 ResultSet→HTML,**编辑器 widget 与阅读视图共用同一渲染器 → 两路一致**,17 单测)。
  - CodeMirror 6:`qql-widget.ts`(StateField 缓存 query→result + ViewPlugin 在闭围栏下一行行首放块级 widget + WidgetType;doc 变化防抖 400ms 重算,语法错降级为 `⚠` 文案)。
  - 阅读视图:marked 渲染后 effect 查 `pre code.language-qql` → run_qql 求值(按 query 缓存)→ 注入 sanitize 过的结果节点。
  - **mock/dev**:`run_qql` 走 QQL-TS(`ui/src/lib/qql`);桌面 Rust core。两边各自有单测,**无**同批 fixture 自动差分 CI。

- **已实现**(commit `f6d9a09`):常用 QQL 存成一篇 `type: Query` 的普通笔记,frontmatter
  声明软类型、正文放 ```` ```qql ```` 块。因此自动进索引/图谱/检索,可被 `[[]]` 链接、可被
  别的 QQL 查到——自举。QueryPanel 加「保存 / 已保存查询列表 / 点击重跑 / × 删除(软删)」。
  纯逻辑 `saved-query.ts`(15 单测)。

## 🟡 BlockNote 双模 + Markdown round-trip 保真

- **现状**:CodeMirror 源码 + BlockNote WYSIWYG **双模已落地**,读写同一 `.md`;frontmatter 走侧栏。阅读视图(marked + DOMPurify)仍可用。
- **难在哪**:BlockNote JSON↔Markdown **有损**子集(嵌套列表/表格/对齐等);来回切换可能漂移。
- **做扎实需要**:保真差分测试集 + 明确禁用特性表;长文档性能基线。
- **前置**:测试集 + 基线(非阻塞日常使用)。

## ✅ F-SHEET v2 已落地

- 多工作表 tabs、冻结行列、bar/line 图表、````sheet` md 嵌入、SUM/AVERAGE/MIN/MAX/COUNT、跨表 `Sheet1!A1`。
- `@ironcalc/wasm` 可选增强(失败回退内置引擎)。

### ⛔ 明确不做(2026-07-30 产品拍板)

| 非目标 | 理由(对照) |
|---|---|
| **XLSX 全量导入导出** | Tolaria/Obsidian 核心也不以此为主路径(Obsidian 靠插件);vault 真相是自有 `.sheet` JSON |
| **实时协作(同屏多光标)** | 三家主路径都是本地文件 + 同步(Git/Sync),非 Google Sheets;本项目协作走 **git** |

协作若指多人共享 vault:继续用 git pull/push,不做表格级 CRDT/直播编辑。

## ⛔ F-PLUGIN 深化 —— 产品不做

- v1 宿主代码保留(示例 hello → ⌘K);**不再做** vault 扫描 UI、商店、签名、热更新。

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

## 🟡 MCP server v1 已落地 · 深化项

- **已落地**:workspace 成员 `mcp/`(`openobs-mcp`)stdio JSON-RPC;tools:`list_notes` / `read_note` / `write_note` / `search_notes` / `run_qql` / `vault_info`;复用 `openobs-core`。
- **用法**:`cargo run -p openobs-mcp -- /path/to/vault` 或 `OPENOBS_VAULT=...`。
- **未做**:HTTP 传输、OAuth、resources 订阅、写冲突策略、细粒度 ACL。

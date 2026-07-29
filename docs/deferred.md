# 延后与难点清单(Deferred)

> 这里集中归档**没有在本轮做、且不打算仓促塞空心 stub** 的能力。每条写明:**现状 / 难在哪 / 做扎实需要什么 / 前置**。难度标记:🔴 硬(算法或工程量)· 🟡 中 · 🟢 易(纯待办)。
>
> 与 [06-roadmap](./06-roadmap.md) 的关系:roadmap 的 Phase 2+ 表只给一句话状态;**真正"为什么难、要什么前置"的细节在这里**。roadmap 表已链接回本文。

---

## 🔴 图谱大图性能(>400 节点)

- **现状**:图谱是**纯 SVG 力导向**(自实现 Fruchterman–Reingold),全量节点渲染为 DOM,每帧 O(n²) 全对斥力 + 弹簧力计算。日常 vault(几十~两三百笔记)流畅。
- **本轮进展(Phase 2 图谱重做 + Phase 5+ 续五)**:已落地两个子项——①「增量/稳定布局」:布局纯逻辑抽出 `graph-layout.ts`,位置 Map 跨帧持久(新增节点就近/螺旋播种 + 以既有位置为初值的少量迭代松弛,过滤/索引刷新时已有节点不乱跳);渲染按度数 top-K 截断(默认上限 ~400)避免 DOM 爆炸。②「视口剔除」:`visibleNodeIds` 纯函数(graph→屏幕坐标判定,6 单测),节点数 > 200 时屏外节点/边不画,降 SVG DOM 量(80px 屏幕留白减边缘 pop-in)。**仍未做**:LOD 聚类、SVG→Canvas/WebGL、Web Worker。
- **难在哪**:节点数过 ~400 后,①布局收敛耗时(每帧 n² 力计算);②SVG 每节点一个 `<g>` DOM,大量节点拖累渲染与交互;③(已部分解决)屏外节点照画——视口剔除已落地,但 LOD 聚类与渲染层换血未做。
- **做扎实需要**:
  - **视口剔除 + LOD**:屏外节点不画;缩放层级低时把簇合并成"超级节点"(聚类),放大再展开。
  - **渲染层换血**:SVG → Canvas 2D(甚至 WebGL),DOM 不再随节点数线性增长(代价:失去 CSS 样式与无障碍,需自实现 hit-testing)。
  - **增量/稳定布局**:初始一次性收敛后存坐标,新增节点局部增量重排,不每帧全量。
  - **Web Worker** 把力计算挪出主线程。
- **前置**:~~先造一个 >400 / >1000 节点的 benchmark vault~~ ✅ 已满足——`tools/gen-benchmark-vault.mjs`(纯 Node、零依赖)可按需生成 N 篇带类型/wikilink/度数偏斜的 vault:`node tools/gen-benchmark-vault.mjs 1000`(1000 篇 0.13s、2000 篇 0.19s 生成,7.8M;输出目录已 gitignore)。**剩下的是真机测量**:在桌面 app 里打开生成的 vault,目视图谱帧率与交互流畅度——这才是决定换 Canvas/WebGL 还是先做 LOD 的依据(布局在 n≤400 已数十毫秒收敛,瓶颈是 SVG DOM 量)。

## ✅ ~~图谱右键菜单~~(已落地)

- **已实现**(Phase 2 图谱重做):右键节点 → 自实现 `ContextMenu` 组件(轻量,非 Radix)→「聚焦 1 跳 / 复制 `[[wikilink]]` / 隐藏此类型」。hit-testing 复用左键跳转的坐标判定;空场区右键仍走顶部过滤面板。

## ✅ ~~内联 `` ```qql `` 查询块渲染~~(已落地)

- **已实现**(Phase 5+ 续五):笔记正文里的 ` ```qql … ``` ` 代码块在编辑器内**实时求值**,结果以只读块级 widget 渲染在块下方;阅读视图同样求值渲染。
  - 纯逻辑 `qql-block.ts`(`findQqlBlocks` 围栏块定位 + `resultToHtml` 把 ResultSet→HTML,**编辑器 widget 与阅读视图共用同一渲染器 → 两路一致**,17 单测)。
  - CodeMirror 6:`qql-widget.ts`(StateField 缓存 query→result + ViewPlugin 在闭围栏下一行行首放块级 widget + WidgetType;doc 变化防抖 400ms 重算,语法错降级为 `⚠` 文案)。
  - 阅读视图:marked 渲染后 effect 查 `pre code.language-qql` → run_qql 求值(按 query 缓存)→ 注入 sanitize 过的结果节点。
  - **mock 限制(诚实)**:core 的 QQL 求值不在浏览器复刻,mock 下 `run_qql` 返回空 List → 内联块在 dev 下显示「无结果」;真机 Tauri 构建走 Rust core 才有真实结果(把 QQL 求值器移植到 TS 是独立大件,不在本轮范围)。

- **已实现**(commit `f6d9a09`):常用 QQL 存成一篇 `type: Query` 的普通笔记,frontmatter
  声明软类型、正文放 ```` ```qql ```` 块。因此自动进索引/图谱/检索,可被 `[[]]` 链接、可被
  别的 QQL 查到——自举。QueryPanel 加「保存 / 已保存查询列表 / 点击重跑 / × 删除(软删)」。
  纯逻辑 `saved-query.ts`(15 单测)。

## 🔴 BlockNote 富文本 + Markdown round-trip

- **现状**:编辑器是 CodeMirror 6 纯源码(Markdown round-trip 最稳、体积小);阅读视图(marked + DOMPurify)已覆盖"看渲染结果"。BlockNote 延后。
- **难在哪**:BlockNote 产出自己的 **JSON block 模型**,转 Markdown 靠其自带 serializer,但**有损**——嵌套列表、表格、对齐、callout 等回不来。要做"源码 ↔ 富文本双模同一文件",切换必须双向无损,否则来回切几次正文就漂移了。这是已知行业难点,不是接个库就完事。
- **做扎实需要**:①评估 BlockNote 当前版本的 round-trip 保真度(造一批含边缘语法的 md → block → md 差分测试);②定一个"保真子集",明确禁用哪些 BlockNote 特性;③长文档性能(BlockNote 大文档卡顿有报告);④许可(BlockNote MPL-2.0 弱 copyleft,可接受,但要拉 Mantine)。
- **前置**:round-trip 差分测试集 + 性能基线。在没证明"无损"前不动 CodeMirror。

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
- **做扎实需要**(剩余):签名密钥管理 + 公证流程脚本化(已脚本化,等密钥)。~~tldraw 许可合规在分发物里的体现(LICENSE 随包、归属可见)~~ ✅ 已满足——`tauri.conf.json` 的 `bundle.resources`(object 形,`{源: 目标}`)把 `LICENSE` / `THIRD_PARTY_NOTICES.md` / `licenses/tldraw-LICENSE.md` 打进 `.app`/`.dmg` 的 `Contents/Resources/`(已验证三文件落地、内容正确);运行时画布右下角「Powered by tldraw」署名亦在。
- **前置**:决定是否上自动更新;macOS 开发者账号 / Windows 证书。

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

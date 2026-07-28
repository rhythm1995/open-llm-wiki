# 延后与难点清单(Deferred)

> 这里集中归档**没有在本轮做、且不打算仓促塞空心 stub** 的能力。每条写明:**现状 / 难在哪 / 做扎实需要什么 / 前置**。难度标记:🔴 硬(算法或工程量)· 🟡 中 · 🟢 易(纯待办)。
>
> 与 [06-roadmap](./06-roadmap.md) 的关系:roadmap 的 Phase 2+ 表只给一句话状态;**真正"为什么难、要什么前置"的细节在这里**。roadmap 表已链接回本文。

---

## 🔴 图谱大图性能(>400 节点)

- **现状**:图谱是**纯 SVG 力导向**(自实现 Fruchterman–Reingold),全量节点渲染为 DOM,每帧 O(n²) 全对斥力 + 弹簧力计算。日常 vault(几十~两三百笔记)流畅。
- **难在哪**:节点数过 ~400 后,①布局收敛耗时(每帧 n² 力计算);②SVG 每节点一个 `<g>` DOM,大量节点拖累渲染与交互;③无视口剔除(屏外节点照样算力、照样画)。
- **做扎实需要**:
  - **视口剔除 + LOD**:屏外节点不画;缩放层级低时把簇合并成"超级节点"(聚类),放大再展开。
  - **渲染层换血**:SVG → Canvas 2D(甚至 WebGL),DOM 不再随节点数线性增长(代价:失去 CSS 样式与无障碍,需自实现 hit-testing)。
  - **增量/稳定布局**:初始一次性收敛后存坐标,新增节点局部增量重排,不每帧全量。
  - **Web Worker** 把力计算挪出主线程。
- **前置**:先造一个 >400 / >1000 节点的 benchmark vault,测当前帧率与收敛时间基线,再决定换 Canvas 还是先做 LOD。

## 🟡 图谱右键菜单(context menu)

- **现状**:左键节点跳转、过滤面板齐全;无右键菜单。
- **难在哪**:不难,纯交互细节。需要统一 context menu 组件(Radix ContextMenu)+ 把"图谱节点"作为菜单触发对象。
- **做扎实需要**:右键节点 →「打开 / 在图谱中聚焦 N 跳 / 复制 `[[wikilink]]` / 隐藏此类型」。hit-testing 已有(左键跳转复用)。空场区右键 → 过滤面板快捷开关。

## 🔴 内联 `` ```qql `` 查询块渲染

- **现状**:QQL 全链路在纯内核(`qql::parse + query::eval`),有独立 QQL 面板;但笔记正文里的 ` ```qql … ``` ` 代码块**不会**在编辑器内实时求值渲染结果。
- **难在哪**:这是把"求值器"嵌进"编辑器"的编辑器装饰工程——①CodeMirror 6 Decoration 插件要识别 fenced ```` ```qql ```` 块并定位其行区间;②把该块文本喂给 `qql::parse + eval`(纯逻辑已有);③把结果(List/Table/Count/Groups)以**只读装饰**内联渲染到块下方;④块内编辑时防抖重算、处理语法错的降级显示;⑤阅读视图也要同样渲染(两套渲染路径要保持一致)。
- **做扎实需要**:一个 CodeMirror ViewportPlugin + decoration widget;求值走现有纯逻辑;只读结果 widget 复用 QueryPanel 的 ResultView。需处理大结果集的虚拟化。
- **前置**:确认 QQL 在 mock 浏览器模式下能求值(目前 mock 返回空——内联块在 mock 下也得能跑,否则 dev 不可见)。

## ✅ ~~saved query view 持久化~~(已落地)

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

- **现状**:可 `pnpm dev` / `cargo build` 跑,未产出分发安装包。
- **难在哪**:流程性而非算法难。Tauri 2 bundler + macOS 公证(notarization)+ 代码签名(需开发者账号证书)+ 图标 + 各平台安装包格式(dmg / msi / AppImage / deb)+ 可选自动更新(Updater + 签名 manifest)。Windows 的代码签名门槛尤其需要证书。
- **做扎实需要**:CI(GitHub Actions)矩阵构建 + 签名密钥管理 + 公证流程脚本化 + tldraw 许可合规在分发物里的体现(LICENSE 随包、归属可见)。
- **前置**:决定是否上自动更新(影响签名 manifest 设计);macOS 开发者账号 / Windows 证书。

## 🟢 标签循环快捷键(Ctrl+Tab / ⌘Shift+[ ] 等)

- **现状**:已实现 ⌘W 关闭当前标签;**循环切换未做**。
- **难在哪**:不难,但**浏览器 dev 抢占**——Ctrl+Tab / ⌘Shift+[ / ⌘Shift+] 在浏览器里都被浏览器自身抢占,`preventDefault` 无效;仅在 Tauri 桌面 webview 里可用。
- **做扎实需要**:确认 Tauri webview 不抢占这些组合键 + 提供可配置键位(避免与各 OS 默认冲突);或改用不冲突的组合(如 ⌘PageUp/⌘PageDown)。
- **前置**:在 Tauri 桌面构建里验证键位可用性(dev 模式验证不了)。

## ✅ ~~恢复上次打开的笔记~~(已落地)

- **已实现**(commit `146c357`):打开 vault 时优先恢复上次看的笔记,而不是总跳到首个 `.md`。
  按 vault root 分键存(`openobs.lastPath:<root>`)。恢复决策放在 `openVault`(有 entries + 回退
  路径,语义最干净,避免 App 侧"默认选择 vs 用户选择"无法区分的死结);命中且仍存在才恢复,
  否则回退首个 `.md`。纯逻辑 `last-note.ts`(6 单测)。

## 🔴 完整 MCP server(F-AI 写侧)

- **现状**:读侧"复制为 AI 上下文"已落地(当前笔记 + 邻居正文拼成 LLM 友好 markdown 入剪贴板)。
- **难在哪**:完整 MCP server 是让 **agent 反向读写 vault** 的独立工程——stdio / HTTP 的 JSON-RPC、tools 注册(read_note / write_note / search / query / list)、资源订阅、**权限模型**(哪个 client 可写)、并发写冲突。
- **做扎实需要**:复用 `openobs-core` 的纯逻辑;定 server 传输与 tools 表面;权限白名单;不在此仓促做空心 stub。

# 06 — 路线图

## 关于"一次性实现全部"的诚实声明

"全部 Obsidian 功能"是一个团队多年的工作量。本项目**完整设计了全部功能**([04-features](./04-features.md)),但**实现按阶段交付**——每个阶段都是一个可独立使用、可发布的里程碑。这不是缩水,是对现实和 TDD 节奏的尊重:先立地基(纯逻辑、全测试),再长 UI,最后是高级能力。

## 阶段

### Phase 0 — 设计 + 地基 + 第一片绿 ✅(本次)

- 完整设计文档(`docs/`,七份)。
- 项目骨架:workspace、LICENSE(MIT)、Rust core crate、前端 manifest、测试基建(cargo test / Vitest / mock 层;⏳ Playwright 待引入)。
- **第一个 TDD 切片**:`core::parse`——markdown + frontmatter + wikilink 解析,红绿实现,全测试。这是图谱和查询的共同地基。
- 产出:一个 `cargo test` 全绿、有据可查的地基。

### Phase 1 — core 内核(纯逻辑,周级)✅(本次完成)

全在 Rust,全 TDD:
- ✅ `core::parse` — markdown + frontmatter + wikilink 分词(零依赖,忽略代码块/行内代码)。
- ✅ `core::index` — enriched `Note`(frontmatter→`BTreeMap`、关系边、frontmatter+正文标签、软类型)。
- ✅ `core::graph` — 关系图(**正文 wikilink + frontmatter 关系合流**为统一边,共享 resolve / 反向链接 / 悬空检测)。
- ✅ `core::query` — QQL **求值器**(Predicate + Order + Limit + Select,纯结构;文本解析层待 P2 语法定后接)。
- ✅ `core::search` — 倒排全文检索(标题×2 加权,AND 语义,unicode 分词)。
- ✅ `core::vault` — 顶层纯索引器 `VaultIndex::build(Vec<(path,content)>)`,串起全链路。
- ✅ `examples/demo.rs` — 端到端二进制(自带样例 + 可索引真实目录),证明全链路可跑。
- ✅ proptest 属性测试(解析器防 panic + 不变量)。
- ✅ 98 tests / clippy --all-targets clean / fmt clean。

> OpenObsidian 的"大脑"已存在并可独立验证——`cargo run --example demo` 即可看全链路。未来 MCP server / CLI 直接复用 `openobs-core`。

### Phase 2 — 最小可用 UI ✅(本次完成)

Tauri 2 外壳 + React 19:
- ✅ F-VAULT(打开目录、`walkdir` 扫描)、F-FILETREE(折叠树 + 当前笔记高亮)。
- ✅ F-EDITOR(CodeMirror 6 markdown,自动保存防抖)。
- ✅ F-WIKILINK(反向链接面板:wiki + frontmatter 关系双向入边)。
- ✅ mock-tauri 浏览器层(`ui/src/lib/mock.ts`),`pnpm --dir ui dev` 即开即用。
- 评估:BlockNote 所见即所得编辑器延后到 v2(纯 Markdown round-trip 更稳、体积更小;见 [open-questions](./open-questions.md))。

### Phase 3 — 图谱(差异化 #1)✅(本次完成)

- ✅ F-GRAPH:**纯 SVG 力导向**(无 d3/react-force-graph 依赖,独立编写 Fruchterman–Reingold)。
- 节点按软类型着色、按连接度变大小;wiki/relation 边区分;悬空链接短桩;当前节点高亮;点击跳转。
- ✅ **过滤面板**(核心竞争力):按 type / tag / relation 显隐、隐藏孤儿、聚焦当前笔记 N 跳邻域(纯逻辑 `graph-filter.ts`,已测)。
- ✅ **平移缩放**:滚轮缩放(以光标为中心)、拖拽平移、按钮缩放/重置。
- 待打磨:大图性能优化 >400 节点(LOD/聚类、Canvas/WebGL、Web Worker);右键菜单已落地(见 Phase 5+ 续四)。

### Phase 4 — 实时聚合(差异化 #2)✅(本次完成)

- ✅ F-QUERY:**QQL 文本查询面板**(`WHERE … SORT … SHOW … RENDER …`),core `qql::parse + query::eval` 求值,结果按 List/Table/Count/Groups/Sum 形态渲染、点击跳转。
- ✅ 统一字段模型 + 比较运算符(`==/!=/>/>=/</<=`)+ `.len()` 度数访问器 + 聚合渲染(`count/list/group_by(field)/sum(field)`)+ `AS` 列别名。
- ✅ qql 文本解析层(Phase 1 只建了求值器,本轮按"DQL 风格语法"补全文本层)。
- 待打磨:内联 ```qql 查询块渲染、saved view 持久化面板。

### Phase 5 — v1 收口(基本完成)

- ✅ F-TYPE(软类型徽标)、F-SEARCH(全文 AND 检索)、F-PALETTE(⌘K 命令面板)、深色主题(Catppuccin 取向)。
- ✅ F-PROPERTIES(frontmatter **可视化编辑**:行级最小侵入、按需加引号、多行序列收内联;纯逻辑 `frontmatter.ts`,已测)。
- ✅ F-STATUS(`status:` 彩色 chip,按词根模糊映射 Active/Done/Contested/Superseded…)。
- ✅ F-TABS(多标签编辑器:纯 `tabReduce` 状态机 open/close/activate/closeOthers/closeAll/reorder,已测)。
- ✅ F-WIKILINK 完整三件套:解析 + 反向链接 + **Cmd/Ctrl 点击 `[[link]]` 跳转** + **`[[` 自动补全**(纯逻辑 `wikilink.ts`,已测)。
- ✅ F-FILETREE:折叠树 + 新建 + 重命名 + 删除。
- ✅ 打包与分发 **CI 骨架**:`tauri.conf.json` bundle 配置完整;本地 `tauri build` 已出 `.app`/`.dmg`(运行时 diag_log 0 webview 报错);`.github/workflows/ci.yml`(测试)+ `release.yml`(tag/手动 → macOS/Linux/Windows 矩阵起草 Release)。默认未签名,配 secret 即签名/公证/Updater(详见 [deferred](./deferred.md)「打包与分发」)。
- **v1 尚未发布;MVP 可运行(可出安装包,签名/公证待用户凭证)。**

### Phase 5+ — v2 增量(本次会话,v1 范围之外)✅

在 v1 边界之外继续「尽可能完整」地开发,每个特性都遵循 TDD(纯逻辑先行 + 单测):

- ✅ **F-TRASH** 回收站:删除即改名移入 `.trash/`(保留目录结构与内容),可逐篇还原、彻底删除或一键清空。后端 `list_trash` + 点目录剪枝(隐藏 `.trash`/`.obsidian`);纯逻辑 `trash.ts`(碰撞解析)。
  - ⚠️ **后已替换**:本特性的 `.trash/` 机制已在「Phase 5+ 续四」被 **archive-via-git**(删除/还原全走 git)取代;`trash.ts` / `index_trash` / `list_trash` 已删。
- ✅ **F-TEMPLATES** 模板:`templates/` 下 .md 为模板,新建笔记选模板并做 `{{title}}`/`{{date}}` 替换;NewNoteDialog 取代 prompt。纯逻辑 `template.ts`。
- ✅ **F-THEMES** 浅色主题:Catppuccin Latte 变体 + 工具栏切换 + localStorage 持久化;CodeMirror 经 Compartment 随主题切换不重建。纯逻辑 `theme.ts`。
- ✅ **F-TABS** 拖拽重排:reducer 的 reorder 此前已测,本轮接 HTML5 DnD。
- ✅ **F-OUTLINE** 大纲面板:Inspector 第三 tab,提取标题(忽略代码块/frontmatter),点击滚动编辑器到行。纯逻辑 `outline.ts`;Editor 暴露 `scrollToLine` 命令式句柄。
- ✅ **F-READING** 阅读视图:编辑/阅读切换,marked 渲染,`[[wikilink]]` 可点击跟随。纯逻辑 `render.ts`。
- ✅ **mock 检索**:浏览器 dev 的 search 接入极简 AND 检索(标题×2 加权),让 `vite dev` 演示完整可用。纯逻辑 `mock-search.ts`。
- ✅ 杂项:⌘S 立即保存。

### Phase 5+ 续(本会话,v1 范围之外)✅

继续推进原列在 Phase 2+ 的大件中**可在一个会话内做扎实**的三项 + 一项安全加固:

- ✅ **F-READING 安全加固**:阅读视图的 marked HTML 在注入 DOM 前统一经 `sanitize()`(DOMPurify)清洗——剥离 `<script>` / 内联 `on*` / `javascript:` 等,同时把点击委托依赖的 `data-target`/`class` 加入白名单。即使用户 vault 混入他人提供的恶意 md,也不会执行任意脚本。`render.ts` 新增 `sanitize()` 纯包装;`renderMarkdown` 保持无 DOM(可 node 单测),清洗在 DOM 侧(ReadingView + jsdom 测试)。新增 `render.sanitize.test.ts`(5 项)。
- ✅ **F-GIT**:`git status` 变更清单 + `git log` 最近提交 + "提交全部改动"(`git add -A && git commit`)面板。命令走 `std::process::Command` 调系统 `git`(`current_dir` 设到 vault),**仅返回 git 原始 stdout**,解析是前端纯逻辑 `git-parse.ts`(20 项单测 + 一次真实 git round-trip 验证)。**仅在 Tauri 桌面 app 打开真正的 git 仓库时生效**;mock 模式下 git 不可用(面板提示)。`MainView` 增 `"git"` + Toolbar/Palette 入口。
- ✅ **F-AI(读侧桥接)**:Inspector 顶部的"复制为 AI 上下文"——把当前笔记 + 其外向链接命中的邻居正文拼成一段 LLM 友好的 markdown 写入剪贴板,便于粘贴给任意 LLM。纯逻辑 `ai-context.ts`(5 项单测);mock 下同样可用(内存 Map)。**这是 AI-native 的读侧桥接,不是完整 MCP server**——后者让 agent 反向读写 vault,是独立工程(见下)。
- ✅ **F-L10N(基础 + 顶层 chrome)**:i18n 基础设施——`i18n.ts` 字典 + `translate` + `{name}` 插值(10 项单测,含 zh/en 键集一致性校验)+ `useLocale` hook(localStorage 持久化,与 `useTheme` 同构)。已迁移**顶层 chrome**:Toolbar(含语言切换 Globe 按钮)/ StatusBar / CommandPalette / Inspector(tab + 空状态 + 属性编辑器)/ 阅读视图空状态。zh(默认)+ en 两语。

  **诚实范围(已补完)**:深层面板(GitPanel / QueryPanel / SearchPanel / TrashPanel / Sidebar / NewNoteDialog / Editor 空状态、TabBar、GraphView 全量含过滤面板)的字符串已全部迁移到 `t()` 体系,zh/en 双语覆盖,i18n 键集一致性有单测守护。仅 Toolbar 的语言切换指示符(`中`/`EN`,刻意显示对方语言)与各文件的中文 doc 注释保持原样。

### Phase 5+ 续三(本会话,v1 范围之外)✅ → 画布已换引擎

- ✅ **F-CANVAS(初版 tldraw → 现 Excalidraw MIT)**:无限画布;`.canvas` 文件即真相。
  - **现引擎**:`@excalidraw/excalidraw`(MIT)。磁盘 schema:`{ openobsidianCanvas:1, engine:"excalidraw", elements, appState, files }`(`canvas.ts` 纯逻辑 + 单测)。
  - **懒加载**:`CanvasView` 独立 chunk;App `key={path}` 防载入回写回环。
  - **旧 tldraw 文件**:识别为 legacy 只读提示,不自动迁移。
  - **索引隔离**:`build_index` 只取 `.md`;`list_vault` 放行 `.canvas`。
  - 历史 tldraw 实现与「非商用许可隔离」叙述见 git 历史;`THIRD_PARTY_NOTICES` 以 Excalidraw 为准。

### Phase 5+ 续四(本会话,v1 范围之外)✅

三项收口 + 一项验证加固,均循 TDD(纯逻辑先行 + 单测,IO 薄壳在后):

- ✅ **archive-via-git(取代 F-TRASH)**:删掉 `.trash/` 平行机制,删除/还原**全走 git**,唯一真相源。提交策略「结构自动 + 内容手动」——创建/删除/重命名自动 `git commit`(`git_commit_paths` **只暂存并提交给定路径**,未暂存的正文编辑绝不卷入,保 commit 卫生);正文编辑仍由 GitPanel 手动提交。后端命令 `git_is_repo` / `git_deleted_notes`(历史已删 `.md`,带 commit+date)/ `git_restore_note`(`git checkout <hash>^ -- <path>`)/ `git_init`;前端 `ArchiveView`(非 git 空态 +「初始化 git」/ 已删列表 + 还原 + 最近提交时间线)。**Rust 集成测试**(`git_tests`,真实 round-trip 过系统 git):is_repo、选择性提交(commit 卫生不变量)、删除→列出→还原。`trash.ts` 已删。
- ✅ **关系图重做(做到完美)**:布局纯逻辑抽出 `graph-layout.ts`(seedNodes + relaxLayout[FR:全对斥力 + 边弹簧 + 向心 + 温度降温,Float64Array 热循环] + bbox + fitTransform,15 单测);GraphView 重写——撑满容器(ResizeObserver 真实尺寸)、位置 Map 跨帧持久(增量播种 + 暖启动,过滤/索引刷新时已有节点不乱跳)、结构签名 gate 重排、自动 fit、悬停邻域高亮、节点拖拽、以光标为中心缩放、平移、fit、按度数 top-K 截断(默认上限 ~400)、随缩放变边透明度、暗角 + 当前节点辉光、标签按缩放/度数/悬停门控(paintOrder 描边光晕)。右键菜单(自实现 ContextMenu:聚焦 1 跳 / 复制 wikilink / 隐藏类型)随重做落地。
- ✅ **编辑器优化(参考 Tolaria,第三栏)**:CodeMirror 正文改无衬线(Inter)+ 可读行宽(居中 ≤760px);新增「半所见即所得」行装饰 ViewPlugin(`markdownLineDecorations`,仅可见视口:`#{1,6}` → cm-md-h* 按级放大、`>` → cm-md-quote;只动呈现不改文本,光标/历史无感);深色主题在 oneDark 上叠加应用底色令牌消除色缝。
- ✅ **验证加固**:全绿——core 99 + app-lib 7(4 preview + 3 git 集成)+ UI 237(22 文件);tsc clean;UI 构建重嵌 app + 运行时 diag_log 0 `[webview]` 报错。

### Phase 5+ 续五(本会话,v1 范围之外)✅

清掉原列在打磨项里的三件中小件,均循 TDD(纯逻辑先行 + 单测):

- ✅ **标签循环快捷键**:`tabReduce` 加 `cycle` 动作(环回到首/尾)+ 6 单测;`store.cycleTab(dir)` 切换并读盘;App 全局 keydown 挂 Ctrl+Tab / Ctrl+Shift+Tab / ⌘/Ctrl+Shift+[ ] / ⌘/Ctrl+PageUp/Down。浏览器 dev 抢占 Ctrl+Tab(已知),桌面 webview 可用。
- ✅ **内联 ```qql 查询块渲染**:正文 ```qql 块在编辑器内实时求值,只读块级 widget 渲染结果在块下方;阅读视图同样求值渲染。纯逻辑 `qql-block.ts`(`findQqlBlocks` + `resultToHtml`,**两路共用渲染器**,17 单测);CM `qql-widget.ts`(StateField + ViewPlugin 块级 widget + 防抖 400ms 重算 + 错误降级)。**mock 限制**:QQL 求值未移植到 TS,dev 下显示「无结果」,真机走 Rust core。
- ✅ **图谱视口剔除**:`visibleNodeIds` 纯函数(graph→屏幕坐标判定)+ 6 单测;GraphView 节点数 > 200 时屏外节点/边不画,降 SVG DOM 量(80px 留白减 pop-in)。LOD 聚类 / Canvas/WebGL / Worker 仍是独立大件(见 deferred)。
- ✅ **验证加固**:全绿——UI **265 单测**(23 文件,本轮 +28:tabs 6 / graph-layout 6 / qql-block 17 - 重计偏差 1);tsc clean;构建重嵌 app + 运行时 diag_log 0 `[webview]` 报错。

### Phase 2+ 能力(v2/v3,不阻塞 v1)—— 与诚实取舍

> 延后项的**难点拆解与前置条件**统一在 [deferred.md](./deferred.md)(每条写明"难在哪 / 做扎实需要什么")。下表只给一句话状态。

| 能力 | 状态 | 说明 |
|---|---|---|
| F-GIT | ✅ 本会话 | 见上。 |
| F-AI(+MCP) | 🟡 部分 | 读侧"复制 AI 上下文"已落地;完整 MCP server 是独立工程(见 [deferred](./deferred.md)「完整 MCP server」),不在此仓促做空心 stub。 |
| F-L10N | ✅ 完整 | 基础设施 + 顶层 chrome + 全部深层面板(本会话补完)已落地(zh/en)。 |
| F-CANVAS(Excalidraw) | ✅ | MIT 画布;旧 tldraw 只读兼容(见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md))。 |
| F-SHEET(ironcalc) | ⏳ 延后 | npm 仅发 wasm 引擎、无 React UI(见 [deferred](./deferred.md)「F-SHEET」)。 |
| F-PLUGIN | ⏳ 延后 | 见 [deferred](./deferred.md)「F-PLUGIN」。 |
| BlockNote 双模 | ✅ 部分 | WYSIWYG 已落地;无损 round-trip 子集仍见 [deferred](./deferred.md)。 |
| 图谱大图(WebGL/LOD/Worker) | ✅ 功能齐 | Barnes-Hut + Worker + sigma + LOD 边/飞入 + WebGL 拖拽框选;真机帧率门禁仍见 deferred。 |
| Live 索引 + ⌘F/⌘P | ✅ | 路径级 delta;无搜索视图;FindBar + quick open。 |
| 打包与分发 | ✅ CI 骨架 / 🟡 签名待凭证 | 骨架见上(Phase 5 行);签名/公证/Updater 见 [deferred.md](./deferred.md)「打包与分发」(gated 在用户凭证)。 |
| saved query view / 恢复上次笔记 | ✅ 本轮 | 已落地(见 [deferred](./deferred.md) 顶部两条 ✅):QQL 存成自举 `type:Query` 笔记;打开 vault 恢复上次看的笔记。 |

**原则**:宁可诚实延后并写明"需要什么才能做扎实",也不仓促塞进空心 stub 制造"看起来有"的假象——后者才是真正留坑。已完成的三项(F-GIT / F-AI 读侧 / F-L10N)都遵循 TDD:纯逻辑先行 + 单测,IO 薄壳在后。

## 本次会话的明确产出(可验证)

1. `docs/` 六份完整设计文档。✅(首轮)
2. 项目骨架 + MIT LICENSE + 测试基建。✅(首轮)
3. `core` 内核全量 TDD 实现(parse/index/graph/query/qql/search/vault)+ demo 二进制 + proptest。✅
   - 98 tests / clippy --all-targets clean / fmt clean。
   - `cargo run -p openobs-core --example demo` 端到端可跑。
4. Tauri 2 桌面壳(`app/src-tauri`,10 个命令,包 `openobs-core`)。✅(本轮)
   - `cargo build -p openobs-app` / clippy clean。
5. React 19 前端(`ui/`):三栏布局 + 图谱(过滤/缩放)+ QQL(聚合)+ 搜索 + 命令面板 + 多标签 + 属性编辑 + 状态 chip + wikilink 跳转/补全 + 浏览器 mock。✅(本轮)
   - `pnpm --dir ui build` 通过;tsc --noEmit clean;**114 项 vitest 单测**(frontmatter / graph-filter / tabs / wikilink / trash / template / theme / outline / mock-search / render 纯逻辑)。
6. Phase 5+ v2 增量(F-TRASH / F-TEMPLATES / F-THEMES / F-TABS 拖拽 / F-OUTLINE / F-READING / mock 检索 / ⌘S)。✅(本次会话)

后续每次推进一个 Phase,都先扩 `core` 测试、再长 UI、再 e2e 兜底。

# 06 — 路线图

## 关于"一次性实现全部"的诚实声明

"全部 Obsidian 功能"是一个团队多年的工作量。本项目**完整设计了全部功能**([04-features](./04-features.md)),但**实现按阶段交付**——每个阶段都是一个可独立使用、可发布的里程碑。这不是缩水,是对现实和 TDD 节奏的尊重:先立地基(纯逻辑、全测试),再长 UI,最后是高级能力。

## 阶段

### Phase 0 — 设计 + 地基 + 第一片绿 ✅(本次)

- 完整设计文档(`docs/`,七份)。
- 项目骨架:workspace、LICENSE(MIT)、Rust core crate、前端 manifest、测试基建(cargo test / Vitest / Playwright / mock-tauri)。
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
- 待打磨:大图性能优化 >400 节点(LOD/聚类)、右键菜单。

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
- ⏳ 未做:打包(macOS/Win/Linux)。
- **v1 尚未发布;MVP 可运行。**

### Phase 5+ — v2 增量(本次会话,v1 范围之外)✅

在 v1 边界之外继续「尽可能完整」地开发,每个特性都遵循 TDD(纯逻辑先行 + 单测):

- ✅ **F-TRASH** 回收站:删除即改名移入 `.trash/`(保留目录结构与内容),可逐篇还原、彻底删除或一键清空。后端 `list_trash` + 点目录剪枝(隐藏 `.trash`/`.obsidian`);纯逻辑 `trash.ts`(碰撞解析)。
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

  **诚实范围**:深层面板(GitPanel / QueryPanel / SearchPanel / TrashPanel / Sidebar / NewNoteDialog / Editor 空状态)的字符串仍为中文,沿用同一 `t()` 模式逐步迁移——基础设施已就位,迁移是机械工作,留待后续。

### Phase 2+ 能力(v2/v3,不阻塞 v1)—— 与诚实取舍

| 能力 | 状态 | 说明 |
|---|---|---|
| F-GIT | ✅ 本会话 | 见上。 |
| F-AI(+MCP) | 🟡 部分 | 读侧"复制 AI 上下文"已落地;**完整 MCP server**(让 agent 反向读写 vault:stdio/HTTP JSON-RPC、tools 注册、权限模型)是独立工程,不在此仓促做空心 stub。 |
| F-L10N | 🟡 基础 | 基础设施 + 顶层 chrome 已落地(zh/en);深层面板字符串待迁移,模式已定。 |
| F-CANVAS(tldraw) | ⏳ 延后 | 重依赖(tldraw)+ 新持久化格式(`.canvas`?sidecar?)+ 新视图模式 + 与现有图谱/笔记的关系。空心"一块空白画布"无价值,需单独成会话先定持久化与交互。 |
| F-SHEET(ironcalc) | ⏳ 延后 | 同类:重依赖 + 嵌入式表格的持久化与单元格寻址。 |
| F-PLUGIN | ⏳ 延后 | 需先设计插件 API 表面 + 沙箱 + 生命周期 + 分发。"插件系统"空心注册器是反价值的占位。 |
| BlockNote 富文本 | ⏳ 延后 | 与 CodeMirror 的双模 + **Markdown round-trip**(富文本↔纯文本无损)是已知难点;F-READING 已覆盖"看渲染结果",边际价值有限。按 [open-questions](./open-questions.md) 的既有判断保持 v2。 |

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

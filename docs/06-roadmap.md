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

### Phase 2+ 能力(v2/v3,不阻塞 v1)

F-TEMPLATES、F-THEMES、F-GIT、F-TRASH、F-AI(+MCP)、F-L10N → F-CANVAS(tldraw)、F-SHEET(ironcalc)、F-PLUGIN、BlockNote 富文本编辑。

## 本次会话的明确产出(可验证)

1. `docs/` 六份完整设计文档。✅(首轮)
2. 项目骨架 + MIT LICENSE + 测试基建。✅(首轮)
3. `core` 内核全量 TDD 实现(parse/index/graph/query/qql/search/vault)+ demo 二进制 + proptest。✅
   - 98 tests / clippy --all-targets clean / fmt clean。
   - `cargo run -p openobs-core --example demo` 端到端可跑。
4. Tauri 2 桌面壳(`app/src-tauri`,10 个命令,包 `openobs-core`)。✅(本轮)
   - `cargo build -p openobs-app` / clippy clean。
5. React 19 前端(`ui/`):三栏布局 + 图谱(过滤/缩放)+ QQL(聚合)+ 搜索 + 命令面板 + 多标签 + 属性编辑 + 状态 chip + wikilink 跳转/补全 + 浏览器 mock。✅(本轮)
   - `pnpm --dir ui build` 通过;tsc --noEmit clean;**57 项 vitest 单测**(frontmatter / graph-filter / tabs / wikilink 纯逻辑)。

后续每次推进一个 Phase,都先扩 `core` 测试、再长 UI、再 e2e 兜底。

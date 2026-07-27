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
- ✅ 68 tests / clippy --all-targets clean / fmt clean。

> OpenObsidian 的"大脑"已存在并可独立验证——`cargo run --example demo` 即可看全链路。未来 MCP server / CLI 直接复用 `openobs-core`。

### Phase 2 — 最小可用 UI(周级)

Tauri 外壳 + React:
- F-VAULT(打开目录、扫描)、F-FILETREE、F-EDITOR(BlockNote)、F-WIKILINK(反向链接面板)、自动保存、mock-tauri 测试层。
- 此时可打开真 vault、编辑笔记、看反向链接。已比裸文件管理器有价值。

### Phase 3 — 图谱(差异化 #1,周级)

- F-GRAPH:react-force-graph-2d 集成、过滤面板、实时更新。
- 这是"让别人愿意看一眼"的功能。

### Phase 4 — 实时聚合(差异化 #2,周级)

- F-QUERY:QQL 内联块渲染 + saved view 面板。
- 此刻 cairn 的 `wiki-health` 可作为一组 QQL live 面板跑起来。

### Phase 5 — v1 收口(周级)

- F-TYPE(软类型)、F-PROPERTIES、F-STATUS、F-PALETTE、F-TABS、F-SEARCH、深色主题。
- 打包(macOS/Win/Linux)、README、(公开前)**改名**。
- **v1 发布。**

### Phase 2+ 能力(v2/v3,不阻塞 v1)

F-TEMPLATES、F-THEMES、F-GIT、F-TRASH、F-AI(+MCP)、F-L10N → F-CANVAS(tldraw)、F-SHEET(ironcalc)、F-PLUGIN。

## 本次会话的明确产出(可验证)

1. `docs/` 七份完整设计文档。✅(首轮)
2. 项目骨架 + MIT LICENSE + 测试基建。✅(首轮)
3. `core` 内核全量 TDD 实现(parse/index/graph/query/search/vault)+ demo 二进制 + proptest。✅(本轮)
   - 68 tests / clippy --all-targets clean / fmt clean。
   - `cargo run -p openobs-core --example demo` 端到端可跑(内建样例 + 真实目录)。
4. Phase 2–5 的入口已就绪:大脑已存在、TDD 节奏建立、`openobs-core` 可被 MCP/CLI/UI 复用。

后续每次推进一个 Phase,都先扩 `core` 测试、再长 UI、再 e2e 兜底。

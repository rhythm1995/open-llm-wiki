# 画布与核心体系的隔离事实(Canvas Isolation)

> 2026-08-10 调研结论存档。目的:把「画布(.canvas / Excalidraw)与图谱 / QQL /
> wikilink / 搜索完全解耦」这一**刻意设计**显式记录,防止后续 agent 误以为画布是核心
> 组件而尝试「打通」,或在不了解隔离墙的情况下做依赖假设。本文只陈述代码事实,不改代码。

## 一句话结论

画布在 Open LLM Wiki 里是一个 **「独立的白板工具,只是恰好存在 vault 里」**。它和图谱 /
wikilink / QQL / 索引 / 全文搜索 **完全没打通**;这是代码里**显式的设计决策**,不是疏漏。

## 隔离墙的代码证据

### 1. 画布不进图谱索引

索引器只处理 `.md`,画布 JSON 完全不在 `entries` 里,因此无法成为图谱节点。

- `app/src-tauri/src/lib.rs` 的 walk 过滤只收扩展名 `md`;`.canvas` 既非 md 也非图片 → 被丢弃。
- `is_md_rel` 白名单(`lib.rs`)只接受 `md`,有测试 `assert!(!is_md_rel("x.canvas"))` 显式断言。
- `LiveVault.entries` 注释明言「canvas 不进 note index」。
- `core/src/vault.rs` 的 `VaultIndex::build` 把 entries 全部 enrich 成 `Note`,`Graph::build(notes)`
  消费 —— `Note` 只来自 markdown,无画布数据通路。
- mock 侧同样隔离(`ui/src/lib/mock.ts`):`.canvas` 不当作 markdown 解析,「避免把 JSON 误当
  frontmatter / wikilink 污染图谱」。
- 文档原话(`docs/06-roadmap.md`):「索引隔离:`build_index` 只取 `.md`;`list_vault` 放行 `.canvas`」。

→ 画布**不可能**成为图谱节点;`Graph::build` 的 `nodes: Vec<Note>` 里没有任何画布条目。

### 2. 画布内容里的 `[[wikilink]]` 不被解析

- 画布 schema 是 `{ openLlmWikiCanvas, engine, elements, appState, files }` 的 JSON(`ui/src/lib/canvas.ts`),
  文本以 `text` 元素的形式藏在 `elements` 数组里。
- wikilink 解析器 `extract_wikilinks`(`core/src/parse.rs`)只被两条路径调用:
  1. `parse_note` 的 body —— `parse_note` 只在 `VaultIndex::build` 里对 `entries`(只含 `.md`)调用;
  2. `relationship_links` 扫 frontmatter —— frontmatter 也只来自 `.md`。
- 整个 `core/src/` 里 `grep "canvas|excalidraw"` **零命中**:Rust 核心完全不知道画布的存在。

→ 画布里画一个写着 `[[Alpha]]` 的文字框,既不会让画布指向 Alpha,也不会让 Alpha 的反链里出现这个画布。

### 3. 画布不可被全文搜索

- `search_notes` 走 `VaultIndex::search` → `SearchIndex::search`(`core/src/search.rs`)。
- `SearchIndex::build` 只遍历 `notes: &[Note]` 的 `title` 和 `body` 建倒排索引。
- 画布不进 `notes` → 画布里任何文字都进不了倒排索引。
- `docs/10-menus-and-search.md`:「canvas/sheet 上 ⌘F 仍应 no-op 或提示」。

### 4. 画布不出现于 QQL

- QQL 求值链:`VaultIndex::query(q)` → `eval_query(self.notes(), &self.graph, q)`,完全基于
  `self.notes()`(即 `graph.nodes: Vec<Note>`)。
- `core/src/qql.rs` 通篇操作 `&[Note]`,没有别的数据源。
- 画布不在 `notes` 里 → QQL `WHERE / SHOW / RENDER group_by` 任何形态都查不到画布。

## 唯一的接触面(很浅)

画布与核心体系的唯一交集,只在两处「让画布可被看见 / 可被打开」:

1. **文件树可见**:`list_vault`(`app/src-tauri/src/lib.rs`)为了让前端能显示并打开画布,对 `.canvas`
   做了白名单;但注释同时刻意声明「画布 JSON 不会被当作 markdown 解析」。
2. **watcher 事件触发**:`path_should_emit` 对 `.md` 和 `.canvas` 的变更都 emit `vault-changed`;
   但事件到达后,只有 `.md` 走 `live_note_upsert`(内部 `is_md_rel` 守卫),画布 delta 不会进 `entries`
   或 `index`。

这两处只让画布在 vault 里可被看见/打开,**没有任何一处把画布内容喂给图谱 / 索引 / 搜索 / QQL**。

## Sheet(.sheet)同构,且更边缘

- `.sheet` 与 `.canvas` 同样不进索引;路由策略相同(独立 view)。
- `.sheet` 甚至不进 `list_vault` 白名单 → 连文件树都不显示,只在笔记内通过 ```` ```sheet ```` 围栏被引用。
- Sheet 与笔记的唯一接触面是内联嵌入;画布连这个都没有。

## 为什么隔离是刻意的(不是待修的缺口)

- **JSON 污染图谱**:Excalidraw 的 elements 是结构化 JSON,若被 frontmatter / wikilink 解析器扫描,
  会把 JSON 里的键名、属性值误当 wikilink / tag,产生大量噪声边和虚假节点。代码多处注释明确此理由。
- **画布的定位**:它是「自由手绘思考的白板」,不是结构化知识。Open LLM Wiki 的核心价值主张是
  「图谱可视化 + QQL 实时聚合 + wikilink 知识网络」;画布解决的是另一类问题(随便画画、脑图),
  任何白板工具(Excalidraw 本身、tldraw、Miro……)都能做,不依赖本 app 的图谱/QQL 体系。
- 优先级:docs/04 明确标 F-CANVAS 为 **P3**(非核心);P0–P2 是图谱 / QQL / 索引。

## UI 入口决策(2026-08-10)

鉴于画布与核心体系零交集、定位为孤立白板,「新建画布」入口默认**隐藏**:
- CenterToolbar 表头按钮移除;命令面板 `new-canvas` 不注册;桌面 File 菜单不挂。
- **底层全保留**:`CanvasView` / `canvas.ts` / `store.createCanvas` / `isCanvasPath` 路由 / Excalidraw 依赖 /
  `THIRD_PARTY_NOTICES` 登记 / `canvas.*` i18n 键全部保留。
- 已存在的 `.canvas` 文件仍可在文件树点击打开、用 Excalidraw 编辑、防抖落盘、重开恢复。
- 隐藏入口而非删功能:保留恢复路径(改 gate 常量 / 取消注释即可),且零功能断裂风险。

## 若未来要让画布「打通」核心体系

这是一条**新的工程线**,当前代码没有任何萌芽。需要做的:

1. 在 `load_live_from_disk` / `is_md_rel` 之外为 `.canvas` 增设解析通路,把 Excalidraw elements 里
   的 `text` 元素抽出来喂给 `extract_wikilinks`。
2. 让画布作为 `Note`(或新的 `CanvasNode`)进入 `Graph::build`。
3. 让搜索 / QQL 的 `&[Note]` 数据源包含画布条目。
4. 重新评估「JSON 污染图谱」风险 —— 可能需要按元素类型 / 图层过滤,而非全量喂给解析器。

**触发条件**:除非出现明确的「画布内容需要出现在图谱/搜索/QQL 里」的产品诉求,否则维持隔离。

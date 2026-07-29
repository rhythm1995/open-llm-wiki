# 02 — 架构

## 技术栈

> 下表为**实际落地**的依赖(以 `ui/package.json` + `core/Cargo.toml` 为准)。02 初版曾计划
> Mantine / BlockNote / react-force-graph-2d,落地时为减依赖体积与 round-trip 风险做了务实调整
> (见文末「为何与初版设计不同」);未落地的演进目标标 ⏳。

| 层 | 实际选型 | 为什么 |
|---|---|---|
| 桌面外壳 | **Tauri 2.5+**(`@tauri-apps/api`/`cli`/`plugin-dialog`) | 比 Electron 轻 10x+,Rust 后端,原生文件/性能。Obsidian 用 Electron;用 Tauri 是结构性差异。 |
| 后端 / 核心 | **Rust**(`openobs-core` crate) | 性能关键路径(解析、图谱、查询)放这。纯逻辑、IO-free、全测试,TDD 心脏。 |
| 前端 | **React 19.1 + TypeScript 5.9 + Vite 7** | 生态成熟、类型安全。 |
| 样式 | **Tailwind CSS 4**(`@tailwindcss/vite`)+ 语义令牌 | 原子化样式;主题靠 `@theme` 的 CSS 变量切换,组件只引用令牌。 |
| UI 组件 | **少量 Radix**(dialog / dropdown-menu / tabs / tooltip)+ **shadcn 模式**(cva/clsx/tailwind-merge)+ **Phosphor icons** | 无障碍的交互组件用 Radix;展示型组件自实现,降依赖体积。 |
| 编辑器 | **CodeMirror 6**(单轨,markdown 源码) | round-trip 最稳、体积小;ReadingView(marked + DOMPurify)覆盖「看渲染结果」。⏳ BlockNote 富文本延后(见 [deferred](./deferred.md))。 |
| 图谱渲染 | **自绘 SVG 力导向**(Fruchterman–Reingold,纯 `graph-layout.ts`,无 d3) | 零依赖、可单测、中小图流畅;⏳ WebGL/Canvas/LOD 为大图演进目标(见 [deferred](./deferred.md))。 |
| 阅读渲染 | **marked 18 + DOMPurify 3** | Markdown → HTML + sanitize;F-READING 安全加固。 |
| Canvas | **tldraw 5.2**(source-available,非商用) | Obsidian Canvas 对等;唯一非 MIT 依赖,隔离在懒加载 chunk,可一键移除(见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md))。 |
| 包管理 | **pnpm**(workspace monorepo) | 快、磁盘高效。 |
| 测试 | **cargo test**(Rust)+ **Vitest 4**(TS) + **Playwright**(e2e) | 单元(cargo + Vitest node 纯逻辑)+ @testing-library/jsdom 组件测试 + Playwright e2e(mock 模式 smoke,见 [05-tdd-strategy](./05-tdd-strategy.md))。 |

> 选型原则:依赖只选成熟、MIT/Apache 许可、活跃维护的库(tldraw 是唯一记录在案的非商用边界,且可彻底移除)。完整清单与许可见仓库根 [README](../README.md) 与 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

## 仓库布局(Cargo workspace + 前端)

```
OpenObsidian/
├── Cargo.toml            ← workspace 根:members = [core, app/src-tauri]
├── core/                 ← Rust crate:纯逻辑(解析/图谱/查询/检索),IO-free,TDD 心脏
│   └── src/{lib,parse,index,graph,qql,query,search,vault}.rs
├── app/src-tauri/        ← Tauri 2 外壳(Rust):20 个命令 + run_git 子进程 + notify 监听,薄包装 core
│   ├── src/{lib,main}.rs
│   ├── tauri.conf.json   ← bundle 配置(含 resources: LICENSE 随包)
│   └── icons/
├── ui/                   ← React 前端(Vite)
│   └── src/
│       ├── components/   ← Editor/ReadingView/GraphView/Nav/NoteListView/Inspector/QueryPanel...
│       ├── lib/          ← 与后端对称的纯逻辑(store/tabs/graph-layout/qql-block/wikilink/ipc/mock...)
│       └── *.test.ts     ← Vitest 纯逻辑测试(node 环境)
├── tools/                ← 生成式脚本(gen-benchmark-vault.mjs)
├── .github/workflows/    ← ci.yml(测试)+ release.yml(打包矩阵)
├── licenses/             ← tldraw-LICENSE.md(逐字留存,随包分发)
├── THIRD_PARTY_NOTICES.md
├── LICENSE               ← MIT
└── README.md
```

> 布局非标准处:`tauri.conf.json` 在 `app/src-tauri/` 而非仓库根 —— 故 `tauri` CLI 须从**仓库根**启动
> (递归发现该目录);`pnpm --dir ui exec tauri` 会把 CWD 切到 `ui/` 致发现失败(见 [README](../README.md) 开发节)。

## 分层与依赖方向(单向,无环)

```
        ┌──────────────────────────┐
        │   ui (React/TS)          │  仅依赖 IPC 契约(Tauri commands)
        └────────────┬─────────────┘
                     │ Tauri IPC (JSON over invoke)
        ┌────────────▼─────────────┐
        │   app/src-tauri (Rust)   │  薄层:文件 IO、git 子进程、命令包装、notify 文件监听
        └────────────┬─────────────┘
                     │ 直接依赖
        ┌────────────▼─────────────┐
        │   core (Rust, 纯逻辑)    │  解析 / 图谱 / 查询 —— 无 IO,无副作用,全测试
        └──────────────────────────┘
```

**关键约束:`core` 是纯函数库** —— 不碰文件系统、不碰网络、不碰时间。所有 IO 在 `app` 层(读文件成字节流,喂给 core;core 吐结果,app 写回)。这让 `core` 可被穷尽单测,也让未来 core 能被复用(MCP server、CLI、CI 检查、web demo)。

## 数据流(读路径)

```
磁盘 .md 文件
   │ (app 层:Tauri fs API + 递归扫描)
   ▼
原始字节 + 路径列表
   │ (core::parse:拆 frontmatter / body / 提链接)
   ▼
Note 对象数组  ──▶ core::graph ──▶ 关系图(邻接表)
   │                                │
   │                                ├──▶ ui/graph 渲染
   │ (core::query)                  └──▶ 反向链接
   ▼
查询结果(列表/表/计数) ──▶ ui/query 渲染
```

## 数据流(写路径)

```
ui 编辑器 ──(防抖)──▶ write_note ──▶ 写 .md 文件
                                         │
                                         ▼ (结构操作:建/删/改名后端自动 git 提交)
                                    git add+commit
                                         │
                                         ▼
                                  重调 index_vault → 全量重建快照 → 替换 UI 状态
```

写路径只动文件;索引永远是**文件的派生物**,从不反过来。这保证"文件即真相":即便索引全删,重扫即复原。

> **索引刷新有两条触发路径**(均为全量 rebuild,Rust 速度 + vault 规模可控兜住):
> 1. **前端主动** —— UI 内编辑(防抖 save)、结构操作(建/删/改名)、openVault、手动刷新,前端直接调 `index_vault`。
> 2. **notify watcher**(Tauri 桌面已落地) —— 外部工具改 `.md`/`.canvas` 时,后端 `notify` 监听 → debounce 350ms → emit `vault-changed` → 前端 `listen` → 节流 500ms 全量 refresh。mock/浏览器无 fs 不监听(种子静态,靠手动刷新)。
>
> 约束不变:"文件即真相、索引是派生物"。watcher 触发的也是全量 rebuild(非增量 diff),故即便 watcher 漏事件,主动 refresh 仍能自愈。

## IPC 契约(Tauri commands,实际 20 个 + 1 事件)

后端暴露给前端的命令(全部薄包装 `core` 或 `run_git` 子进程):

```rust
// 读
list_vault(root) -> Vec<VaultEntry>           // 递归列 .md(路径/标题/mtime/preview)
read_note(root, path) -> String               // 读正文(纯字节,前端解析)

// 写(结构操作后端自动 git 提交,见 F-GIT)
write_note / create_note / delete_note / rename_note(root, ...)

// 索引 + 查询(走 core::VaultIndex)
index_vault(root) -> VaultSnapshot            // 全量 build → 序列化(notes/graph/by_type/by_tag)
run_qql(root, qql) -> ResultSet               // qql::parse → query::eval,实时聚合
search_notes(root, query) -> Vec<SearchHit>   // search::SearchIndex,标题加权

// 对话框 + 诊断
pick_vault() -> String | null                 // 原生目录选择
diag_log(msg)                                 // webview → stderr 桥(运行时排错)

// git(run_git 子进程,无 git2 依赖;前端 git-parse.ts 解析 stdout)
git_status_raw / git_log_raw / git_commit     // GitPanel:状态/历史/手动提交正文
git_is_repo / git_deleted_notes / git_restore_note / git_init  // 归档并入 git:删除可还原

// 文件监听(Tauri 桌面;mock/浏览器 no-op)
watch_vault(root) / unwatch_vault()           // notify 监听 → debounce → emit "vault-changed"
```

> **事件订阅**:watcher 引入后端首个事件 `vault-changed`(notify 监听外部改动 → debounce emit)。前端
> `listen("vault-changed")` → 节流全量 `index_vault`。前端主动 refresh 与 watcher 事件殊途同归(都走全量
> rebuild)。`ResultSet` 形态:`List/Table/Count/Groups/Sum`。

## 性能策略

- **索引**:`VaultIndex::build` 全量 rebuild(Rust),日常百~千级笔记毫秒~秒级。⏳ 增量 watcher 是演进目标(目前靠全量 + 主动 refresh 兜住)。
- **图谱**:自绘 SVG,节点数 ≤ ~400 流畅(每节点一个 `<g>` DOM);已落地视口剔除(屏外节点不画)。⏳ >400/万级需 LOD + SVG→Canvas/WebGL(见 [deferred](./deferred.md),已有 benchmark vault 生成器 `tools/gen-benchmark-vault.mjs`)。
- **查询**:Rust 原生(`query::eval` 在不可变快照上),避免前端 JS 全量遍历。
- **编辑器**:CodeMirror 6 增量解析,大文件不卡;自动保存防抖。

## 为什么是这个架构(诚实取舍)

- **为何 Rust core 与 Tauri 分离**:把性能关键且高 bug 密度的逻辑(链接解析、图、查询)锁进纯函数库 = TDD 最划算的地方,且未来可复用(MCP/CLI)。代价:多一层 IPC 序列化。值。
- **为何不 Electron**:Tauri 二进制小、内存低,且 Rust 后端顺理成章。代价:生态比 Electron 小、平台 webview 差异要处理。对一个文件优先的 app,值。

### 为何与初版设计不同(02 原表的务实修正)

- **编辑器:CodeMirror 6 单轨,而非 BlockNote(主)+ CodeMirror(raw)**。初版计划 BlockNote 给 Notion 式块编辑,但 BlockNote 产出自有 JSON block 模型,与 Markdown 的 round-trip **有损**(嵌套列表/表格/对齐回不来)。在没造出差分测试集证明"无损"前,先用 CodeMirror 6 纯源码(round-trip 最稳、体积小),ReadingView(marked)覆盖"看渲染结果"。BlockNote 延后(见 [deferred](./deferred.md)「BlockNote」)。
- **UI 栈:Tailwind 4 直接 + 少量 Radix,而非 Mantine + Radix + shadcn 全套**。Mantine 的 reset/provider 与 Tailwind 有冲突风险,且引入大依赖;MVP 选择只用 Radix 的无障碍交互组件(dialog/dropdown/tabs/tooltip)+ shadcn 的 `cva/clsx/tailwind-merge` 工具,展示型组件自实现。降依赖体积,tldraw 等差异点才是花力气的地方。
- **图谱:自绘 SVG,而非 react-force-graph-2d(WebGL)**。零依赖、纯逻辑可单测、日常规模够用;WebGL 留给 >400 节点的大图演进(已有 benchmark vault 做基线测量)。

### 为何 git 是唯一版本真相(实际架构决策,初版未写)

- 删除/归档**不另建 `.trash/` 平行机制**,全走 git:结构操作(建/删/改名)后端自动 `git commit`,删除可从 `git checkout <hash>^ -- <path>` 还原;正文编辑**不自动提交**(保住用户 commit 卫生,由 GitPanel 手动提交)。这让 git 历史成为归档视图与还原的唯一真相源,符合"文件即真相 + Git 一等公民"。

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
| 编辑器 | **CodeMirror 6 源码 + BlockNote WYSIWYG** 双模 | 同一 `.md`;frontmatter 侧栏。**打磨缺口**(格式条/右键/双模查找·qql/保真)见 [backlog §C](./backlog.md)。ReadingView(marked + DOMPurify)。 |
| 图谱渲染 | **sigma.js WebGL** + graphology + Worker FR + Barnes-Hut + LOD;无 WebGL → SVG | 功能齐;真机万级帧率见 [deferred](./deferred.md)。 |
| 阅读渲染 | **marked 18 + DOMPurify 3** | Markdown → HTML + sanitize;F-READING 安全加固。 |
| Canvas | **Excalidraw**(MIT) | 无限画布;懒加载隔离在 `CanvasView` chunk(见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md))。 |
| 包管理 | **pnpm**(workspace monorepo) | 快、磁盘高效。 |
| 测试 | **cargo test**(Rust)+ **Vitest 4**(TS) + **Playwright**(e2e) | 单元(cargo + Vitest node 纯逻辑)+ @testing-library/jsdom 组件测试 + Playwright e2e(mock 模式 smoke,见 [05-tdd-strategy](./05-tdd-strategy.md))。 |

> 选型原则:依赖只选成熟、MIT/Apache(或弱 copyleft 如 MPL-2.0)许可、活跃维护的库。画布为 Excalidraw(MIT);无 tldraw。完整清单见 [README](../README.md) 与 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

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
│       ├── lib/          ← 纯逻辑(store/tabs/graph-model/graph-layout/graph-lod/qql-block/vault-watch/…)
│       └── *.test.ts     ← Vitest 纯逻辑测试(node 环境)
├── tools/                ← 生成式脚本(gen-benchmark-vault.mjs)
├── .github/workflows/    ← ci.yml(测试)+ release.yml(打包矩阵)
├── licenses/             ← 第三方逐字许可证(如 blocknote-LICENSE.md)
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
                    write_note 等 → 路径级 delta 更新 LiveVault
                                         ▼
                    index_vault(force=false) 投影 live → 替换 UI 状态
                    apply_vault_changes(paths) 路径级同步(watcher)
```

写路径只动文件;索引永远是**文件的派生物**,从不反过来。这保证"文件即真相":即便索引全删,`index_vault(force=true)` 全量 WalkDir 即复原。

> **索引刷新(增量路径,已落地)**:
> 1. **打开 vault** —— `index_vault(force=true)` 一次 WalkDir → 内存 `LiveVault{entries,index}`。
> 2. **写/删/改名** —— 路径级 delta 更新 entry map → `VaultIndex::build_from_map`(**不**全库扫盘);`run_qql` / `search_notes` 只读 live.index。
> 3. **notify watcher** —— 外部改 `.md`/`.canvas` → debounce 350ms → emit `vault-changed` **相对路径列表** → 前端 `apply_vault_changes`。mock/浏览器无 fs 不监听。
> 4. **自愈** —— 漏事件时 `index_vault(force=true)` 再 WalkDir。**用户可达**:UI `actions.refreshIndex` 走 force=true;watcher apply 失败也会 force。保存后的节流 refresh 仍 force=false(live 已路径级更新)。
>
> 约束不变:"文件即真相、索引是派生物"。图/检索从当前 entry map 重建;NodeId 为 Vec 下标,delta 后快照整表替换。

## IPC 契约(Tauri commands + 1 事件)

后端暴露给前端的命令(全部薄包装 `core` 或 `run_git` 子进程):

```rust
// 读
list_vault(root) -> Vec<VaultEntry>
read_note(root, path) -> String

// 写(结构操作后端自动 git 提交,见 F-GIT;并路径级更新 LiveVault)
write_note / create_note / delete_note / rename_note(root, ...)

// 索引 + 查询(LiveVault + core::VaultIndex)
index_vault(root, force?) -> VaultSnapshot    // force 或缺 live → WalkDir;否则投影 live
apply_vault_changes(root, paths) -> VaultSnapshot  // 路径级读/删 → rebuild_from_map
run_qql(root, qql) -> ResultSet               // **只读 live.index**,不 WalkDir
search_notes(root, query) -> Vec<SearchHit>   // **只读 live.index**

// 对话框 + 诊断
pick_vault() / diag_log / reveal_in_finder

// git
git_status_raw / git_log_raw / git_commit / git_pull / git_push
git_is_repo / git_deleted_notes / git_restore_note / git_init

// 文件监听(Tauri 桌面;mock/浏览器 no-op)
watch_vault(root) / unwatch_vault()           // emit "vault-changed" + 路径列表
```

> **事件订阅**:`vault-changed` payload = `string[]` 相对路径。前端节流后 `apply_vault_changes`。
> `ResultSet` 形态:`List/Table/Count/Groups/Sum/Histogram`。

## 性能策略

- **索引**:打开 vault 一次 WalkDir;之后路径级 delta + `build_from_map`(core 纯函数,有单测)。`run_qql`/`search` 不扫盘。
- **图谱**:`graph-model`(path-stable)+ Worker FR(**Barnes-Hut** n≥280)+ **sigma WebGL** + LOD 簇边/飞入;无 WebGL → SVG。拖/框选/pin/悬空边双路径对齐。
- **查询**:Rust 原生(`query::eval` 在 live 不可变快照上)。UI 无独立搜索视图:⌘F 文档内、⌘P 快速打开、⌘K 命令。
- **编辑器**:CodeMirror 源码 + BlockNote WYSIWYG 双模;自动保存防抖。
- **画布**:Excalidraw(MIT),懒加载。

## 为什么是这个架构(诚实取舍)

- **为何 Rust core 与 Tauri 分离**:把性能关键且高 bug 密度的逻辑(链接解析、图、查询)锁进纯函数库 = TDD 最划算的地方,且未来可复用(MCP/CLI)。代价:多一层 IPC 序列化。值。
- **为何不 Electron**:Tauri 二进制小、内存低,且 Rust 后端顺理成章。代价:生态比 Electron 小、平台 webview 差异要处理。对一个文件优先的 app,值。

### 为何与初版设计不同(02 原表的务实修正)

- **编辑器:CodeMirror + BlockNote 双模**:源码 round-trip 最稳;WYSIWYG 用 BlockNote(MPL-2.0)。`.md` 仍是真相源。
- **UI 栈:Tailwind 4 + 少量 Radix**:展示型组件自实现,降依赖体积。
- **图谱:SVG 起步 → WebGL 大图**:中小 vault 可测可控;万级目标 sigma + Worker + LOD。
- **画布:Excalidraw 而非 tldraw**:默认 MIT 分发、可托管,无 source-available 生产限制。

### 为何 git 是唯一版本真相(实际架构决策,初版未写)

- 删除/归档**不另建 `.trash/` 平行机制**,全走 git:结构操作(建/删/改名)后端自动 `git commit`,删除可从 `git checkout <hash>^ -- <path>` 还原;正文编辑**不自动提交**(保住用户 commit 卫生,由 GitPanel 手动提交)。这让 git 历史成为归档视图与还原的唯一真相源,符合"文件即真相 + Git 一等公民"。

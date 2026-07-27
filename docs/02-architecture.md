# 02 — 架构

## 技术栈

| 层 | 选型 | 为什么 |
|---|---|---|
| 桌面外壳 | **Tauri 2.x** | 比 Electron 轻 10x+,Rust 后端,原生文件/性能。Obsidian 用 Electron;用 Tauri 是结构性差异。 |
| 后端 / 核心 | **Rust**(`core` crate) | 性能关键路径(解析、图谱、查询)放这。纯逻辑、全测试、TDD 心脏。 |
| 前端 | **React 19 + TypeScript + Vite 7** | 与 Tolaria 对齐;生态成熟、类型安全。 |
| UI 组件 | **Mantine + Radix UI + Tailwind 4 + shadcn 模式(cva/clsx/tailwind-merge)+ Phosphor icons** | 与 Tolaria 对齐(降低复刻复杂度):成熟无障碍组件 + 原子化样式。 |
| 编辑器 | **BlockNote**(富文本块编辑,主)+ **CodeMirror 6**(raw markdown 模式) | 与 Tolaria 对齐:BlockNote 给 Notion 式块编辑,CodeMirror 给纯 markdown 模式。两者皆 MIT。 |
| 图谱渲染 | **react-force-graph-2d**(WebGL,基于 d3-force) | 万级节点流畅;WebGL 走 GPU。MIT。(Tolaria 无图谱——这是我们的一等公民差异) |
| 包管理 | **pnpm**(workspace) | 快、磁盘高效;与 Tolaria 对齐。 |
| 测试 | **cargo test**(Rust 单元)+ **Vitest**(TS 单元/组件)+ **Playwright**(e2e)+ **mock-tauri 层** | 三层金字塔;前端可脱离 Tauri 测试(借鉴 Tolaria 的 mock-tauri 模式)。 |

> 选型原则:依赖只选成熟、MIT/Apache 许可、活跃维护的库。完整清单与许可见 [07-provenance](./07-provenance.md)。

## 仓库布局(workspace monorepo)

```
OpenObsidian/
├── docs/                 ← 你正在读的设计
├── core/                 ← Rust crate:纯逻辑(解析/图谱/查询),全测试,TDD 心脏
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── parse.rs      ← markdown + frontmatter 解析
│       ├── graph.rs      ← wikilink → 图
│       ├── query.rs      ← 实时聚合查询引擎
│       └── ...
├── app/                  ← Tauri 外壳 + IPC 命令(薄层,包装 core)
│   ├── src-tauri/        ← Rust:Tauri commands,文件 watcher,把 core 暴露给前端
│   └── ...
├── ui/                   ← React 前端
│   ├── src/
│   │   ├── editor/       ← CodeMirror 包装
│   │   ├── graph/        ← 图谱视图
│   │   ├── query/        ← 查询视图/内联渲染
│   │   ├── filetree/
│   │   └── ...
│   └── tests/            ← Vitest 单元/组件 + Playwright e2e
├── LICENSE               ← MIT
└── README.md
```

## 分层与依赖方向(单向,无环)

```
        ┌──────────────────────────┐
        │   ui (React/TS)          │  仅依赖 IPC 契约(Tauri commands)
        └────────────┬─────────────┘
                     │ Tauri IPC (JSON over invoke)
        ┌────────────▼─────────────┐
        │   app/src-tauri (Rust)   │  薄层:文件 IO、watcher、命令包装
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
ui 编辑器 ──(防抖)──▶ Tauri command ──▶ 写 .md 文件
                                              │
                                              ▼
                                    文件 watcher 事件
                                              │
                                              ▼
                                  重扫受影响笔记 → 更新索引/图 → 推送 diff 给 ui
```

写路径只动文件;索引永远是**文件的派生物**,从不反过来。这保证"文件即真相"原则:即便索引全删,重扫即复原。

## IPC 契约(Tauri commands,初版)

后端暴露给前端的命令(全部薄包装 core):

```rust
// 读
open_vault(path) -> VaultSnapshot      // 扫描 + 解析 + 建图,返回初始快照
get_note(path) -> Note
search(query) -> Vec<NoteRef>
query(q: Query) -> QueryResult         // 实时聚合
graph(filter: GraphFilter) -> Graph    // 可过滤的子图

// 写
save_note(path, content)               // 落盘 + 触发重扫
create_note(title) -> path
rename_note(from, to)
delete_note(path)
```

前端订阅事件:`note_changed`、`graph_changed`(由 watcher 推送)。

## 性能策略

- **索引** :首次扫描在 Rust,万级文件秒级;之后增量(watcher 事件只重扫受影响节点)。
- **图谱** :WebGL,节点数 ≤ 几千流畅;对超大库做 LOD(缩放时折叠聚类)。
- **查询** :Rust 原生,避免前端 JS 全量遍历。
- **编辑器** :CodeMirror 6 是增量解析,大文件不卡。

## 为什么是这个架构(诚实取舍)

- **为何 Rust core 与 Tauri 分离**:把性能关键且高 bug 密度的逻辑(链接解析、图、查询)锁进纯函数库 = TDD 最划算的地方,且未来可复用(MCP/CLI)。代价:多一层 IPC 序列化。值。
- **为何不 Electron**:Tauri 二进制小、内存低,且 Rust 后端顺理成章。代价:生态比 Electron 小、平台 webview 差异要处理。对一个文件优先的 app,值。
- **为何 BlockNote + raw 模式**:与 Tolaria 对齐(降低复刻复杂度、共享踩坑经验)。BlockNote 给块编辑体验,raw CodeMirror 模式保证文件纯 markdown 可控。代价:BlockNote 有自己的文档模型,markdown round-trip 需处理(Tolaria 用 patches/ 补丁解决,我们留意同样边界)。
- **为何 UI 栈对齐 Tolaria(Mantine/Radix/Tailwind/shadcn)**:省掉选型与造轮子,且这套组合经过 Tolaria 在 PKM 场景的验证。差异点(图谱/聚合)才是我们要花力气的地方,组件库不该是。

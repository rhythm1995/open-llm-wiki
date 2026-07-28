# OpenObsidian

本地优先、文件即真相、MIT 许可的知识管理 app。以 Tolaria 的公开设计与实现为蓝本参考(clean-room 重写,未复制源码),补齐 Obsidian 最被需要的两件事:**图谱可视化** 与 **实时聚合查询(QQL)**。

## 状态

🚧 早期开发中,**MVP 已可运行**:Rust core(98 测试)+ Tauri 2 桌面壳 + React 19 三栏 UI。

- 设计:[docs/](./docs/) —— 先读 [docs/README.md](./docs/README.md)
- 待你拍板的事:[docs/open-questions.md](./docs/open-questions.md)
- 路线图:[docs/06-roadmap.md](./docs/06-roadmap.md)

## 架构

```
ui (React 19 + Vite + Tailwind 4 + CodeMirror 6)
        │ IPC(@tauri-apps/api invoke)
        ▼
app/src-tauri (Tauri 2 薄壳:文件 IO + 命令,无业务逻辑)
        │
        ▼
core (Rust:解析 / 图谱 / QQL 求值 / 检索 —— 纯逻辑,IO-free,TDD)
```

- `core/` —— 纯函数、无 IO、proptest + 单测全守护。
- `app/src-tauri/` —— 10 个 `#[tauri::command]` 把文件读写与 core 串起来。
- `ui/` —— 三栏布局(文件树 / 编辑器 / 反链),可切换图谱 / QQL / 搜索视图,⌘K 命令面板。
  浏览器开发走 `src/lib/mock.ts` 内存后端,**无需编译 Rust 即可预览**。

## 开发

```bash
# 1) Rust core:测试 + clippy
cargo test   --manifest-path Cargo.toml -p openobs-core
cargo clippy --manifest-path Cargo.toml --workspace --all-targets

# 2) 前端:浏览器 mock 模式(即开即用,带种子 wiki)
pnpm --dir ui install
pnpm --dir ui dev            # → http://localhost:5173

# 3) 桌面应用(Tauri,真机走 Rust core)
pnpm --dir ui exec tauri dev   # 从仓库根的 app/src-tauri 启动
```

构建发布包:`pnpm --dir ui exec tauri build`。

## 功能速览

- **Markdown 编辑**:CodeMirror 6,自动保存(防抖),frontmatter 感知。
- **文件树**:折叠目录,软类型/标签徽标,当前笔记高亮。
- **反链面板**:wiki 链接 + frontmatter 关系双向入边,点击跳转。
- **图谱视图**:纯 SVG 力导向(无 d3 依赖),节点按类型着色、按度变大小。
- **QQL 查询**:类 DQL 文本(`WHERE type = "Concept" SORT title ASC SHOW …`),core 求值,结果可点。
- **全文搜索**:AND 匹配,标题权重加倍。
- **命令面板**:⌘K 模糊跳转笔记 + 切换视图 + 动作。

## 许可与溯源(clean-room)

**MIT**(见 [LICENSE](./LICENSE))。

**红线:本项目以 [Tolaria](https://github.com/refactoringhq/tolaria) 的公开设计与实现为蓝本参考,但重写为我们自己的表达——绝不逐字或近似逐字复制其源码。** Tolaria 是 AGPL-3.0,逐字复制的代码事实上仍是 AGPL,会让"MIT 许可"落空。因此本项目只借鉴架构、数据流、算法思路与功能概念(多为不可版权的思想/方法),具体源码、组件实现与视觉表达一律自写。Obsidian 仅作公开功能对照,同样不复制其源码。

直接依赖(均 MIT / Apache-2.0):Tauri 2、React 19、CodeMirror 6、Radix UI、Tailwind CSS 4、Phosphor icons、serde / serde_yaml、Vitest。上线前用 `cargo license` / `license-checker` 复核无 GPL/AGPL 直染依赖。

贡献者规矩:新增依赖请登记许可;任何 PR 不得引入 Tolaria 源码的逐字片段(即使单行),review 时查重。

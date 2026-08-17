<div align="center">

<img src="./ui/public/olw-mark.png" alt="Open LLM Wiki" width="72" />

# Open LLM Wiki

本地优先、文件即真相的知识库桌面应用 —— 你的 Markdown 就是唯一真相。

[![CI](https://img.shields.io/github/actions/workflow/status/rhythm1995/open-llm-wiki/ci.yml?style=flat-square)](https://github.com/rhythm1995/open-llm-wiki/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square)](./LICENSE)

<!-- README-I18N:START -->

[English](./README.md) | **简体中文**

<!-- README-I18N:END -->

[功能](#功能) · [快速开始](#快速开始) · [用户文档](./docs/user/README.zh.md) · [架构](#架构)

</div>

![编辑器：笔记列表、所见即所得正文、右侧反链](docs/user/images/editor-zh.png)

双模编辑器、关系图谱、库健康看板、画布与表格，加上 git 与内置 MCP。全部跑在你自己的机器上：无需账号、无云同步。

> [!NOTE]
> Vault 就是本机上的一个 Markdown 文件夹。想走，带上文件即可。

## 功能

- **双模编辑** — CodeMirror 源码 + BlockNote 所见即所得，往返不丢内容。`[[wikilink]]` 补全、跳转、反链。
- **图谱** — 把 wikilink 与 frontmatter 关系画成可交互网络；力导向 / 按类型分层 / 时间轴。
- **库健康** — 进门先看分数与下一步；11 条锁定查询按结构 / 证据 / 信任分组。不教人写查询语言。
- **应用内 Agent** — 右侧栏托管会话：配方 picker、权限三档、`@` 笔记上下文、写库后可归因到 git 快照。
- **面向外部 Agent** — 内置 MCP（8 个工具）让 Cursor / Claude Code 等读写当前库；一键接入记忆。
- **命令与检索** — `⌘K` 命令、`⌘P` 快开、`⌘⇧F` 全文搜索。
- **媒体** — 粘贴 / 拖入图片进 `attachments/`；孤儿附件可清理。
- **Git** — 桌面端对 git vault 做 status / commit / pull / push / 还原（走系统 `git`）。
- **本地优先** — 偏好只存在本机。界面简体中文 / English。

## 界面

| 图谱 | 库健康 |
| --- | --- |
| ![图谱视图：笔记节点与有向边](docs/user/images/graph-zh.png) | ![库健康总览分数与下一动作](docs/user/images/health-zh.png) |

![命令面板 ⌘K](docs/user/images/palette-zh.png)

完整操作说明见 [用户文档](./docs/user/README.zh.md)。

## 快速开始

### 从源码构建（当前可用）

```bash
git clone https://github.com/rhythm1995/open-llm-wiki.git
cd open-llm-wiki
pnpm install --dir ui
pnpm build:app          # → target/release/bundle/macos/Open LLM Wiki.app
open target/release/bundle/macos/Open LLM Wiki.app
```

浏览器预览（内存 mock，无需编译 Rust）：

```bash
pnpm --dir ui dev       # → http://localhost:5173
```

完整桌面应用（真 Rust core），须从**仓库根**启动：

```bash
ui/node_modules/.bin/tauri dev
```

> [!IMPORTANT]
> Tauri 配置在 `app/src-tauri/`。不要用 `pnpm --dir ui exec tauri`——`--dir` 会改 CWD，发现失败。

### 预编译包（发布后）

从 [Releases](https://github.com/rhythm1995/open-llm-wiki/releases) 取 `Open LLM Wiki.app`，拖入 `/Applications`。构建**未签名**，首次启动若被拦：

```bash
xattr -cr "/Applications/Open LLM Wiki.app"
```

或：系统设置 → 隐私与安全性 → 仍要打开。需 macOS 10.15+。Bundle ID 为 `dev.openllmwiki.desktop`，请替换旧版，不要并排留多个副本。

打开应用后：选一个 Markdown 文件夹作为 Vault，或创建示例知识库。点顶栏 logo 可打开应用内简介。

## 用户文档

| 你想… | 打开 |
| --- | --- |
| 第一次用，跟着做一遍 | [教程](./docs/user/tutorial.zh.md) |
| 完成一件具体的事 | [操作指南](./docs/user/how-to.zh.md) |
| 查快捷键 / 视图 / 文件类型 | [参考](./docs/user/reference.zh.md) |
| 理解「文件即真相」和类型约定 | [概念](./docs/user/concepts.zh.md) |

设计与实现文档在 [docs/](./docs/README.zh.md)（给贡献者 / agent）。

## 架构

```
ui (React 19 + Vite + Tailwind 4 + CodeMirror 6 + BlockNote)
        │  IPC (@tauri-apps/api invoke)
        ▼
app/src-tauri (Tauri 2 薄壳：文件 IO + 命令，无业务逻辑)
        ▼
core (Rust：解析 / 图谱 / 检索 —— 纯逻辑，IO-free)
```

- `core/` — 纯函数，无 IO。
- `app/src-tauri/` — 串起文件、git 与 core。
- `mcp/` — 内置 MCP server。
- `ui/` — 三栏界面。浏览器开发走 `src/lib/mock.ts`。

技术栈：[Tauri 2](https://tauri.app/) · [React 19](https://react.dev/) · [CodeMirror 6](https://codemirror.net/) · [BlockNote](https://blocknotejs.org/) · [force-graph](https://github.com/vasturiano/force-graph) · [Excalidraw](https://excalidraw.com/) · [ironcalc](https://www.ironcalc.com/)

## 环境要求

- macOS 10.15+（预编译）；Windows / Linux 可从源码构建。
- Node.js + pnpm（前端 / 开发）。
- Rust 工具链（`core` 与 Tauri 壳）。

> [!WARNING]
> 构建暂未签名、无自动更新。浏览器 mock 不跑库健康的 QQL 明细（图谱分数仍可用）。不要手写查询语言——临时问题走「问 Agent」。

仓库：[rhythm1995/open-llm-wiki](https://github.com/rhythm1995/open-llm-wiki) · 反馈：[Issues](https://github.com/rhythm1995/open-llm-wiki/issues)

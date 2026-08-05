# OpenObsidian

本地优先、文件即真相、MIT 许可的知识管理桌面应用 —— 你的纯 Markdown 文件是唯一真相。双模编辑器、Cytoscape 图谱、Excalidraw 画布、Sheet 表格,集成 git 与内置 MCP server,全部跑在你自己的机器上,无需账号、无云同步。

<!-- README-I18N:START -->

**简体中文** | [English](./README.en.md)

<!-- README-I18N:END -->

## 功能

- **双模编辑器** —— CodeMirror 6 源码模式 + BlockNote 所见即所得(WYSIWYG);二者切换有真引擎 Markdown↔block 往返门禁(诊断套件守护),切换不丢内容。
- **图谱视图** —— Cytoscape 渲染 wikilink 与 frontmatter 关系;力导向 / 按 type 分层 / 时间轴布局切换;按类型·标签过滤。
- **画布** —— Excalidraw 无限白板(MIT);`.canvas` 文件即真相,与笔记同构保存。
- **Sheet** —— 嵌入式表格(v2);笔记内类 CSV 编辑。
- **命令面板** —— ⌘K 命令、⌘P 快开、⌘⇧F 库内全文检索(含 canvas / sheet)。
- **媒体管理** —— 粘贴 / 拖入 / 插入图片进 `attachments/`;MediaIndex 一等索引 + 孤儿附件清理。
- **编辑体验** —— 查找替换、大纲(标题)、source｜reading 并排预览、当前笔记断链提示、任务列表按钮。
- **Git** —— status / log / commit / pull / push / restore + 自动提交,走系统 `git`,仅在 Tauri 桌面 app 内、vault 为 git 仓库时生效。
- **AI 上下文导出** —— 一键把当前笔记 + 其链接到的邻居正文复制为 LLM 友好的 markdown。
- **应用内 Agent** —— 右侧栏 ACP 托管会话:配方 picker(opencode / claude-code)、权限三档、`@`-笔记上下文、跨 agent 移交、会话转录回放;agent 写入按 turn 级 git 快照归因,可采纳 / 撤销。
- **本地优先** —— 一切在本地运行;偏好存于本地配置,绝不上传。
- **面向 AI(MCP)** —— 内置 MCP server 暴露 6 个工具(`list_notes` / `read_note` / `write_note` / `search_notes` / `run_qql` / `vault_info`),Claude Desktop 等 agent 可读写你的库。
- **i18n** —— 简体中文 / English 界面。

## 快速开始

### 方式 A —— 从源码构建(当前可用)

```bash
git clone https://github.com/rhythm1995/OpenObsidian.git
cd OpenObsidian
pnpm install --dir ui
pnpm build:app          # = bash scripts/build-app.sh → target/release/bundle/macos/OpenObsidian.app
open target/release/bundle/macos/OpenObsidian.app
```

浏览器开发预览(实时重载,内存 mock 后端,无需编译 Rust):

```bash
pnpm --dir ui dev       # → http://localhost:5173
```

从源码跑完整桌面应用(真 Rust core):

```bash
ui/node_modules/.bin/tauri dev
```

> Tauri 配置在 `app/src-tauri/`,故须从**仓库根**启动 Tauri CLI(它会递归发现 `app/src-tauri`)。勿用 `pnpm --dir ui exec tauri` —— `--dir` 会把 CWD 切到 `ui/`,递归发现失败。

### 方式 B —— 下载预编译版(发布后)

发布后从 [Releases](https://github.com/rhythm1995/OpenObsidian/releases) 取 `OpenObsidian.app`:

- **macOS**:拖入 `/Applications`;若已存在选「替换」。构建**未签名**,首次运行被 Gatekeeper 拦 —— 系统设置 → 隐私与安全性 → 仍要打开,或:
  ```bash
  xattr -cr /Applications/OpenObsidian.app
  ```
  需 macOS 10.15+。Bundle ID 固定为 `dev.openobsidian.desktop`,**请直接替换旧版**,勿并排留存多个「OpenObsidian」。本地偏好(localStorage / 配置)**替换 .app 不会被清**。

## 配置

设置在应用内(⌘K → Settings):主题(深/浅)、语言(zh/en)、默认编辑模式(source/wysiwyg)、附件布局、图谱力参数、日志 profile。全部本地持久化。

## 架构

```
ui (React 19 + Vite + Tailwind 4 + CodeMirror 6 + BlockNote)
        │ IPC (@tauri-apps/api invoke)
        ▼
app/src-tauri (Tauri 2 薄壳:文件 IO + 命令,无业务逻辑)
        │
        ▼
core (Rust:解析 / 图谱 / 检索 —— 纯逻辑,IO-free,TDD)
```

- `core/` —— 纯函数、无 IO,单测 + proptest 守护。
- `app/src-tauri/` —— Tauri 命令,串起文件 IO、git 与 `core`。
- `mcp/` —— 内置 MCP server(6 工具),供 AI agent。
- `ui/` —— 三栏布局(文件树 / 编辑器 / Inspector);可切换图谱 / Git 视图;⌘K 命令面板。浏览器开发走 `src/lib/mock.ts`(内存后端),无需编译 Rust 即可预览。

## 环境要求

- macOS 10.15+(预编译);Windows / Linux 可从源码构建。
- Node.js + pnpm(前端 / 开发)。
- Rust 工具链(`core` 与 Tauri 壳)。

## 技术栈

- [Tauri 2](https://tauri.app/) —— 桌面壳(Rust)。
- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) + [Tailwind CSS 4](https://tailwindcss.com/) —— UI。
- [CodeMirror 6](https://codemirror.net/) —— 源码编辑器。
- [BlockNote](https://blocknotejs.org/) —— WYSIWYG 编辑器。
- [Cytoscape](https://js.cytoscape.org/) —— 图谱。
- [Excalidraw](https://excalidraw.com/) —— 画布。
- [ironcalc](https://www.ironcalc.com/) —— Sheet。

## 贡献

本项目是**原创、独立的实现**,MIT 许可。**红线:绝不把 GPL/AGPL 等 copyleft 源码(逐字或近似逐字)引入本仓库**——那会让「MIT 许可」落空。只参考公开的思想、架构与功能概念(多为不可版权的思想/方法);所有源码、组件实现与视觉表达一律自写。Obsidian 仅作公开功能对照,不复制其源码。详见 [docs/](./docs/)(先读 [docs/README.md](./docs/README.md))。

- 已做功能:[docs/FEATURE-INDEX.md](./docs/FEATURE-INDEX.md)
- 路线图 / 待办:[docs/backlog.md](./docs/backlog.md)
- 新增依赖请登记 [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md);任何 PR 不得引入 copyleft 源码的逐字片段,review 时查重。

## 已知限制

- **未签名构建** —— 暂无代码签名 / 公证;macOS 首次运行需上文 Gatekeeper 处理。
- **图谱打磨推迟** —— 图谱可用但未达商业精致(布局坐标落盘、力参数面板、最短路径高亮等推迟;见 [CHANGELOG](./CHANGELOG.md))。
- **QQL 仅程序化** —— QQL 用户面已移除;查询引擎仍保留在 Rust core,经 MCP `run_qql` 工具可达,无 GUI 查询界面。
- **无自动更新。**

## 许可

[MIT](./LICENSE)。依赖清单见 [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md)。画布用 [Excalidraw](https://github.com/excalidraw/excalidraw)(MIT);BlockNote 为 MPL-2.0。

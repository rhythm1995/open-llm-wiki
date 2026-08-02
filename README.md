# OpenObsidian

本地优先、文件即真相、MIT 许可的知识管理 app。以 Tolaria 的公开设计与实现为蓝本参考(clean-room 重写,未复制源码),补齐 Obsidian 最被需要的两件事:**图谱可视化** 与 **实时聚合查询(QQL)**。

## 状态

🚧 早期开发中,**MVP 已可运行**:Rust core(98 测试)+ UI(196 测试)+ Tauri 2 桌面壳 + React 19 三栏 UI。

- 设计:[docs/](./docs/) —— 先读 [docs/README.md](./docs/README.md)
- **已做功能索引**:[docs/FEATURE-INDEX.md](./docs/FEATURE-INDEX.md)
- **未做计划**:[docs/plan.md](./docs/plan.md) · [docs/backlog.md](./docs/backlog.md)
- 待拍板:[docs/open-questions.md](./docs/open-questions.md)
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
- `app/src-tauri/` —— 14 个 `#[tauri::command]` 把文件读写、git 与 core 串起来。
- `ui/` —— 三栏布局(文件树 / 编辑器 / 反链),可切换图谱 / QQL / Git;⌘K 命令面板、⌘P 快速打开、⌘F 文档内查找。
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
#    tauri.conf.json 在 app/src-tauri/(非仓库根),故须从【仓库根】启动 tauri CLI,
#    让它递归发现 app/src-tauri。注意:不要用 `pnpm --dir ui exec tauri` ——
#    `--dir` 会把 CWD 切到 ui/,递归发现就找不到 app/src-tauri 了。
ui/node_modules/.bin/tauri dev
```

构建发布包(产出 .app / .dmg 等,在 `target/release/bundle/`):

```bash
ui/node_modules/.bin/tauri build
```

### 安装与覆盖旧版

- Bundle ID 固定为 `dev.openobsidian.desktop`、产品名 `OpenObsidian` —— **每次安装同一包名时请直接替换旧版**,不要并排留多个「OpenObsidian」。
- **macOS(推荐)**:打开 dmg → 把 `OpenObsidian.app` 拖到「应用程序」;若已存在,选 **「替换」**。也可命令行覆盖:
  ```bash
  rm -rf /Applications/OpenObsidian.app
  cp -R target/release/bundle/macos/OpenObsidian.app /Applications/
  ```
- 本地偏好/最近 vault 等在用户目录的 localStorage 与配置里,**替换 .app 不会清这些数据**;要干净试用可另开用户或清相关键。
- 未签名包首次打开可能被 Gatekeeper 拦:系统设置 → 隐私与安全性 → 仍要打开,或 `xattr -cr /Applications/OpenObsidian.app`。

## 功能速览

- **Markdown 编辑/阅读**:CodeMirror 6 编辑 + marked 渲染阅读(一键切换),自动保存(防抖)+ ⌘S,frontmatter 感知。
- **文件树**:折叠目录,软类型/标签徽标,当前笔记高亮,新建/重命名/软删。
- **反链面板**:wiki 链接 + frontmatter 关系双向入边,点击跳转。
- **属性 / 大纲**:frontmatter 可视化编辑;大纲提取标题,点击跳行。
- **图谱视图**:纯 SVG 力导向(无 d3 依赖),节点按类型着色、按度变大小,过滤/缩放/聚焦。
- **QQL 查询**:类 DQL 文本(`WHERE type = "Concept" SORT title ASC SHOW …`),core 求值,结果可点。
- **全文搜索**:AND 匹配,标题权重加倍(浏览器 mock 也可用)。
- **多标签**:开/关/激活,中键关闭,拖拽重排。
- **模板**:`templates/` 下笔记作模板,新建时套用,`{{title}}`/`{{date}}` 替换。
- **回收站**:软删移入 `.trash/`,可逐篇还原、彻底删除或清空。
- **主题**:深色(Mocha)默认 + 浅色(Latte)切换,持久化。
- **命令面板**:⌘K/⌘P/⌘O 模糊跳转笔记 + 切换视图 + 动作。
- **Git 面板**:`git status` 变更清单 + `git log` 历史 + "提交全部改动";走系统 `git`,仅 Tauri 桌面 app 内、vault 为 git 仓库时生效。
- **AI 上下文导出**:一键把当前笔记 + 其链接到的邻居正文复制为 LLM 友好的 markdown(AI-native 读侧桥接)。
- **i18n**:zh(默认)/ en 切换,顶层 chrome 已本地化,持久化。
- **阅读视图安全**:marked 输出注入 DOM 前经 DOMPurify 清洗(剥离 `<script>`/内联事件,保留 wikilink 委托)。
- **画布(Excalidraw,MIT)**:无限画布做白板/示意图,`.canvas` 文件即真相、与笔记同构保存。懒加载隔离在独立 chunk。

## 许可与溯源(clean-room)

**MIT**(见 [LICENSE](./LICENSE))。

**红线:本项目以 [Tolaria](https://github.com/refactoringhq/tolaria) 的公开设计与实现为蓝本参考,但重写为我们自己的表达——绝不逐字或近似逐字复制其源码。** Tolaria 是 AGPL-3.0,逐字复制的代码事实上仍是 AGPL,会让"MIT 许可"落空。因此本项目只借鉴架构、数据流、算法思路与功能概念(多为不可版权的思想/方法),具体源码、组件实现与视觉表达一律自写。Obsidian 仅作公开功能对照,同样不复制其源码。

直接依赖**绝大多数为 MIT / Apache-2.0**:Tauri 2、React 19、CodeMirror 6、Radix UI、Tailwind CSS 4、Phosphor icons、marked、dompurify、serde / serde_yaml、walkdir、Vitest。

**默认分发为 MIT**:画布使用 [Excalidraw](https://github.com/excalidraw/excalidraw)(MIT),**无** tldraw 等 source-available 生产限制;本地与托管部署均可(仍须遵守各依赖条款,如 BlockNote MPL-2.0)。完整清单见 [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md)。

贡献者规矩:新增依赖请登记许可(更新 THIRD_PARTY_NOTICES);任何 PR 不得引入 Tolaria 源码的逐字片段(即使单行),review 时查重。上线前用 `cargo license` / `pnpm licenses list` 复核无 GPL/AGPL 直染依赖。

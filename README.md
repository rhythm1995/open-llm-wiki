# OpenObsidian

本地优先、文件即真相、MIT 许可的知识管理 app。以 Tolaria 的公开设计与实现为蓝本参考(clean-room 重写,未复制源码),补齐 Obsidian 最被需要的两件事:**图谱可视化** 与 **实时聚合查询(QQL)**。

## 状态

🚧 早期开发中,**MVP 已可运行**:Rust core(98 测试)+ UI(165 测试)+ Tauri 2 桌面壳 + React 19 三栏 UI。

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
- `app/src-tauri/` —— 14 个 `#[tauri::command]` 把文件读写、git 与 core 串起来。
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
- **画布(tldraw)**:无限画布做白板/示意图,`.canvas` 文件即真相、与笔记同构保存。tldraw 懒加载隔离在独立 chunk(非商用许可,详见下文「许可与溯源」)。

## 许可与溯源(clean-room)

**MIT**(见 [LICENSE](./LICENSE))。

**红线:本项目以 [Tolaria](https://github.com/refactoringhq/tolaria) 的公开设计与实现为蓝本参考,但重写为我们自己的表达——绝不逐字或近似逐字复制其源码。** Tolaria 是 AGPL-3.0,逐字复制的代码事实上仍是 AGPL,会让"MIT 许可"落空。因此本项目只借鉴架构、数据流、算法思路与功能概念(多为不可版权的思想/方法),具体源码、组件实现与视觉表达一律自写。Obsidian 仅作公开功能对照,同样不复制其源码。

直接依赖**绝大多数为 MIT / Apache-2.0**:Tauri 2、React 19、CodeMirror 6、Radix UI、Tailwind CSS 4、Phosphor icons、marked、dompurify、serde / serde_yaml、walkdir、Vitest。

**一处例外:tldraw(画布功能,F-CANVAS)采用其自有的 source-available 非商用许可**,非 MIT。OpenObsidian 是本地优先的单机个人 app,落在 tldraw 的"非生产/开发环境"许可范围内,故本地使用兼容;但**作为托管 web 服务对公众部署需另行向 tldraw 取得商用许可**。tldraw 被隔离在唯一一个懒加载模块里,可一键移除以回到纯 MIT。完整清单与边界见 [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md),逐字许可证见 [licenses/tldraw-LICENSE.md](./licenses/tldraw-LICENSE.md)。

贡献者规矩:新增依赖请登记许可(更新 THIRD_PARTY_NOTICES);任何 PR 不得引入 Tolaria 源码的逐字片段(即使单行),review 时查重。上线前用 `cargo license` / `pnpm licenses list` 复核无 GPL/AGPL 直染依赖。

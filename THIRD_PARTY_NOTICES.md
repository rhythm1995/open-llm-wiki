# Third-Party Notices

OpenObsidian 本身的代码以 [MIT](./LICENSE) 许可(见 clean-room 声明)。本文件
诚实记录所有**直接依赖**及其许可,以及唯一一处非 OSI 许可的边界(tldraw)与
对应的兼容处理。

## 依赖许可一览

| 依赖 | 许可 | 备注 |
|---|---|---|
| React 19 / react-dom | MIT | UI 框架。 |
| Tauri 2 + 插件 | MIT / Apache-2.0 | 桌面壳(`@tauri-apps/*`)。 |
| CodeMirror 6 | MIT | 编辑器(md 源码模式)。 |
| BlockNote 0.52 | MPL-2.0 | 块编辑器(md WYSIWYG 模式,弱 copyleft,见下节)。 |
| Radix UI | MIT | 无障碍组件(对话框 / 下拉 / 标签页 / 工具提示)。 |
| Tailwind CSS 4 | MIT | 原子 CSS。 |
| Phosphor icons | MIT | 图标。 |
| marked | MIT | Markdown → HTML 渲染(阅读视图)。 |
| dompurify | Apache-2.0 / MPL | 阅读视图 HTML 清洗(F-READING 安全加固)。 |
| serde / serde_yaml | MIT / Apache-2.0 | Rust 序列化。 |
| walkdir | MIT / Unlicense | Rust 目录遍历。 |
| Vitest / esbuild | MIT | 测试与构建(仅开发期)。 |
| **tldraw** | **tldraw license(非商用 / source-available)** | **见下节。画布功能(F-CANVAS)。** |

完整传递依赖以 `cargo license`、`pnpm licenses list` 为准;上线前复核无
GPL/AGPL 直染依赖(本项目以 Tolaria 公开设计为蓝本 clean-room 重写,严禁
复制 AGPL 源码 —— 见 [README](./README.md) 红线)。

## tldraw 许可边界(F-CANVAS)

**这是本项目唯一一处非 MIT 的直接依赖。** tldraw v5 采用 **tldraw license**
(source-available,允许**开发环境**与**本地非生产**使用,禁止在**生产环境**
面向最终用户/客户/公众部署,除非另行取得商用许可)。全文见
[`licenses/tldraw-LICENSE.md`](./licenses/tldraw-LICENSE.md)(逐字留存,满足
其"任何分发须附许可证逐字副本"的要求)。

### 为什么对 OpenObsidian 是兼容的

OpenObsidian 是**本地优先、单机、个人**的知识管理 app —— 笔记与画布都在你
自己的机器上读写本地文件,**不**作为服务部署到服务器/云平台向最终用户或公众
提供功能。这正落在 tldraw license 的"Development Environment / 非生产"许可
范围内。因此个人本地使用 OpenObsidian(含画布)在 tldraw 自有条款下是被允许的。

### 商用 / 托管部署的边界

若你要把 OpenObsidian **作为托管 web 服务对公众/客户提供**,则进入了 tldraw
license 所禁止的 "Production Environment",需要向 tldraw 取得商用/试用许可
(https://tldraw.dev / sales@tldraw.com)。**MIT 部分不豁免此条** —— 因为
画布能力来自 tldraw。

### 可彻底移除:一条干净退路

tldraw 被**隔离在唯一一个懒加载模块**里:
- `ui/src/components/CanvasView.tsx` —— 唯一 import tldraw 的文件;
- `ui/src/lib/canvas.ts` —— 纯逻辑(仅 `import type`,运行时零依赖);
- App 里按 `.canvas` 扩展名路由,不开画布就不加载 tldraw chunk(构建产物里
  tldraw 独占一个 `CanvasView-*.js` chunk,见 [docs/06-roadmap](./docs/06-roadmap.md))。

**想回到纯 MIT 的 app?** 删掉 `CanvasView.tsx` + `package.json` 里的 `tldraw`
依赖 + App/Sidebar/Palette 里的画布入口即可,其余功能不受影响。这是刻意的
解耦设计,把许可风险收束在一个模块内,而非渗透全局。

### 归属与商标

为遵守 tldraw license 的"不得移除版权/商标声明"条款,画布视图右下角保留
"Powered by tldraw"(链接 tldraw.dev)署名;本文件与 `licenses/tldraw-LICENSE.md`
一并随项目分发。tldraw 商标归 tldraw, Inc. 所有,本项目仅作能力归属,不作背书。

## BlockNote 许可(md WYSIWYG 模式)

BlockNote(`@blocknote/core` `@blocknote/react` `@blocknote/mantine`,v0.52)是
Notion 式块编辑器,用于 md 笔记的 **WYSIWYG(所见即所得)模式** —— 与 CodeMirror
源码模式并列,两者读写同一个 `.md`(真相源不变,frontmatter 走侧栏 Properties
编辑,不进块编辑器)。许可全文见
[`licenses/blocknote-LICENSE.md`](./licenses/blocknote-LICENSE.md)。

### 与 tldraw 的本质区别

BlockNote 是 **MPL-2.0**(弱 copyleft,OSI 认证的开源许可):商用、生产部署、闭源
衍生皆可,只需对**自己修改过的 MPL 文件**开源(文件级 copyleft,不传染 merely
链接它的代码)。这与 tldraw 的 source-available 非商用许可完全不同 —— BlockNote
**无商用门槛、无强制署名**,是标准开源依赖。本项目不修改 BlockNote 源文件,仅作
为库引入,故无开源义务,保留本许可声明即可。

### 归属

BlockNote 由 TypeCellOS/BlockNote 维护(https://github.com/TypeCellOS/BlockNote)。

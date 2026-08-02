# Third-Party Notices

OpenObsidian 本身的代码以 [MIT](./LICENSE) 许可(见 clean-room 声明)。本文件
诚实记录所有**直接依赖**及其许可。**默认分发无 source-available 生产限制** ——
可本地与托管部署(仍须遵守各依赖自身的 OSI 条款,如 MPL 文件级 copyleft)。

## 依赖许可一览

| 依赖 | 许可 | 备注 |
|---|---|---|
| React 19 / react-dom | MIT | UI 框架。 |
| Tauri 2 + 插件 | MIT / Apache-2.0 | 桌面壳(`@tauri-apps/*`)。 |
| CodeMirror 6 | MIT | 编辑器(md 源码模式)。 |
| BlockNote 0.52 | MPL-2.0 | 块编辑器(md WYSIWYG 模式,弱 copyleft,见下节)。 |
| **@excalidraw/excalidraw** | **MIT** | 无限画布(F-CANVAS)。懒加载隔离在 `CanvasView` chunk。 |
| **cytoscape** | **MIT** | 图谱渲染与布局(F-GRAPH;`CytoscapeLayer` 懒加载;cose 力导向)。 |
| Radix UI | MIT | 无障碍组件(对话框 / 下拉 / 标签页 / 工具提示)。 |
| Tailwind CSS 4 | MIT | 原子 CSS。 |
| Phosphor icons | MIT | 图标。 |
| marked | MIT | Markdown → HTML 渲染(阅读视图)。 |
| dompurify | Apache-2.0 / MPL | 阅读视图 HTML 清洗(F-READING 安全加固)。 |
| **@ironcalc/wasm** | **MIT / Apache-2.0** | 表格公式引擎增强(F-SHEET);可选,失败回退内置求值。 |
| serde / serde_yaml | MIT / Apache-2.0 | Rust 序列化。 |
| walkdir | MIT / Unlicense | Rust 目录遍历。 |
| Vitest / esbuild | MIT | 测试与构建(仅开发期)。 |

完整传递依赖以 `cargo license`、`pnpm licenses list` 为准;上线前复核无
GPL/AGPL 直染依赖(本项目以 Tolaria 公开设计为蓝本 clean-room 重写,严禁
复制 AGPL 源码 —— 见 [README](./README.md) 红线)。

## 商用 / 托管部署

OpenObsidian **默认以 MIT 分发**,画布使用 Excalidraw(MIT),**不**再捆绑
tldraw。因此:**本地单机与作为托管 web 服务对公众部署**均不因画布引擎触发
额外商用许可(仍须遵守 MIT 与其它依赖条款,如 BlockNote MPL-2.0)。

历史版本曾使用 tldraw(source-available)。现已移除;磁盘上旧 `.canvas`
(tldraw `TLEditorSnapshot`)可识别为只读遗留文件,不保证可编辑迁移。

## BlockNote 许可(md WYSIWYG 模式)

BlockNote(`@blocknote/core` `@blocknote/react` `@blocknote/mantine`,v0.52)是
Notion 式块编辑器,用于 md 笔记的 **WYSIWYG 模式** —— 与 CodeMirror 源码模式
并列,两者读写同一个 `.md`。许可全文见
[`licenses/blocknote-LICENSE.md`](./licenses/blocknote-LICENSE.md)。

BlockNote 是 **MPL-2.0**(弱 copyleft,OSI 认证):商用、生产部署、闭源衍生皆可,
只需对**自己修改过的 MPL 文件**开源(文件级 copyleft,不传染 merely 链接它的
代码)。本项目不修改 BlockNote 源文件,仅作为库引入,故无开源义务,保留本许可
声明即可。

### 归属

BlockNote 由 TypeCellOS/BlockNote 维护(https://github.com/TypeCellOS/BlockNote)。
Excalidraw 由 Excalidraw 项目维护(https://github.com/excalidraw/excalidraw)。
Cytoscape.js 由 Cytoscape Consortium 等维护(https://github.com/cytoscape/cytoscape.js)。

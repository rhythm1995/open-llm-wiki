# 07 — 溯源 · 许可 · 命名闸门

本文件是 OpenObsidian 的"出生证明",记录**借鉴了什么、没碰什么、为什么 MIT 成立**。

## 许可

**MIT**(见仓库根 `LICENSE`)。

## 借鉴原则(本项目的硬规矩)

**参考 Tolaria 的代码与 UI 实现作为蓝本,降低复刻复杂度;但重写为我们自己的表达,绝不逐字或近似逐字复制。**

理由(也是红线):Tolaria 是 **AGPL-3.0**。逐字复制它的代码,那部分事实上仍是 AGPL,会让"MIT 许可"落空。我们想要 MIT,就必须停在"借鉴思想/架构/方法",不越线到"复制表达"。

可借鉴的(风险低,多为**不可版权**的思想/方法/架构):
- 分层架构(core 纯逻辑 / app 薄壳 / ui)、数据流(文件→索引→派生物)。
- 功能划分与 UI 心智模型(command palette、properties panel、status chip… 的*概念*)。
- 通用算法思路(markdown+frontmatter 解析、力导向图、查询求值)。
- 测试模式(mock-tauri 层、测试金字塔)。

必须以**自己的表达重写**的(风险较高,含可版权表达):
- 具体源码、具体组件实现、具体样式与视觉设计。
- 独特的交互细节。

## 溯源表(明显参考处,持续维护)

| 我们的决策 | 参考来源(Tolaria) | 性质 | 处理 |
|---|---|---|---|
| 分层架构(core/app/ui) | Tolaria `src-tauri`+`src` 结构、`docs/ARCHITECTURE.md` | 架构思想 | 自己组织代码 |
| BlockNote + CodeMirror raw 双模式 | Tolaria `package.json` deps + `design/raw-editor-mode.pen` | 技术选型+功能概念 | 用同款库,自己接线 |
| UI 栈(Mantine/Radix/Tailwind/shadcn/Phosphor) | Tolaria `package.json` deps | 技术选型 | 直接用同款开源库(各自许可) |
| mock-tauri 测试层 | Tolaria `src/mock-tauri/` | 测试方法 | 自己实现 mock 接口 |
| 功能集(command palette/properties/status/tags…) | Tolaria `design/*.pen` 文件名 | 功能清单+UI 蓝图 | 概念借鉴,UI 重写 |
| vault/ontology(可选 type、关系一等公民) | Tolaria `docs/VISION.md`(公开) | 哲学 | 文字方法论,自由借鉴 |
| 图谱 / 实时聚合 | (Tolaria **没有**——这是我们的差异) | 原创 | 全新实现 |

> 凡实现某模块时明显对照了 Tolaria 某文件,在此表追加一行。

## 依赖许可清单(直接依赖,均宽松许可)

| 依赖 | 许可 | 用途 |
|---|---|---|
| Tauri 2 | Apache-2.0 / MIT | 桌面外壳 |
| React 19 | MIT | UI |
| BlockNote | MIT | 块编辑器 |
| CodeMirror 6 | MIT | raw markdown |
| Mantine | MIT | UI 组件 |
| Radix UI | MIT | 无障碍原语 |
| Tailwind CSS 4 | MIT(-ish) | 原子化 CSS |
| react-force-graph-2d / d3-force | MIT | 图谱渲染 |
| serde / serde_yaml | MIT/Apache | Rust 序列化 |
| Vitest / Playwright | MIT | 测试 |

> 上线前用 `cargo license` 与 `license-checker` 生成完整清单,核无 GPL/AGPL 直染依赖。

## 命名闸门(硬约束,公开前必做)

"OpenObsidian" 是**开发期占位名**,仅在私有/未发布状态零风险。商标风险在**公开发布**那一刻触发。**第一个 public artifact(公开仓库 / 官网 / 下载页)出现之前,必须改为自创、与 Obsidian 无词根关系的名字。**

- 允许(描述,非名字):"imports Obsidian vaults" / "compatible with Obsidian" —— nominative fair use。
- 不允许(作为产品名):含 "Obsidian"/"Obs" 词根、或暗示官方开源版。

候选方向见对话记录(地质/制图/生长类隐喻,或直接复用自有干净名 "Cairn")。发布前最终定名并检索 USPTO + 域名 + 同名软件。

## 给贡献者的规矩

- 新增依赖:登记到上表,核许可。
- 若某个实现确实对照了 Tolaria 某文件:在溯源表追加一行。
- 任何 PR 不得引入 Tolaria 源码的逐字片段(即使单行)。review 时查重。

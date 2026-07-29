# 待你拍板的事(Open Questions)

> 实现过程中我**拿不准 / 需要你定**的决策,记在这里。其余我用合理默认值推进,你验收时校准。
> 每条标【默认】= 我已先按此实现;【待定】= 我跳过了,等你。

## 工程

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| Q1 | 项目正式名 | ✅【已定】OpenObsidian | 正式名定为 OpenObsidian。 |
| Q2 | YAML 解析库 | ✅【默认已落地】`serde_yaml 0.9.34` | 已确认编译/运行通过。维护模式但稳定;想换活跃分支 `serde_yml` 可一行替换(仅 `parse_frontmatter` 一处)。 |
| Q3 | 编辑器 | ✅【MVP 默认】CodeMirror 6 markdown | MVP 选纯源码编辑(round-trip 最稳、体积小);BlockNote 所见即所得延后到 v2(需补 patches + md 双向转换)。 |
| Q4 | UI 组件库 | ✅【MVP 默认】Tailwind 4 + Radix + Phosphor + shadcn(cva/clsx/tw-merge) | MVP 不引入 Mantine(避免与 Tailwind 的 reset/provider 冲突);Mantine 的 Combobox 等可在 v2 按需引入。 |
| Q5 | Tauri 版本 | 【默认】Tauri 2.x | 最新稳定,对齐 Tolaria。 |
| Q6 | 包管理器 | 【默认】pnpm | 对齐 Tolaria。 |

## 产品

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| P1 | 图谱默认布局 | ✅【MVP 默认】力导向(**纯 SVG 自实现**,无 d3/react-force-graph 依赖) | 另可选"按 type 分层""按时间轴",v2 再议。 |
| P2 | QQL 语法 | ✅【已定】DQL 风格(`WHERE/SORT/LIMIT/SHOW`) | 已选定 A 方案并实现文本解析器 `qql::parse`(string → Query AST),demo 里可敲文本查询。 |
| P3 | 是否支持 cairn 协议原生 | 【默认】是 | 识别 Source/Summary/Entity/Concept + 关系键,直接当 cairn GUI 运行时。 |
| P4 | type 系统是否保留"类型文档" | 【默认】v1 不做 | 这是 Tolaria "绑人"的源头;v2 再议,且仅作 UI 提示。 |

## 暂时跳过(待你验收后继续)

- ~~QQL 文本解析器~~ ✅ **已落地**(P2 选定 DQL 风格,`qql::parse` 实现 + 测试 + demo 接通)。当前 QQL 全链路:text → AST → 结果,皆在纯内核。

> "index 切片的 Graph 结构"原为待定项,已按 Q7 默认落地,不再跳过。

## 新增待定(实现中产生)

| # | 问题 | 选项 / 默认 | 说明 |
|---|---|---|---|
| Q7 | 关系边如何进图 | ✅【默认已落地】enriched `Note`(含 frontmatter→map + relation_links),`Graph::build` 消费 `Note`,Wiki + Relation 统一为同一套边结构 | 已实现,反向链接、悬空检测对两类边一视同仁。验收时若你想要 Graph 仍吃 `ParsedNote`,可再议。 |


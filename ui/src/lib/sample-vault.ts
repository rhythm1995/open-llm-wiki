/**
 * sample-vault —— 首次启动「创建示例知识库」的种子内容(纯数据,无 IO)。
 *
 * 桌面端由 `create_sample_vault` 写入 `~/Documents/Open LLM Wiki Demo*`;
 * mock 模式由 `mock.handle` 灌入内存 Map。笔记带 type / tags / wikilink,打开后
 * 立刻能演示列表、图谱与反链。
 */

export interface SampleNote {
  /** vault 相对路径(POSIX `/`)。 */
  path: string;
  content: string;
}

/** 示例库文件清单(顺序无关;创建时按 path 写盘)。 */
export function sampleVaultNotes(): SampleNote[] {
  return [
    {
      path: "Welcome.md",
      content: `---
type: Note
tags: [meta]
---

# Welcome

这是 **Open LLM Wiki** 的示例知识库。

- 本地优先:文件即真相,目录就是 Vault
- 用 \`[[wikilink]]\` 连接笔记,打开 **图谱** 看网络
- 从左侧列表选笔记,或新建一篇开始

从这里开始:

- 概念 [[Local First]]
- 概念 [[Knowledge Graph]]
- 来源 [[Example Source]]
`,
    },
    {
      path: "concepts/local-first.md",
      content: `---
type: Concept
status: Active
tags: [method]
---

# Local First

数据留在你自己的磁盘上,而不是关进别人的云。

Open LLM Wiki 把任意 Markdown 文件夹当作 Vault——可同步、可 git、可备份。

相关:[[Knowledge Graph]] · [[Welcome]]
`,
    },
    {
      path: "concepts/knowledge-graph.md",
      content: `---
type: Concept
status: Active
tags: [method]
---

# Knowledge Graph

笔记之间的链接构成一张图:节点是页面,边是 wikilink 与 frontmatter 关系。

试试顶栏 **图谱**,双击节点打开笔记。

相关:[[Local First]] · [[Example Source]] · [[Welcome]]
`,
    },
    {
      path: "sources/example-source.md",
      content: `---
type: Source
evidence_tier: analysis
tags: [example]
---

# Example Source

示例「来源」页:记录你读过的文章、论文或对话,再蒸馏进 Concept / Entity。

被 [[Knowledge Graph]] 与 [[Welcome]] 引用。
`,
    },
  ];
}

/** mock 示例库根路径(与正式 mock vault 区分,便于欢迎页演示「创建」)。 */
export const SAMPLE_VAULT_MOCK_ROOT = "/sample-vault";

# 03 — 数据模型

数据模型是图谱、聚合、反向链接共同的地基。它必须**严格、可测试、与 Obsidian/Tolaria 互通**(纯 md + frontmatter)。

## Vault(金库)

```
Vault = 目录 + 其下所有 .md 文件(递归)
```

- 非 `.md` 文件是**附件**(图片、PDF),可被引用、可索引为资产,但不是 note。
- `.obs/`、`.git/`、`node_modules/` 等约定目录被**忽略**(可配置)。
- vault 根可放 `AGENTS.md`(若存在,作为给 agent 的 schema 提示——与 cairn 协议兼容)。

## Note(笔记)

每个 `.md` 文件解析为:

```rust
struct Note {
    path: VaultPath,        // 相对 vault 根的路径,如 "projects/alpha.md"
    title: String,          // 第一个 H1;无则文件名(去扩展名)
    frontmatter: Frontmatter,  // YAML,见下;可能为空
    body: Markdown,         // frontmatter 之后的原文
    links: Vec<Link>,       // 从 body + frontmatter 提取的 wikilink
    attachments: Vec<Path>, // 正文引用的本地附件
    // 派生(由索引计算,不落盘):
    backlinks: Vec<VaultPath>,
}
```

`Note` **不含 IO**,是纯数据。`core::parse(byte_slice, path) -> Note`。

## Frontmatter

- 文件首部可选的 YAML 块,由 `---` 分隔。
- **任意键,无强制 schema**。这是"软类型"的核心(见下)。
- 约定键(app 识别但不要求):
  - `type` — 软标签(任意字符串)。app 据此分组/着色,但**绝不校验、绝不阻止保存**。
  - `status` — 任意字符串,渲染为彩色 chip。
  - `tags` — YAML 列表或行内 `#tag`。
  - `created` / `modified` — `YYYY-MM-DD`,可选。
- 任何值里出现 `[[...]]` 的键,自动成为**关系**(见下)。

解析用 `serde_yaml` 到 `Map<String, Value>`,宽松:非法 YAML 不致命(降级为空 frontmatter + 警告,保留 body)。

## Wikilink(链接)—— 图谱的边

三种语法,全解析:

| 语法 | 含义 |
|---|---|
| `[[target]]` | 指向 `target.md`(或 title 为 target 的笔记) |
| `[[target\|显示名]]` | 同上,显示文本可定制 |
| `[[target#小标题]]` | 指向 target 内的某小标题(块级引用,v2) |

```rust
struct Link {
    target: LinkTarget,        // Resolved(VaultPath) 或 Unresolved(String) —— 后者即"悬空链接",图谱仍画虚边
    display: Option<String>,
    anchor: Option<String>,    // #heading
    source: LinkSource,        // Body(正文位置) | Frontmatter(键名) —— 决定边的"类型"
}
```

**解析顺序**(对歧义鲁棒):
1. 标题优先:`[[Alpha]]` 先找 title=="Alpha" 的笔记;找不到再找文件名 `alpha.md`;都没有则 `Unresolved("Alpha")`。
2. 大小写不敏感匹配 title;大小写敏感匹配路径。
3. 路径分隔:`[[projects/alpha]]` 显式相对路径。

**悬空链接不是错误** —— 它在图谱里画一条虚边,反向链接仍计数。这是知识图谱"想写就写"的关键。

## 关系(typed edge)

任何 frontmatter 键,只要值含 `[[...]]`,就是一条**带类型的关系**:

```yaml
---
type: Summary
source: "[[anthropic-building-agents]]"     # 关系键:source
mentions:
  - "[[entity-anthropic]]"
  - "[[concept-agent-security]]"
---
```

产生三条边,类型分别为 `source`、`mentions`。**图谱节点和边是统一的**:`core::graph` 把正文 wikilink(类型 `body`/`wikilink`)和 frontmatter 关系(类型 = 键名)合流进同一张图。

这让我们与 cairn/Tolaria 的关系模型(双向 `mentions`↔`mentioned_in`)兼容:双向性是**查询时计算**,不强求写入时维护。

## 类型(软)—— 与 Tolaria 的关键差异

| | Tolaria | OpenObsidian |
|---|---|---|
| `type:` | 强约定,驱动类型文档、模板、视图 | **可选标签**,仅用于分组/着色/默认视图 |
| 缺失 `type:` | 视图可能不收 | 完全正常,默认 `type: Note` |
| 校验 | 部分(类型文档暗示 schema) | **零校验**。永不阻止保存、永不报错。 |
| 类型文档 | 一等公民 | v1 不做(后期可选,且纯属 UI 提示) |

**设计意图**:类型是"给你看和给 agent 看的标签",不是约束你的笼子。`type:` 永远是 `Option<String>`。

## 标签

- 行内 `#tag`(正则提取,排除代码块/链接内)。
- frontmatter `tags:` 列表。
- 两者合流,等同对待。标签是"轻量分类",与 type 正交。

## 索引(VaultIndex)—— 派生物

```rust
struct VaultIndex {
    notes: HashMap<VaultPath, Note>,
    by_title: HashMap<String, VaultPath>,   // title → path(解析链接用)
    by_tag: HashMap<Tag, Vec<VaultPath>>,
    by_type: HashMap<TypeLabel, Vec<VaultPath>>,
    graph: Graph,                           // 邻接表 + 反向邻接(backlinks)
}
```

`VaultIndex` **不落盘**(派生物原则)。`core::index(Vec<(path, bytes)>) -> VaultIndex` 纯函数;`app` 层负责喂字节、做增量。

## 与 cairn 协议的兼容

OpenObsidian **原生读懂** cairn vault:识别 `type: Source/Summary/Entity/Concept`,把 `derived_into`/`mentions`/`mentioned_in`/`contradicts` 当作关系边画进图,把 cairn 的 `wiki-health` 当作一个 query 的结果页。即:OpenObsidian 可以直接作为 cairn 协议的 GUI 运行时。

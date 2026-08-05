# wiki-starter — LLM Wiki 起步脚手架

把一个空 vault 变成一台**可查询的知识复利引擎**:Raw(不可变源)→ Wiki(派生知识)→ Schema(类型契约)→ Navigation(索引)→ Health(度量反馈)。五层全靠 `type:` 软类型 + `[[wikilink]]` 关系边 + QQL 实时聚合,**不靠文件夹**。

> 这是 OpenObsidian 自带的方法论脚手架(MIT,原创)。它定义「怎么用类型和关系组织知识」,不绑定任何特定笔记格式。完整工作流见 [docs/14-llm-wiki-workflow.md](../../docs/14-llm-wiki-workflow.md)。

## 怎么用

1. 把本目录(`templates/wiki-starter/`)整个复制进你的 vault(放根目录或任意子目录均可——**文件夹不承载语义,`type:` 才是**)。
2. 看一眼 [`examples/`](./examples/) 里那组 Source → Summary → Entity → Concept 的示例,理解关系怎么连。
3. 开始你自己的摄取循环:**加一篇 Source → 写它的 Summary → 起对应的 Entity/Concept → 跑 Health 查询看健康度**。
4. 随时可删 `examples/`;`types/` 和 `health/` 留着当契约与仪表盘。

## 目录里的东西

| 路径 | 作用 |
|---|---|
| [`types/`](./types/) | 五个软类型的契约:`Source` / `Summary` / `Entity` / `Concept` / `Query`。每个是一篇 `type: Type` 的笔记,说明该类型的字段、关系与 `status` 取值。 |
| [`index.md`](./index.md) | Navigation 层:wiki 的目录 / 入口。 |
| [`health/`](./health/) | Health 层:5 条健康指标,每条是一篇 `type: Query` 的笔记,正文里是可直接跑的 QQL。 |
| [`examples/`](./examples/) | 一条最小示例链(Source→Summary→Entity→Concept),演示关系怎么连。可删。 |

## 三条铁律

1. **`status:` 是唯一状态真相。** 一篇 Source 是 `Unprocessed` 还是 `Digested`、一个 Concept 是 `Active` 还是 `Contested`,只看它的 `status:` frontmatter,不看文件夹、不看文件名、不靠记忆。
2. **Source 不可变。** 要更新就重新摄取:产**新** Summary,旧的标 `Superseded`。版本真相由 git 保证(`git restore` 可还原)。
3. **关系靠 `[[wikilink]]`。** Summary 在正文 / `mentions:` 里 `[[链接]]` 到 Entity/Concept,反链(`mentioned_in`)由图谱自动算出,不用手填。

## 跑 Health 查询

`health/` 里每篇笔记的 ```qql ``` 块就是一条 QQL。复制它,通过 MCP `run_qql`、或 core 直接求值即可:

```bash
# MCP(Claude Code / Cursor 等):把 QQL 字符串传给 run_qql 工具
# 命令行(core):见 docs/14 的「consolidate」段
```

这五条查询的语法与语义由 [`core/tests/wiki_health_qql.rs`](../../core/tests/wiki_health_qql.rs) 锁住,改引擎或改模板都会被测试挡下。

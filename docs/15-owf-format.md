# OWF-1:Open LLM Wiki Wiki Format v1(已生效 · 档 1 范围)

> **状态:✅ 已转正**(2026-08-09 人批准,**档 1** 范围)。
> 档 1 = **装订现状 + 钉版本**:零新词汇、零新字段、零行为改变。本文档不引入任何新机制——它把已经存在的约定写成单一契约,并给 vault 一个格式版本号。
> 档 2 候选项(draft / deprecated / stale_after)**未采纳**,其设计细节、触发信号与升级路径完整保留在 §9,供未来升级或回滚参考。

---

## 1. 为什么有这份规范

1. **反漂移**:约定此前散在 [docs/14](./14-llm-wiki-workflow.md) + `templates/wiki-starter/` + core 行为三处,已两次实证会漂移(README 工具数 6→7→8 两次追修)。格式变更从此必须显式 bump 版本 + 迁移说明。
2. **vault 自描述**:vault 靠 index.md 里一行 `format: owf/1` 自证格式版本——冷启动 agent 不依赖本 repo 文档也能读懂契约。
3. **宽容从偶然变承诺**:core 今天天然容忍未知 type/字段;本规范把它升为**测试锁住的保证**(§6,[`core/tests/owf_conformance.rs`](../core/tests/owf_conformance.rs))。
4. **词汇线归属**(背景):`Source/Summary/Concept/Entity + Active/Contested/Superseded + contradicts` 这条线谱系为 Karpathy LLM Wiki gist → 维护者 kb 库的 cairn 约定 → Open LLM Wiki;上游(refactoringhq)已转向 Portent(另一条线),公开世界无正统归属。本规范是它的家。对照调研:zosmaai/pi-llm-wiki 的 OKF v0.2(映射见 §8)。

## 2. 范围声明(档 1 边界)

| 在范围内 | 不在范围内(见 §9) |
|---|---|
| `format: owf/1` 版本声明(唯一新产物) | `draft` 成熟度值 |
| 既有类型/状态/关系词汇的成文化 | `deprecated` 终态值 |
| 宽容规则 + conformance 测试 | `stale_after` 字段 |
| 版本演进政策 | OKF 兼容层实现(仅映射表) |

## 3. 格式声明(唯一新产物)

vault 根 `index.md` 的 frontmatter 声明版本:

```yaml
---
type: Index
status: Active
format: owf/1
---
```

- **无声明的 vault**:按 owf/1 尽力解析,不拒绝服务(§6 宽容规则)。
- 模板已对齐:[`templates/wiki-starter/index.md`](../templates/wiki-starter/index.md)。

## 4. 环 1 核心约定(全部既有,仅成文化)

### 4.1 type:必填、自由值

- `type:` 是唯一必填 frontmatter 字段;**值永不校验、永不报错**(`type_of` 缺失/未知 → None,不拒绝)。
- 原生五类型(推荐词表):`Source / Summary / Concept / Entity / Query`;辅助:`Index / Type`。
- **未知 type 合法**:解析、索引、查询、lint 全链路容忍(环 3 自由区)。

### 4.2 status:自由字符串 + 标准词汇(唯一状态真相)

`status:` 本身是自由字符串(渲染/查询皆容忍任意值);标准词汇分两轴:

| 轴 | 词汇 | 语义 |
|---|---|---|
| **Source 生命周期** | `Unprocessed` → `Digested` | 待摄取 → 已产出 Summary(且 `derived_into` 已设) |
| **知识状态** | `Active` | 现行有效 |
| | `Contested` | 有未和解矛盾;必须有 `contradicts` 边(不变量 §7) |
| | `Superseded` | 被新版本取代(版本真相;宜有 `superseded_by` 指向) |

- 缺 `status` 不报错;lint 只对词汇内值做不变量检查。
- **状态只看 frontmatter**:不看文件夹、不看文件名、不靠记忆(与模板 README 一致)。

### 4.3 关系:wikilink 即边,键名自由

- 任何 frontmatter 键,值含 `[[wikilink]]` 即为关系边(`relationship_links`)。
- 命名推荐词表:`derived_into`(Source→Summary)、`source`(Summary→Source)、`mentions`(Summary→Entity/Concept)、`mentioned_in`(反向,**查询时计算,不强求写入**)、`contradicts`、`superseded_by`、`related` / `related_to`。
- **文件夹无语义**:意义在 type 与关系,不在路径。

## 5. 环 2 可选字段(既有,用了就得对)

| 字段 | 语义 | 状态 |
|---|---|---|
| `evidence_tier` | Source 证据质量五值(`independent_research` \| `industry_report` \| `analysis` \| `vendor_source` \| `opinion`) | 稳定约定 |
| `last_verified: YYYY-MM-DD` | 回顾性核实(Source 漂移检查用) | 稳定约定 |
| `aliases` | 别名(撞名消歧,lint L1-B 归一化桶) | 稳定约定 |
| `provenance: human\|agent\|ingested` | 谁写的 | **experimental**(探针期,见 doc 14 §3.1) |
| `reviewed: YYYY-MM-DD` | 上次人审(写 ≠ 复审) | **experimental** |
| `trust: 0-3` | 人审后的信任档 | **experimental** |

## 6. 宽容规则(新承诺,测试锁定)

1. **未知 type 合法**:任何 type 值不得使解析/索引/查询/lint 报错或丢弃。
2. **未知字段保留**:解析全量保留 frontmatter 键值;任何写入路径(app / MCP `write_note` / 手工)不得静默删除不认识的字段。
3. **缺省宽容**:无 `status`、无 `format` 声明皆合法。
4. **测试锁**:[`core/tests/owf_conformance.rs`](../core/tests/owf_conformance.rs) 断言 1–3;改 core 解析/索引若破坏宽容,会被它挡下。

## 7. 不变量(既有 lint L1,仅成文化)

| 不变量 | 实现 |
|---|---|
| `contradicts` 边 ⟺ 端点 `Contested`(双向一致) | `lint::contradiction_consistency`(L1-A) |
| Summary 不得挂在 Superseded 源上(退役对豁免) | `lint::summaries_on_superseded`(L1-D) |
| Active/Contested 不得引用 Superseded(豁免 contradicts/superseded_by) | `lint::refs_to_superseded`(L1-E) |
| 归一化 title/alias 撞名报桶 | `lint::duplicate_names`(L1-B) |

**政策进规范**:lint 只产**候选**,永不判决——status 与 contradicts 的变更永远是 agent/人经显式写入完成(与 doc 14 §3.2、OKF 的「矛盾不自动解」共识一致)。

## 8. OKF v0.2 互操作(仅映射表,无实现)

OWF 不是 OKF 超集(`contested/superseded` 过不了 OKF 严格校验);是 fork + 投影:

```
OWF ──导出──▶ OKF v0.2                    OKF ──导入──▶ OWF
Active/Digested → stable                  draft → draft
Unprocessed → draft(近似)                stable → Active
Superseded → deprecated                   deprecated → Superseded
Contested → stable + 正文 warning ⚠(唯一有损点)
```

## 9. 升级 / 回滚记录(档 2 细节存档)

### 9.1 版本政策

- **次版(owf/1.x)**:兼容性增补(加可选字段、加 status 推荐值)——向后兼容,旧 vault 不改仍合法。
- **主版(owf/2)**:语义变更或删值——须附迁移说明 + 迁移路径。
- 每次变更:同步本文档 + conformance 测试 + 模板。

### 9.2 档 2 候选项(**未采纳**,2026-08-09 人拍板只做档 1)

| 项 | 来源 | 设计 | 升级触发信号 | 升级时要动的地方 |
|---|---|---|---|---|
| `draft` 状态值 | OKF | 成型中、不可被引用;ingest 先落草稿、consolidate 转正;五分类 unresolved uncertainty 的落点 | 「半成型页没处放」的真实抱怨出现;或 ingest 工作流跑了几轮、确认需要成熟度斜坡 | 本文档 §4.2 词汇表;lint L1-A 排除 draft 页;模板类型文档;Health 计数单列 draft |
| `deprecated` 状态值 | OKF | 终态且无继任者(主张撤回/概念死胡同),区别于 Superseded(必有继任) | 出现「想标废弃但无替代页」的真实场景 | §4.2 词汇表;L1-E 并入 deprecated 终态检查 |
| `stale_after` 字段 | OKF | 前瞻性过期(`YYYY-MM-DD`);让 `health/stale-sources` 摆脱运行者手工插值 cutoff | 插值 cutoff 真的烦到人;或需要每源差异化过期政策 | §5 字段表;health/stale-sources 模板查询改写;可选与 last_verified 并存(历史 vs 政策) |

### 9.3 回滚记录:档 1 到底改了什么

回滚 = revert 下列改动即可,**零运行时影响**(标准是契约层,引擎不依赖它):

1. 本文档(`docs/15-owf-format.md`)——删除;
2. `templates/wiki-starter/index.md` frontmatter 的 `format: owf/1` 一行——删除;
3. `core/tests/owf_conformance.rs`——删除(core 行为不受影响,测试只锁既有属性);
4. 索引登记三行:docs/README 文档地图、FEATURE-INDEX、backlog `B-WIKI-FORMAT`——删除对应行。

## 10. 落地台账(档 1,2026-08-09)

| 动作 | 文件 |
|---|---|
| 规范转正 | 本文档 |
| 格式声明进模板 | `templates/wiki-starter/index.md` |
| conformance 测试 | `core/tests/owf_conformance.rs` |
| 索引同步 | `docs/README.md` · `docs/FEATURE-INDEX.md` · `docs/backlog.md`(`B-WIKI-FORMAT` ✅) |
| CI / 依赖 / 引擎 | **零改动** |

## 11. 参考

- 本仓库:[03-data-model](./03-data-model.md)(cairn 兼容节)· [07-llm-wiki-architecture](./07-llm-wiki-architecture.md) · [14-llm-wiki-workflow](./14-llm-wiki-workflow.md) · [research/agent-memory-survey](./research/agent-memory-survey.md) · `core/src/lint.rs` · `templates/wiki-starter/`
- 谱系:Karpathy LLM Wiki gist;维护者 kb 库 AGENTS.md(cairn 活体样本);refactoringhq/tolaria + Portent(旁系)
- 对照:zosmaai/pi-llm-wiki · OKF v0.2(`docs/superpowers/specs/2026-08-02-okf-v0.2-interoperability-design.md`)

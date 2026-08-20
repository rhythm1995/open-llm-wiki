# 05 — TDD 策略

## 核心信条

**先写测试,后写实现;没有失败的测试,不写实现代码。** 红 → 绿 → 重构,每循环一次提交一次。

整个项目的"逻辑密度"集中在 **`core`(Rust)** —— 解析、图谱、查询。这是 bug 高发区,也是 TDD 回报最高的地方。把这里测到接近 100%,前端和 IPC 主要是胶水,用组件测试 + e2e 兜关键路径。

## 当前实际测试栈(落地状态)

> 下面的「测试金字塔」是**目标**形态。当前实际落地(以 `ci.yml` + 各 `Cargo.toml`/`package.json` 为准):

| 层 | 目标 | 当前实际 |
|---|---|---|
| 单元(Rust) | cargo test 穷尽 | ✅ `cargo test --workspace`(core 109 测含 proptest + app `git_tests`/`preview`) |
| 单元(TS) | Vitest | ✅ `vitest` node 环境,纯逻辑 279 测(**不挂 DOM**) |
| 属性测试 | proptest 解析器防 panic | ✅ core 四模块(index/graph/qql/search)10 条 property × 256 例,断言永不 panic + 不变量 |
| 组件测试 | Vitest + @testing-library + jsdom | ✅ props-driven 模式(组件接 state/actions via props,最小 mock);3 组件代表性用例(TabBar/StatusBar/NoteListView) |
| e2e | Playwright 关键路径 | ✅ mock 模式 4 条 smoke(启动/打开笔记/图谱/新建笔记),CI 有独立 e2e job |
| 覆盖率门 | CI 强制 | ✅ vitest coverage-v8 门槛(statements 63 / branches 57 / functions 56 / lines 63,基线 −5% 防回归) |

> 当前状态一句话:**测试金字塔全层落地 —— 单元/属性/组件/e2e/覆盖率门齐备**。组件测试以 props-driven 模式为主(组件接 state/actions via props,最小 mock),ipc 直依赖处用 `vi.mock`(StatusBar/NoteListView)。这与 [02](./02-architecture.md)
> 的"前端纯逻辑可脱离 Tauri 测"一致——IO 薄壳在 `ipc.ts`,逻辑在 `lib/`,故纯逻辑测试先行。
>
> **已落地功能的缺口**(2026-08-20 盘点):core / `ui/src/lib` 纯逻辑基本齐;产品胶水与 IPC/MCP 契约曾薄。补测切片见 [plan.md §TDD](./plan.md) 与 [backlog §L](./backlog.md)(**L-1–L-5 已落地**;不挂整棵 `App.tsx`)。vitest 默认不计未被 import 的文件,覆盖率数字偏乐观。

## 测试金字塔

```
        e2e (Playwright)          ← 少而关键:打开 vault→建笔记→链接→见图谱→查询
       ───────────────────
     组件/集成 (Vitest + mock-tauri)  ← 中等:UI 逻辑组件、IPC 契约
    ────────────────────────────
   单元 (cargo test / Vitest)        ← 大量:core 纯逻辑全覆盖
```

## 分层策略

### `core`(Rust)—— 穷尽单测

- **纯函数,无 IO**:`parse(bytes, path) -> Note`、`index(notes) -> VaultIndex`、`graph(index) -> Graph`、`query(q, index) -> Result`。全是 `fn(&input) -> output`,测试零摩擦。
- **覆盖率门槛:≥ 95%(行 + 分支)**。CI 强制。
- **先写测试**:每个函数先写一个会失败的最小测试,再实现到绿,再加边界用例。
- **属性测试**(proptest)用于解析器:随机变异 markdown 输入,断言"解析永不 panic""frontmatter 非法时降级而非崩溃"。

### `ui`(React/TS)—— 组件测试 + mock-tauri

- **mock-tauri 层**(通用做法):把 `invoke()` 抽成接口,测试时换成内存 mock。前端组件可完全脱离 Tauri/文件系统测试。
- **测什么**:有逻辑的组件——图谱过滤交互、查询结果渲染、文件树状态机、属性面板校验。
- **不测什么**:纯展示组件的颜色/间距(那是视觉回归,用 Playwright 截图兜)。
- 工具:Vitest + @testing-library/react + jsdom。

### `app/src-tauri` —— IPC 契约测试

- Tauri command 是薄包装;测它的**契约**:给定 core 的输出,command 序列化/反序列化正确、错误映射正确。
- 少量集成测试:真起一个小 vault 目录,跑 `open_vault` 全流程。

### e2e(Playwright)—— 关键路径

只覆盖最重要的几条端到端流,每条都有视觉断言:
1. 打开 demo vault → 文件树显示 → 打开一篇笔记可编辑保存。
2. 在笔记 A 写 `[[B]]` → B 的反向链接出现 A → 图谱里 A-B 有边。
3. 建一个 ```qql ``` 块 → 渲染出实时列表 → 改 frontmatter → 列表自动更新。
4. 图谱:过滤某 type → 节点显隐正确。

## 红绿循环(逐条纪律)

对每个功能点:

1. **红**:写一个失败测试,描述想要的行为。`cargo test` / `vitest` 跑它,确认它因"功能不存在"而失败(不是因别的错失败)。
2. **绿**:写**刚好够**让测试过的实现。不超前实现。
3. **重构**:在测试保护下整理代码。
4. **提交**:`test: add …` / `feat: …`,小步前进。

## 反模式(禁止)

- 先实现再补测试(那是"测试后置",不是 TDD)。
- 测试依赖文件系统/网络/真实时间(core 测试必须是纯内存)。
- 一个测试断言十件事(测试要原子、失败时定位明确)。
- e2e 当单元测试用(慢、flaky)。

## 覆盖率与质量门(CI)

- `core`:≥ 95% 行覆盖,≥ 90% 分支。
- `ui`:≥ 70% 行覆盖(组件逻辑优先)。
- e2e:无覆盖率要求,但有"关键路径必须绿"。
- lint(clippy + eslint)+ fmt(rustfmt + biome)零警告。

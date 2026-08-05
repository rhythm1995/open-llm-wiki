# AGENTS.md — OpenObsidian

本文件是**任何编码 agent 在本仓库工作的单一事实来源**(Claude Code 经 `CLAUDE.md` 读它;Codex / Cursor / Grok 直接读它;人类也读它)。保持 agent-neutral。

## 项目一句话

本地优先、文件即真相、MIT 许可的知识管理 app;**原创实现**,补齐 Obsidian 最被需要的两件事:图谱可视化 与 QQL 实时聚合查询。

## 架构

```
ui (React 19 + Vite + Tailwind 4 + CodeMirror 6 + BlockNote 0.52)
        │  IPC(@tauri-apps/api invoke)
        ▼
app/src-tauri (Tauri 2 薄壳:文件 IO + #[tauri::command],无业务逻辑)
        ▼
core (Rust:解析 / 图谱 / QQL 求值 / 检索 —— 纯逻辑,IO-free,TDD)
```

- `core/` —— 纯函数、无 IO,proptest + 单测全守护。改逻辑先在这里加测试。
- `app/src-tauri/` —— 把文件读写 / git / core 串起来的命令层;**新增命令必须注册进 `run()` 的 `generate_handler!`**。
- `ui/` —— 三栏 UI;浏览器开发走 `src/lib/mock.ts` 内存后端,**无需编译 Rust 即可预览**。`ipc.isMock()` gate 桌面专用功能(git / Reveal in Finder)。

## 常用命令

```bash
# Rust core / app
cargo test  -p openobs-core                               # 纯逻辑测试
cargo clippy --manifest-path Cargo.toml --workspace --all-targets
cargo test  -p openobs-app                                # 含 git_tests,需系统 git

# 前端(都在 ui/ 下,从仓库根用 pnpm --dir ui 跑)
pnpm --dir ui dev            # 浏览器 mock 模式 → http://localhost:5173
pnpm --dir ui typecheck      # tsc --noEmit
pnpm --dir ui test           # vitest run(单测)
pnpm --dir ui test:cov       # 带覆盖率
pnpm --dir ui e2e            # playwright(脚本名是 e2e,非 test:e2e)
pnpm --dir ui build

# 桌面 app(tauri.conf.json 在 app/src-tauri/,必须从【仓库根】跑;勿用 --dir ui,会改 CWD 致发现失败)
ui/node_modules/.bin/tauri dev
ui/node_modules/.bin/tauri build
```

## CI 门(必须全绿)

`.github/workflows/ci.yml` 三 job:① **core-and-ui**:`cargo test -p openobs-core` + `pnpm --dir ui typecheck` + `pnpm --dir ui test:cov`;② **app**:`pnpm --dir ui build` + `cargo test -p openobs-app`;③ **e2e**:playwright。**无 biome / lint / format 门**——别花时间补这些。本地收工前至少跑:typecheck + test:cov + e2e + 涉及到的 `cargo test -p`。

## 提交规范

- **全英文** commit message,conventional commits 风格、按子系统拆(`feat(core):` / `feat(ui):` / `feat(store):` / `fix:` …)。
- message 末尾加 trailer:`Co-Authored-By: Claude <noreply@anthropic.com>`(或对应 agent)。
- **commit 正文只写技术改动**——不出现 licensing / 合规 / 协议 / agreement 类字眼,那些属于本文件与 README,不进 git 历史。
- 未被明确要求时**不要 commit / push**;push 前先确认。

## 许可红线(最重要)

- **绝不逐字或近似逐字复制任何 GPL/AGPL 等 copyleft 源码(哪怕单行)**。逐字复制的那部分仍受原许可约束,会让"MIT"落空。只参考公开的架构 / 数据流 / 算法思路与功能概念(多为不可版权的思想/方法);具体源码、组件实现、视觉表达一律自写。本项目是原创、独立的 MIT 实现。Obsidian 仅作公开功能对照,同样不复制其源码。
- 新增依赖:登记进 `THIRD_PARTY_NOTICES.md`;不得引入 GPL/AGPL 直染依赖;上线前 `cargo license` / `pnpm licenses list` 复核。

## 多 agent 协作

本仓库同时有 **Claude Code / Codex / Grok / Pi** 在用,但**串行交接、不同时干**——所以**单工作目录 + 分支隔离**就够,不需要多 worktree。核心事实:不同厂商 agent 是不同运行时,**没有共享上下文对象**;它们唯一共同拥有的是本 repo 的文件系统 + git。所以"同步上下文" = 把状态和决策纪律性地写进 repo 文件,开工读、收工写。**别去找同步中间件——那是死路。**

三层(杠杆从高到低):

1. **本文件(AGENTS.md)—— 跨 agent 约定层**。所有 agent-neutral 约定收口于此。**只读,人类维护,绝不让 agent 互改。**
2. **`WORKLOG.md` —— append-only 工作日志**。任何 agent **开工前读最近 ~10 条**,**收工后追加一条**(`### YYYY-MM-DD <agent> — 一句话` + 做了什么 / 理由 / 影响 / 下一步 / branch)。这是 agent 间真正的上下文交接载体:在 repo 里、有历史、可 diff。是可读叙事,不是状态机。
3. **分支隔离**。一个 agent / 一个任务一个 branch(`codex/<task>` / `grok/<task>` / `claude/<task>` 或 feature branch);在自己的 branch 上干,完工 commit + push,开 PR 回 `main`。下一个 agent `git pull` + 切自己 branch 再干。**PR review 是上下文汇合点**;GitHub Issues 当共享看板(谁领哪个任务)。别用 Claude Code 的 session 内 task system 跨 agent——它是 per-session 的,别的 agent 看不见。

**(可选,默认不上)共享 memory MCP server** —— 只有 repo 装不下的临时态才用。

**按工具适配**:能跑 git 的(Claude Code / Codex / Grok)三层全用;**Pi(纯对话,不碰 fs/git)只能吃第 1、2 层**——读本文件 + 读写 WORKLOG,其产出由一个会跑 git 的 agent 落地。

**两条纪律(守住即可):**

- **AGENTS.md 只读**(agent 不改约定层)。
- **WORKLOG.md append-only**(只追加新条目,不改历史)。

**失败模式**:① 两 agent 先后改同一处 → 靠 WORKLOG 提前打招呼,合并时解;② WORKLOG 没人写 → 退化成无同步;③ AGENTS.md 被当草稿本乱改 → 约定层污染。

## 指针

- 设计文档:[docs/](./docs/),先读 [docs/README.md](./docs/README.md)
- 待拍板:[docs/open-questions.md](./docs/open-questions.md)
- 路线图:[docs/06-roadmap.md](./docs/06-roadmap.md)
- 延后 / 难点:[docs/plan.md](./docs/plan.md)(后置 / 不做清单)
- 工作日志(开工先读):[WORKLOG.md](./WORKLOG.md)
- 许可清单:[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

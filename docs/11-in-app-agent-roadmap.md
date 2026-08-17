# 11 — 应用内侧栏 Agent(ACP 托管)· 规划

> **状态:✅ Phase 7 完工(2026-08-04)——第一版 Tier 1 + 完整 Tier 2 全部落代码、自测通过(§6 定义的 first-version scope 全覆盖)。** 详见 §10「实施状态」。第一版目标 = **Tier 1 + 完整 Tier 2(ACP)**(Tier 0 不含,见 §6),现已全部 ✅,无推迟项。
> **与 [12](./12-graph-and-agent-roadmap.md) 的关系**:doc 12 的 §6B 讲的是**外部 agent 经 MCP 读写 vault**(Claude Desktop / Cursor 连进来)。本文讲的是**应用内自己托管的 agent**(把 agent CLI 作为子进程拉起、侧栏里对话)。两条线互补:**外部**走用户级 MCP 配置;**应用内 ACP**在 `session/new` 注入本机 `open-llm-wiki-mcp` stdio(找不到二进制或适配器拒收则回退为空,不挡启动),让 `links` / `run_qql` / `lint_vault` 打到同一张 LiveVault `Graph`。
> **阶段命名**:本文 = **Phase 7**;内部按 **Tier 0 / Tier 1 / Tier 2** 分层(见 §6),与 Phase 6 的 6A–6D 并列、不冲突。
>
> **参考红线(逐字保留,实现期不得越线)**:
>
> | 来源 | 许可 | 借什么 | 绝不碰什么 |
> |---|---|---|---|
> | [inkeep/open-knowledge](https://github.com/inkeep/open-knowledge) | **GPL-3.0** | Agent 面**概念与 UX 心智**:线程模型、权限三档、活动面板、增量折叠渲染、移交语义 | **任何源码 / TS / React / CSS / 注释零拷贝**;不跟 TipTap/Yjs/Orama 主栈 |
> | ACP 协议规范 + `agent-client-protocol` Rust SDK | Apache-2.0(实现前以 crates.io / 上游为准复核) | 协议契约、Rust client trait | —(合法依赖) |
> | Agent CLI 们(claude / codex / cursor / gemini / opencode …) | 各自 | 用户**自装自配**,经 ACP 接入 | **绝不进入 Open LLM Wiki 分发物**;我们不分发、不打包任何 agent |
>
> 一句话:**协议层可依赖,GPL 项目只取概念,agent 二进制不随包。**

---

## 0. 这份文档是什么 / 不是什么

- **是**:应用内 agent 的**设计决策记录** + 研究结论沉淀 + 分层路线。供 Phase 7 开工时不从头再议。
- **不是**:实现规格(无 API 签名、无文件清单)、不是排期、不是承诺「现在做」。

---

## 1. 背景与差距

| | 外部 agent(doc 12 §6B) | 应用内 agent(本文) |
|---|---|---|
| 方向 | Open LLM Wiki = **MCP server**,被动等连 | Open LLM Wiki = **ACP client**,主动拉起 agent 子进程 |
| 宿主 | Claude Desktop / Cursor / 任意 MCP 客户端 | Open LLM Wiki 自己的侧栏 |
| 上下文 | 客户端自带,我们只给工具 | 我们要管对话、转录、移交 |
| 当前状态 | MCP 已落地(7 工具:`list_notes`/`read_note`/`write_note`/`links`/`search_notes`/`run_qql`/`vault_info`;README/backlog 口径仍写 6,见 §9.8) | **完全空白**——这是要补的差距 |

inkeep(open-knowledge)有应用内侧栏 agent,我们没有。用户判定这是真实差距,要补;且**第一版就做完整版**(完整 ACP,而非先做轻量终端),只是**不在当前阶段动工**。

**为什么值得做**:内置 MCP 已体现 inkeep agent 理念的 3/4 句(读即简报 / 写即反馈 / 索引是写出来的);缺的是**人在应用里直接和 agent 对话**这一闭环——不切到外部客户端、不丢当前笔记上下文。

---

## 2. 已确认设计决策

### 2.1 右栏 tab 化(区4 → 多 tab 容器)

- 现状:`App.tsx` 区4 是单用途 **Inspector**(反链 / 属性),仅 `showProps`(editor 视图 + 非特殊文件)时显示;注释明写「Inspector 暂不动内部结构」。
- 决策:**区4 升级为 tab 容器**,首屏两 tab:**Inspector** | **Agent**。区4 顶部留白足够放下 tab 条(用户已确认高度够)。
- **CenterToolbar 加一个专用 Agent 切换**(与现有 Nav/List/Props 的「Xcode 式面板切换簇」并列),点了直奔 Agent tab。
- Inspector tab 保留现有行为与内部结构不变;Agent tab 是新增量。
- **宽度(2026-08-04 补)**:区4 现固定 280px,ThreadView(气泡 + tool_call 卡 + inline 权限卡 + diff 折叠)摆不开。决策:**先试默认 300px**,且**所有栏统一改为可拖拽调宽,每栏配置最小值与默认值**(通用 UI 能力,非 agent 专属,见 B-COL-RESIZE);不够再统一调整。

### 2.2 单 Agent tab + picker(非「每个 agent 一个 tab」)

- 决策:**一个 Agent tab**,tab 内顶部是 **agent 选择器**(picker)+ 模式切换;切换 agent 在**同一 tab 内**完成,不开新 tab。
- 理由:
  - tab-per-agent 会把「跨 agent 协作」心智碎片化成 N 个窗口,与 Model C 的「移交」语义冲突。
  - 屏幕宽度:区4 已经是右栏,开多 tab 会挤压对话区。
  - 对标 Cursor:它也是**单面板 + 模式/模型切换**,不是 tab-per-model。
- picker 内容 = **已安装 agent 的运行时探测结果**(决策已修订,见下)。
- **探测策略(2026-08-04 修订,推翻「纯扫描、非硬编码」)**:核实发现 Claude Code / Codex 这两个最主流 agent **不是原生 ACP**,靠 npm adapter(如 `@zed-industries/claude-code-acp`)包装接入,纯运行时扫描恰好漏掉它们。改为**「配方表 + 探测」**:内置一份声明式「已知 agent 配方」数据表(二进制名 / `acp` 子命令或 `--acp` 标志 / npm adapter 安装命令),运行时探测哪些已装——装好的直接进 picker,未装的显示灰色条目 + 一键复制安装命令;另保留用户手填自定义项。配方是**数据不是逻辑**,开工时由 registry 生成/同步,不算回退到硬编码。

### 2.3 Agent tab 内部结构

```text
┌─ 区4 顶部:tab 条 [ Inspector | Agent ] ────────────┐
│ ┌─ Agent tab ─────────────────────────────────┐  │
│ │ [picker: claude ▾]  [模式: 普通 ▾]  [⋯]      │  │ ← 选择器 + 模式 + 菜单
│ ├──────────────────────────────────────────────┤  │
│ │  ThreadView(对话流)                          │  │
│ │   · user / assistant 气泡                     │  │
│ │   · tool_call 卡(默认折叠,失败/有 diff 自动展开)│  │
│ │   · inline 权限卡(读自动放行 / 高危询问)       │  │
│ │   · 活动条(本线程 agent 写了哪些文件,可撤销)   │  │
│ ├──────────────────────────────────────────────┤  │
│ │  Composer(底部输入框)                        │  │ ← 复用 ai-context.ts
│ │   · @ 药丸 = 当前笔记 + 链接邻居的 vault 上下文 │  │
│ │   · 单一动作槽:Send / Stop(运行中)/ Queue    │  │
│ └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

- **Composer 复用 `ui/src/lib/ai-context.ts`**:它已经能「复制当前笔记 + 链接邻居正文为 LLM 友好 markdown」,天然就是 composer 的 `@`-context 种子——不重复造。
- ThreadView 的渲染模型见 §5(借鉴 OK 的**增量折叠 + copy-on-write**,概念 only)。

### 2.4 上下文共享 — **Model C**(已确认)

这是本路线最关键的设计决定。先拆清两种「上下文」:

| 上下文种类 | 内容 | 跨 agent 共享? | 成本 |
|---|---|---|---|
| **Vault 上下文** | 当前笔记、链接邻居、frontmatter、图邻接 | **✅ 免费、天然共享** | 走**同一个内置 MCP server**,所有 agent 读到的库状态完全一致——这条已经成立,不用做 |
| **对话上下文(转录)** | 你和上一个 agent 的来回对话、它调了哪些工具、改了什么 | **❌ 难点** | ACP 的 `session/resume` **只认同一 agent**;不同 agent 的 system prompt / tool schema 不同,历史不可直接灌 |

**Model C = 线程与 Agent 绑定的骨干 + 显式「移交」操作**:

1. **骨干(默认行为,抄 OK 的稳健点)**:线程与 agent 绑定。picker 切 agent = **结束当前线程 / 开新线程**,而非把历史搬到新 agent。这与 ACP 的 `session/resume` 同 agent 语义一致,不破坏任何 agent 的契约。
2. **显式移交(用户主动触发)**:一个 **「移交给 X」** 动作——把当前线程**归一化**成一份摘要,作为**新 agent 线程的 seed user message**(role=user),而非伪造 assistant 历史。
3. 为什么是 seed 而非历史灌入:各 agent 的 system prompt / tool schema 不同,伪造一条「别的 agent 说过的话」会破坏对方契约;seed 是干净的「给新 agent 的一段用户简报」,任何 agent 都吃。

**转录归一化规则(移交时生成,非实时)**:

- **保留**:user 的文本消息、assistant 的文本回复、**当前 vault `@`-context 快照**。
- **压缩成一行**:旧 agent 的 tool_call 结果——`read X.md` / `write Y.md(+12/-3)` / `links dead` 这类,归一成 `「(claude 在笔记 X 写入 Y,在 Z 新建孤儿)」`式的人类可读条目。
- **丢弃**:旧 agent 的内部 thinking 块、permission 往返、逐 token 增量、已失效的中间态。
- **产物**:一段 markdown,头部一句话交代「承接自 <agent> 的线程」,下面是归一化后的对话骨架 + 当前库上下文。
- **diff 统计的出处(2026-08-04 补)**:ACP 的 update 流不携带行数 diff。`write Y.md(+12/-3)` 这类条目要靠宿主在 **fs 写回调里对 pre-image 自行 diff**(写入前读旧内容,与请求内容比对)算出来,随 tool_call 记录进转录,归一化时才有数可用。

**为什么不是另外两种**:

- **Model A(纯线程绑 agent,无移交)**:最简单、最稳,但跨 agent 协作只能靠人脑记 / 手动复制——inkeep 就是这个,我们嫌它不够。
- **Model B(Cursor 式单一共享转录)**:Cursor 是**自己拥有整个模型栈**,能保证转录格式一致;我们**聚合多个独立 agent CLI**,做不到格式一致,硬塞历史会坏契约。所以不照搬。
- **Model C(骨干 A + 显式移交)**:日常单 agent 时和 A 一样稳;需要跨 agent 时用「归一化 seed」桥接,既不破坏契约又能传递上下文。**已选。**

---

## 3. 架构(Rust 主线)

```text
┌─ React UI (Agent tab / ThreadView / Composer) ─────────────┐
│        ▲ Tauri event / invoke                              │
└────────┼───────────────────────────────────────────────────┘
         │
┌─ Tauri 2 主进程 (Rust) ─────────────────────────────────────┐
│  · ACP client  ←─ agent-client-protocol crate (Apache-2.0)  │
│  · agent 子进程生命周期(spawn / 进程组 kill / resume)        │
│  · 内置 MCP server(同一进程内,agent 经 ACP fs 工具落到它)   │
│  · 转录持久化(本地 SQLite)                                 │
│  · git 归因提交(§4)                                        │
└─────────────────────────────────────────────────────────────┘
         │ stdio JSON-RPC (ACP)
         ▼
   agent CLI 子进程(claude / codex / cursor / gemini / opencode …,用户自装)
```

- **Tauri 主进程 = shell + ACP client 二合一**:比 inkeep 的 Electron 简单——inkeep 要 `desktop`(spawn 包络)+ `server`(协议)+ `app`(UI)三件套;Tauri 的 Rust 主进程直接就是 shell + client,少一层。
- **官方 Rust ACP SDK**:`agent-client-protocol` crate(Zed 编辑器同款)。**2026-08-04 复核:crates.io 现版 v2.0.0(2026-07-23),许可 Apache-2.0 属实**;API 为 `Client::builder() → connect_with → ActiveSession` 形态,与旧文「实现其 `Client` trait(fs/terminal/permission 回调)」的描述**未必吻合**(0.x→2.0 有破坏性变更)——**开工前必须按 v2 API 面重新确认宿主回调(fs / terminal / permission)的接法**。无论形态如何,都不必自己手撸 JSON-RPC 协议帧。
- **Agent 生态(2026-08-04 复核,修正「~38 原生」)**:ACP 获 JetBrains / Google / GitHub 等采用,**25+ agents**。原生支持:opencode / gemini-cli / copilot-cli / qwen-code 等;**Claude Code、Codex 经 npm adapter 接入**(如 `@zed-industries/claude-code-acp`,是 npm 包装器,不是 CLI 自带标志)——这直接导致了 §2.2 探测策略修订为「配方表 + 探测」,且意味着 **Node 运行时接近必需**(§9.3 权重上调,B-AGENT-PATHFIX 需覆盖 Node 探测)。**我们写零个 agent**,只做宿主。
- **macOS GUI path 病**:从 Finder/Dock 启动的 app 继承 launchd 的最小 `PATH`,常找不到 agent CLI / node / git。用 `fix-path` / `shell-env` 这类 Rust crate 在启动时补齐用户 shell 环境(已有先例可循)。
- **子进程生命周期由 Rust 主进程持有**:spawn 包络 + **进程组 kill**(避免孤儿);线程 = 一个 agent 子进程 + 一段 stdio 会话。
- **转录持久化 = 本地 SQLite**:比 inkeep 的服务端 retained log 更简;表结构 ≈ `threads(id, agent, created) / messages(id, thread_id, role, normalized_text, raw_blob, ts)`。`raw_blob` 留原始帧备查,展示用 `normalized_text`。**边界(2026-08-04 补)**:db 放 app support 目录,**每 vault 一个 db + WAL**;转录是应用数据、不是 vault 知识——不进 vault、不进 git(不与「文件即真相」冲突);「线程导出为 md 入 vault」记为可选 backlog,不在 v1。
- **并发语义(2026-08-04 补)**:v1 **单活动线程**——与 §2.2「picker 切 agent = 结束当前线程」和单一动作槽自洽;一个线程 = 一个 agent 子进程 + 一段 stdio 会话,不允许同时跑多个。并行线程推迟再议。
- **主进程 → React**:Tauri event(或 tokio-tungstenite WS,若事件粒度太粗)。增量折叠渲染见 §5。

---

## 4. 观测 / 撤销:git 归因活动面板(Tier 1,但属完整愿景)

inkeep 的活动面板有两层,我们只取其**可移植**的那层:

| inkeep 的层 | 实现 | 可移植性 |
|---|---|---|
| **实时层** | `Y.UndoManager.undoStack` 纯 CRDT 内省(文件头直写 "No git, no disk") | ❌ 不可移植——我们不用 Yjs CRDT |
| **持久层(Timeline)** | git 影子仓库,每次写入带 `writer` 引用(`agent-` / `principal-` / `file-system` / `git-upstream`) | ✅ **可移植**——这就是我们的骨架 |

**我们的方案(2026-08-04 修订:骨干从「拦截 write_note」改为「turn 级 git 快照」)**:

- **归因骨干 = turn 级 git 快照**:每个 agent turn 前后对工作树各打一次快照,差异提交到 per-agent ref。与写路径**无关**——经 ACP fs 工具、MCP `write_note`、**还是 terminal/shell 直接落盘**的写全部捕获。(原假设「所有 agent 写都落到 MCP `write_note`」不成立:ACP agent 可经 terminal/shell 工具直接写盘,完全绕过拦截点;停靠终端 Tier 0 更是整条绕过。故降级为标注层,见下。)
- **语义标注层 = 写入点**:MCP `write_note` / ACP fs 回调在此注入 `writer` 归因 + 记录 pre-image(供 §2.4 移交归一化与 diff 统计)。标注层**只提供元数据,不承担覆盖率**;漏标的写仍被快照兜住,只是少了「谁写的」标签。
- **Ref 位置 = 混合**:vault 本身是 git 仓库 → 归因提交进 **in-vault `refs/agents/<agent-id>`**(各自前进,`HEAD` / 主工作树不污染,`git show-ref` 可见、默认 `push` 不外传);vault 非 git 仓库 → 自动落到**影子仓库**(独立 git 目录镜像 vault,零污染用户文件)。两条路径对用户透明,不强制 init。
- **与用户 git 历史的关系 = 可配置,默认隔离(quarantine)**:默认 agent 写**不进 HEAD**——活动面板给「采纳(合入 HEAD)/ 撤销」两键,用户完全掌控;此乃现状的自然延伸(现有「结构操作自动提交进 HEAD」只覆盖应用内创建/删除/重命名,MCP/ACP 写路径本就不经过它)。可选「即时提交」模式:agent 写与用户结构操作同等待遇直接进 HEAD(author / trailer 区分),per-agent ref 仍留作回滚镜像。
- **面板 = git log/diff/revert 驱动**:活动条列出「本线程 agent 写了 X.md(+12/-3)」,点开看 diff,**一键 revert**(= 将该 ref 上对应提交**逆向 apply** 回工作树,而非 `git revert` 动 HEAD)。
- **覆盖率 ~90% 等价 inkeep**:实时层(边写边闪烁)我们没有,但「谁改了什么、能撤」这件**人真正需要**的事,git 骨架全覆盖。且对所有 agent 一视同仁(含外部 MCP 客户端与停靠终端),不绑 ACP。

---

## 5. 借鉴 OK 的 UX 概念(GPL-clean,仅心智不拷码)

下列皆为**概念 / 交互心智**,实现全部自写,不碰 OK 源码:

- **inline 权限卡**:tool 调用需要授权时,卡内嵌在对话流里就地问,不弹模态。三档:读类自动放行 / 白名单始终允许 / 高危逐次询问。
- **单一动作槽**:Composer 底部那个按钮,运行中显示 Stop、空闲显示 Send、排队显示 Queue——永远只有一个主动作,不并列。
- **tool_call 默认折叠**:成功调用折叠成一行;**失败自动展开**;带 diff 的长输出**二级折叠**(只露摘要,点开看全 diff)。
- **增量折叠 + copy-on-write 渲染模型**:流式输出时,已渲染的稳定段落不重绘,只追加增量——避免长对话卡顿。这是渲染策略,不是协议。
- **permissive-mode 琥珀点**:宽松权限模式开启时,UI 给一个常驻视觉提示(琥珀色点),让人意识到「现在 agent 写东西不问你了」。
- **handoff dispatcher**:N 个入口(命令面板 / Composer 斜杠 / picker / 活动条)× M 个目标(各 agent)的组合,统一走一个 dispatcher,避免散落实现。对应 §2.4 的「移交」动作。
- **高危操作始终门控(2026-08-04 重映射)**:inkeep 的五类(delete / move / share_link / install / import)是它自家表面,开工时须映射到 Open LLM Wiki——至少 **笔记删除、重命名/移动、破坏性覆盖** 恒门控,无论权限模式多宽松。**点破存在理由**:vault 内容会进 agent 上下文,即 **不可信输入**——恶意笔记诱导 agent 写/删(prompt injection)是真实攻击面,这些门控就是为它存在的。

---

## 6. 分层路径(Tier 0 / 1 / 2)

第一版目标 = **Tier 1 + 完整 Tier 2**(Tier 1 git 归因面板属完整愿景,见 §4;§1 已定「不先做轻量终端」,故 **Tier 0 不在第一版**,留作可选 backlog)。下表是分层(也即若要分批的可拆法),**不是**承诺按序逐级发布——用户已定第一版直接 Tier 2。列出来是为了让「完整版到底完整在哪」有参照。

| Tier | 内容 | 对标 inkeep | 依赖增量 |
|---|---|---|---|
| **Tier 0** | 停靠终端:把系统终端嵌进侧栏,用户手动跑 agent CLI | inkeep「Open with AI」的轻量路径(MCP) | `xterm.js` + Rust `portable-pty` |
| **Tier 1** | git 归因活动面板(§4)+ inline 权限雏形 | inkeep Timeline 持久层 | turn 级 git 快照 + per-agent ref(in-vault / 影子)+ 采纳/revert 面板 |
| **Tier 2** | **完整 ACP**:Rust ACP client + agent 子进程托管 + ThreadView + Composer + Model C 移交 + 转录 SQLite | inkeep ACP 线程(重量级路径) | `agent-client-protocol` crate + path 修复 + 全套 §5 UX |

**第一版 = Tier 1 + Tier 2(完整 ACP),但不是现在。** Tier 0 不在第一版(§1 已定「不先做轻量终端」);分层只是「若想分批」的切法,不是必经台阶。

---

## 7. Backlog ID 速查(Phase 7 开工后 · 状态见 §10)

| ID | Tier | 状态 | 项 |
|---|---|---|---|
| B-AGENT-SHELL | 2 | ✅ | Tauri 主进程 = ACP client + 子进程托管(spawn+stdio+kill_on_drop + 进程组 kill 均由 `AcpAgent` SDK 封装);**存活检测** `agent_alive`(`Arc<AtomicBool>` + 脏退出 emit + 前端轮询复位)+ resume 边界已定(§3 模块文档) |
| B-AGENT-SDK | 2 | ✅ | 接 `agent-client-protocol` **v2.0.0**(spike 已验证);按 `Client::builder().on_receive_request(.., !()).on_receive_notification(.., !())` 注册 fs/permission/terminal/通知闭包 |
| B-AGENT-PATHFIX | 2 | ✅ | macOS GUI path 病修复(`fix-path` / `shell-env`);**含 Node 运行时探测**——npm adapter(claude/codex)依赖它 |
| B-AGENT-PICKER | 2 | ✅ | picker UI:**声明式 agent 配方表(原生 + npm adapter)+ 运行时探测 + 用户自定义**;未装条目置灰 + 一键复制安装命令(§2.2) |
| B-AGENT-THREADVIEW | 2 | ✅ | ThreadView + 增量折叠渲染 + **tool_call 折叠/二级折叠(失败自动展开)**(`ToolCard.tsx`)+ inline 权限卡 |
| B-AGENT-COMPOSER | 2 | ✅ | Composer,**`@`-context 药丸**(发送时附当前笔记 + 邻居正文,复用 `buildAiContextMd`)+ 单一动作槽(Send / Stop / **Queue**) |
| B-AGENT-CTX-MODELC | 2 | ✅ | Model C 上下文共享:**线程绑 agent 骨干 + 显式移交**(归一化 seed 作新 agent 新线程首条 user 消息,`normalizeForHandoff`)+ 转录归一化(§2.4) |
| B-AGENT-TRANSCRIPT | 2 | ✅ | 转录持久化(本地 SQLite:**threads 表 / messages / raw_blob + WAL**);每 vault 一 db 落 app data,不进 vault/git |
| B-AGENT-GIT-ATTR | 1 | ✅ | git 归因活动面板:**turn 级快照 → per-agent ref(in-vault / 影子混合)→ log/diff + 采纳(合入 HEAD)/ 撤销**;HEAD 关系可配、默认隔离(§4) |
| B-COL-RESIZE | 2 | ✅ | 通用栏宽拖拽:各栏(含区4)可拖拽调宽 + 可配最小/默认值;Agent tab 首试默认 300px(§2.1) |
| B-AGENT-PERM | 2 | ✅ | 权限三档(**读类自动 / 宽松模式非高危自动放行 / 高危逐次门控**)+ permissive-mode 琥珀点(§5) |
| B-AGENT-RIGHTCOL-TABS | 2 | ✅ | 区4 tab 化(Inspector \| Agent)+ CenterToolbar 专用切换 |
| B-AGENT-TIER0-TERM | 0 | ⛔ 不在第一版 | (可选)停靠终端:`xterm.js` + `portable-pty` |

> 状态图例:✅ 完整 · ⛔ 不在第一版。**第一版(Tier 1 + 完整 Tier 2)全部 ✅**(见 §10)。这些 ID 已回填进 [backlog.md](./backlog.md) §K。

---

## 8. 明确不做(本路线内)

- **拷贝任何 inkeep 源码 / TS / React / CSS / 注释**(GPL 红线,零容忍)。
- **分发、打包、捆绑任何 agent CLI**(用户自装自配;我们只做宿主)。
- **伪造跨 agent 的 assistant 历史**(破坏对方 system prompt / tool schema 契约;Model C 用归一化 seed,不用伪造历史)。
- **上 Yjs / Hocuspocus CRDT 协作栈**(inkeep 的实时活动层绑定 CRDT,我们不跟;活动面板走 git 骨干,§4)。
- **实时「边写边闪」的活动层**(不可移植,且非人真正所需;git 归因已覆盖「谁改了什么、能撤」)。
- **Skills marketplace / 全 harness 一键注入**(与 doc 12 §9 一致;最多文档级配置样例)。
- **现在就实现**(plan 阶段;本表是开工前的护栏)。

---

## 9. 待决 open questions(开工前要拍)

1. **ACP SDK 版本与许可复核**:✅ 已核 **+ 实测 spike(2026-08-04)**——crates.io `agent-client-protocol` **v2.0.0**,许可 **Apache-2.0 属实**,编译通过;与 `opencode acp`(原生 ACP,无需 adapter)完整 round-trip 成功:init→new_session→prompt→流式 `AgentThoughtChunk` / `AgentMessageChunk` / `UsageUpdate`→`EndTurn`。**v2 客户端 API 形态(更正旧描述)**:不再是「实现 `Client` trait」,而是 `Client::builder().name(..).on_receive_request(async |req, responder, conn| {..}, on_receive_request!()).on_receive_notification(async |n, cx| {..}, on_receive_notification!()).connect_with(transport, |conn| async {..})`——**按方法注册闭包**,覆盖 fs(`ReadTextFileRequest`/`WriteTextFileRequest`)/permission(`RequestPermissionRequest`)/terminal/通知(`SessionNotification`),等价于旧 trait。**子进程托管简化**:`AcpAgent::from_str("opencode acp")` 已封装 spawn + stdio + kill_on_drop,直接当 transport 传 `connect_with`——B-AGENT-SHELL 的手动 spawn 包络大幅复用它即可。
2. **Agent 探测策略**:✅ 已定(2026-08-04)——配方表 + 运行时探测 + 用户自定义(§2.2)。**遗留**:配方表数据源(手写维护 vs registry 自动同步)与更新节奏。
3. **Runtime consent**:agent CLI 常依赖 Node / uv / Python;**因 claude/codex 走 npm adapter,Node 接近必需,本项权重上调**。缺运行时时 v1 是「报错让用户装」还是「引导下载」?(inkeep 有 managed runtime,v1 可先不做。)
4. **二进制下载 + sha256**:若提供 agent / runtime 下载引导,校验策略。
5. **Mode / config 表面**:agent 自报的 `configOptions` 如何映射到 picker 旁的「模式」下拉(§2.3 占位);「写入语义(隔离/即时提交)」开关也归这个表面。
6. **多窗口 / 多 vault**:多个 vault 窗口各自跑 agent 时,子进程 / 转录库的隔离边界。转录库方向已定(每 vault 一 db + WAL);**遗留**=子进程归属与窗口关闭时的善后(kill or 留存)。
7. **标注层注入点**:归因骨干已改为 turn 级快照(§4,不再依赖拦截);**遗留**=`writer` 语义标注在 core / mcp / Tauri 命令层哪儿加最干净——只影响元数据完整度,不再影响覆盖率。
8. **README / backlog 的 MCP 工具数口径**:代码已 7 工具(`links` 已落地),README/backlog 仍写 6——doc 12 §6B 的收尾项,本文仅记录该 drift,不在本路线内修。

---

## 10. 实施状态(2026-08-04 开工,完整版)

Phase 7 已完工:第一版 **Tier 1 + 完整 Tier 2** 全部落代码、自测通过(§6 定义的 first-version scope 全覆盖)。下表是「实际交付到哪一层」。

### 已落地(第一版 = Tier 1 + 完整 Tier 2)

- **ACP 主线(B-AGENT-SHELL / SDK)**:`app/src-tauri/src/acp.rs`。一条专用 OS 线程跑 current_thread tokio runtime + `block_on(connect_with)`;前端经 mpsc 通道投递意图,agent 回调经 `AppHandle.emit` 推前端。fs(permission / ReadTextFile / WriteTextFile,均带 vault-root 边界)+ notification 闭包齐全。`AgentEmitter` trait 把 emit 抽象掉,**无 GUI 也能对真实 `opencode acp` 跑通整条闭环**(见 ignored 测试 `opencode_roundtrip`)。子进程 spawn + 进程组 kill 由 `AcpAgent` SDK 封装(kill_on_drop,无孤儿)。
- **存活检测(B-AGENT-SHELL 完整)**:`AcpState` 持 `Arc<AtomicBool>` alive 标志,专用线程进入置 true / 退出置 false;`agent_alive` 命令供前端轮询,子进程**意外退出**(非用户 stop)时线程退出额外 `emit("agent-error", …)` 即时复位;前端 3s 轮询兜底。resume 边界(同 agent 才能续,跨 agent 走 Model C)写入模块文档。
- **PATH 修正(B-AGENT-PATHFIX)**:`acp::augment_path()`,setup 首行跑一次;合并登录 shell PATH + 常见安装目录(homebrew / cargo / pnpm / bun),GUI 启动也能 `which` 到 agent。
- **picker / ThreadView / Composer / 权限卡(B-AGENT-PICKER / THREADVIEW / COMPOSER / PERM)**:`ui/src/components/AgentPanel.tsx`。配方表(opencode 原生 + claude-code npm adapter)+ 运行时探测置灰;流式增量累积进 agent 气泡;**tool_call 折叠卡**(`ToolCard.tsx`,失败自动展开 + 长输出二级折叠);inline 权限卡(approve/deny)→ `RequestPermissionRequest`;Composer 单一动作槽(Send / Stop / **Queue 排队**)+ **`@`-context 药丸**(发送时附当前笔记 + 邻居正文)。
- **Model C 跨 agent 移交(B-AGENT-CTX-MODELC)**:线程绑 agent 骨干;picker 切 agent = 新线程;显式「移交」把当前线程归一化(`normalizeForHandoff`:留 user/agent 文本 + vault 上下文,工具压一行,丢 thinking/permission)为新 agent 新线程的首条 user 消息,不伪造跨 agent assistant 历史。
- **转录持久化(B-AGENT-TRANSCRIPT 完整)**:`app/src-tauri/src/transcript.rs` + SQLite(bundled),**threads 表 + messages + raw_blob + WAL**;每 vault 一 db 落 app data 目录(不进 vault/git);挂载回放最近线程 + user/agent/tool/error 边界落库。
- **权限三档(B-AGENT-PERM 完整)**:正常模式逐次 approve/deny;**宽松模式**(permissive)非高危自动放行 + 头部琥珀点常驻提示;**高危操作**(删除/重命名/移动/破坏性覆盖,启发式)恒门控,无论模式。
- **git 归因活动面板(B-AGENT-GIT-ATTR,Tier 1 + 完整)**:`app/src-tauri/src/git_attr.rs` + `ui/src/components/AgentActivity.tsx`。turn 前后各打一次快照进 `refs/agents/<id>`(**不动 HEAD**、临时 index 不污染用户暂存区);**影子仓库**(非 git vault → `<vault>/.open-llm-wiki/agent-shadow.git`,vault 零 `.git` 污染);活动面板列 post-turn 写入、看 diff、**采纳(只提交该轮文件入 HEAD,不带走用户暂存的其它改动)/ 撤销(`git apply --reverse` 回工作树)**。
- **区4 tab 化 + 通用栏宽拖拽(B-AGENT-RIGHTCOL-TABS / B-COL-RESIZE)**:Inspector \| Agent tab;三栏可拖拽调宽并持久化。

### 完工复核 · 补齐的 9 项(2026-08-04)

完工后对「功能 v1」做了一次诚实复核,发现 9 处与「完整 Tier 2」之间仍存的缝隙,已全部补齐(此前 §10 把若干已做项仍记作「近似 / 推迟」,现修正):

- **ACP 终端闭环(§9.1)**:`CreateTerminal` / `TerminalOutput` / `WaitForTerminalExit` / `KillTerminal` / `ReleaseTerminal` 五个回调全实现;run-and-capture 模型 + 进程组 kill(`process_group(0)` + `kill -KILL -<pgid>`);终端创建恒标高危(§5)。
- **权限白名单档(§5 第二档)**:按工具稳定分类(read/edit/search…)的持久白名单——勾「始终允许此类」后同类(非高危)自动放行;delete/move/execute 等高危类后端不发 kind,永不进白名单。
- **`@`-context 选择器 popover(§2.3)**:`@` 药丸点开候选列表(当前笔记 + 外向邻居,不预取正文),勾选子集随发送附正文;切换笔记后重取候选并保留交集。
- **标注层 writer 注入 + 行 diff(§4 / §2.4)**:`FileWritePayload{path,writer,added,removed,created}`;fs 写回调读 pre-image、LCS 行 diff 算增删行数(>8000 行回退集合差);`write Y.md(+12/-3)` 的统计由此而来,供 Model C 归一化。
- **即时提交模式(§4 可配)**:`SetInstantCommit` + `instant_commit: AtomicBool`;on 时每轮写完成自动 `adopt_turn`(合入 HEAD),per-agent ref 仍留作回滚镜像;默认 off=隔离。原记作「后续可加」,已落地。
- **mode / config 下拉(§2.3)**:agent 声明的会话模式 / 配置选项由 `agent-session-info` 填充,渲染 mode `<select>` + config 布尔勾选 / 选项下拉,调 `agent_set_mode` / `agent_set_config_option`。
- **多窗口 / 多 vault 隔离 + 关闭善后(§9.6)**:窗口 `CloseRequested` → `stop_state`(清线程、发 Stop);换 vault `openVault` 先 `agent_stop`,子进程归属与善后边界闭合。
- **Node 缺失运行时引导(§9.3)**:探测 Node 一次;对需 Node 却未装的 agent,安装指引前置「⚠ 需要 Node 运行时」,不只报未安装。
- **历史会话切换 UI(§3 转录)**:`agent_thread_list` 驱动的「历史会话」浮层(agent 标签 + 相对时间 + 消息数 + 删除);点击回放到对话视图;活动会话期间禁用切换,避免污染活动线程的 persist 目标;历史回顾态把 Composer 换成「开启新会话」入口。挂载自动回放最近线程(此前回放数据被 picker 视图遮蔽,现已可见)。

### 验证

- `cargo build`:clean,无 warning。
- `cargo test --lib`:**38 passed / 1 ignored**(ignored = `opencode_roundtrip`,需真实 opencode;spike 期已手动验证 PONG)。覆盖:git_attr(ref 落点 / post diff 纯写入 / revert 逆向 apply / 非 git vault 走影子仓库 / 采纳入 HEAD 不污染暂存区)、transcript(多线程 + 级联删除)、acp(终端 run-and-capture 输出与退出码、`is_high_risk_value` 危险动词、`tool_kind_slug` 白名单键、`line_diff` 增删/编辑/相等/大文件回退、`serve_output_*`)。
- `npx tsc --noEmit`:clean。`agent-session.test.ts` 6 测试覆盖 SessionUpdate 解析 + Model C 归一化。
- `npx vitest run`:**550 passed**(56 文件)。`npx vite build`:clean。
- 真机端到端(`cargo tauri dev`)需本机装 opencode / claude-code,留作用户验收。

### 已知近似(不阻塞首版,记为后续)

下列是**已知近似口径**,非「功能 v1 残缺」,首版可验收:

- **归因混入**:turn 期间用户若同时编辑,会与 agent 写入混入同一 post diff(§4 归因口径已知近似;标注层 `writer` 注入可后续细化,只影响元数据完整度,不影响覆盖率)。
- **存活检测口径**:`agent_alive` 以专用线程存活代理子进程存活;子进程被外部 SIGKILL 时,连接报错 → 线程退出 → alive=false + emit,口径一致。

### 整体推迟

- 无。第一版(Tier 1 + 完整 Tier 2)无整体推迟项,仅真机端到端验收留作用户。

---

## 11. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-08-04 | 初版:右栏 tab 化(区4)+ 单 Agent tab + picker + Model C 上下文共享(含 vault↔对话拆分、移交归一化规则);Rust ACP 主线架构;git 归因活动面板(Tier 1);OK UX 概念清单(GPL-clean);分层 Tier 0/1/2,第一版 = 完整 Tier 2;B-AGENT-* backlog 占位。状态:plan,不实现。 |
| 2026-08-04 | 评审修订(用户拍板 4 项 + 自主核实):①picker 由「纯扫描非硬编码」改**配方表 + 探测 + 自定义**(claude/codex 走 npm adapter,纯扫描漏掉);②§4 归因骨干由「拦截 write_note」改 **turn 级 git 快照**,write_note 降为语义标注层;ref 位置改**混合**(in-vault `refs/agents/*` / 影子仓库),HEAD 关系**可配、默认隔离(quarantine)**;③事实核新:ACP SDK **v2.0.0 / Apache-2.0 属实**但 API 面待开工复核;「~38 原生」修正为「25+ 采用,主流二者经 adapter」,Node 接近必需(§9.3 上调);④区4 宽度先试 300px + **所有栏可拖拽(配最小/默认值)**,新增 B-COL-RESIZE;补 v1 单活动线程、转录每 vault 一 db + WAL、移交 diff 统计靠 fs 回调 pre-image、高危操作重映射 + prompt injection 点破;MCP 口径修正为 7 工具。状态仍:plan,不实现。 |
| 2026-08-04 | **Phase 7 开工落地**:Tier 1 git 归因安全核心 + Tier 2 ACP 功能 v1 全部落代码。ACP 主线对真实 opencode 闭环验证;新增 `acp.rs` / `transcript.rs` / `git_attr.rs` + `AgentPanel.tsx` / `AgentActivity.tsx` / `ColResizeHandle.tsx`。26 测试过、tsc/vite clean。`B-AGENT-CTX-MODELC` 整体推迟;其余 Tier 2 项以「功能 v1 + 完整形态 backlog」交付(详见 §10)。状态:plan → 🚧 主干可用(待真机验收)。 |
| 2026-08-04 | **Phase 7 完工(完整 Tier 2)**:补齐此前「功能 v1 / 推迟」的完整形态——`B-AGENT-CTX-MODELC`(Model C 移交:归一化 seed)、`B-AGENT-PERM`(三档 + 高危门控 + 宽松琥珀点)、`B-AGENT-COMPOSER`(`@`-context 药丸 + Queue)、`B-AGENT-THREADVIEW`(tool_call 折叠 + 二级折叠,`ToolCard.tsx`)、`B-AGENT-TRANSCRIPT`(threads 表 + WAL + raw_blob)、`B-AGENT-GIT-ATTR`(影子仓库 + 采纳入 HEAD)、`B-AGENT-SHELL`(存活检测 `agent_alive` + 脏退出 emit + resume 边界文档)。27 测试过、tsc/vitest(550)/vite clean。状态:🚧 → ✅ 第一版(Tier 1 + 完整 Tier 2)完工,无推迟项(待真机验收)。 |
| 2026-08-04 | **完工复核 · 补齐 9 处缝隙**:对「功能 v1」做诚实复核,发现并补齐 9 项与「完整 Tier 2」之间的残留——ACP 终端闭环(Create/Output/Wait/Kill/Release + 进程组 kill)、权限白名单档(按工具分类持久白名单)、`@`-context 选择器 popover、标注层 writer 注入 + LCS 行 diff、即时提交模式(原记「后续可加」,已落地)、mode/config 下拉、多窗口/多 vault 隔离 + 关闭善后、Node 缺失运行时引导、历史会话切换 UI。修正 §10 把即时提交/Model C 误记为「近似 / 推迟」的过时口径。38 测试过、tsc/vitest(550)/vite/cargo check clean。状态维持:✅ 完工,无推迟项(待真机验收)。 |

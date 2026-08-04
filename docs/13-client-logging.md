# 13 — 客户端日志与远程/本地调试方案

> **状态**:设计 + **L1 已落地**（2026-08-02）。**先详细、后裁剪**；中间件多 sink；开发日常可查。  
> **L1 实现**:`app/src-tauri/src/logging.rs` + 命令 `log_write` / `log_get_dir` / `log_open_dir` / `log_set_profile` / `log_get_status`；UI `logger.ts` + Settings 诊断区；`diag-log` 走 LogBus。  
> **仍待 L2**:PortSink、导出 zip。  
> **约束**:MIT；`core` 仍 IO-free；不默认上报云端。

---

## 0. 目标与非目标

| 目标 | 说明 |
|---|---|
| **开发期详尽日志** | 打开 vault、索引、IPC、图布局、QQL、写盘、git、MCP 路径等可追踪 |
| **用户反馈可排查** | 复现后能拿到**一份文件**（或目录），agent/开发者本地打开即可 |
| **上线可一键瘦身** | 日常 info/debug **不写盘**（或极短滚动），只保留 **error + panic/崩溃**，控制体积 |
| **中间件 / 多 sink** | 同一条事件可 fan-out 到 stderr / 文件 /（可选）端口，filter 可热切换 |
| **可选端口监听** | 开发/测试时 `tail` 或连 TCP 看实时流，不必翻文件 |

| 非目标（本阶段） | 说明 |
|---|---|
| 云端遥测 / Sentry 默认开启 | 隐私与 MIT 本地优先；可选插件以后再说 |
| 在日志里完整 dump 笔记正文 | 默认**不记 body**；路径/ID/错误即可（见 §5） |
| 改 core 塞 log 宏到处跑 | core 保持纯；边界在 app 命令层打点 |

---

## 1. 现状与缺口

```text
UI console.error/warn / window.error / unhandledrejection
        │ invoke("diag_log")
        ▼
Rust eprintln!  →  仅当从终端启动 app 时人眼可见
        ✗ 无文件
        ✗ 无级别
        ✗ 无 rotation
        ✗ 无「只记 error」开关
        ✗ 无导出给用户
```

打包后从 Dock 启动 → **几乎没有持久诊断**；你反馈 bug 时 agent **读不到**客户端侧轨迹。

---

## 2. 方案对比

| 方案 | 优点 | 缺点 | 建议 |
|---|---|---|---|
| **A. 自研 Logger 中间件 + 文件 sink** | 完全可控；TDD 友好；无 GPL；契合「一键裁剪」 | 要自己写 rotation/级别 | **主路径** |
| **B. `tauri-plugin-log`** | 官方；LogDir 跨平台；JS `info/error` | 粒度/filter/端口要再包一层；多一个依赖 | 可选底层，或借鉴其目录约定 |
| **C. 仅 stderr + 用户「终端启动」** | 零成本（现状） | Dock 启动无日志；无法给用户要文件 | 保留为 sink 之一 |
| **D. TCP/UDP 日志端口** | 开发时 `nc`/`socat` 实时看 | 防火墙/占用端口；**勿默认生产开启** | **Dev/Debug 会话可选 sink** |
| **E. WebView DevTools only** | 开发方便 | 用户包无 inspector 时无用 | 开发辅助，非诊断主路径 |

**推荐组合**:**A（核心）+ C（stderr 永远可选）+ D（仅 dev / 显式「调试会话」）**。  
目录约定对齐 Tauri **`appLogDir()`**（macOS: `~/Library/Logs/{bundleId}/`），与官方文档一致，方便写进「如何反馈问题」。

---

## 3. 架构：中间件模式

```text
                    ┌─────────────────────────────────────┐
  调用方            │           LogBus (单例)              │
  log.info(...)  ──►│  1. 规范化 Event                     │
  log.error(...)    │  2. Filter pipeline (级别/模块/采样)  │
  panic hook ──────►│  3. Fan-out 到 Sinks[]               │
  JS bridge ───────►│                                     │
                    └─────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
     StderrSink          FileSink            PortSink
     (always optional)   (主持久化)          (可选实时)
```

### 3.1 事件模型（建议）

```ts
// 概念形状（Rust 侧 serde 同构）
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogEvent {
  ts: string;           // ISO-8601
  level: LogLevel;
  target: string;       // 模块: "ipc.index_vault" | "ui.graph" | "git" | "webview"
  msg: string;
  fields?: Record<string, string | number | boolean | null>; // 结构化，勿塞长 body
  session_id?: string;  // 进程启动时生成，便于一次反馈对齐
}
```

### 3.2 Filter 中间件（可插拔顺序）

| Filter | 作用 |
|---|---|
| **LevelFilter** | 全局最低级别：`Trace`…`Error` |
| **TargetFilter** | 按模块静音（如 `ui.graph.layout` 太吵） |
| **RedactFilter** | 剥 token/API key 模式；截断过长字符串 |
| **RateLimitFilter**（可选） | 同一 msg 指纹 1s 内最多 N 条，防循环刷盘 |

### 3.3 Sink 中间件

| Sink | 开发默认 | 发布默认 | 说明 |
|---|---|---|---|
| **StderrSink** | on（info+） | off 或 error+ | 兼容现 `diag_log` |
| **FileSink** | **on，debug/trace 全开** | **on，仅 error+fatal**（或 warn+） | 滚动文件，见 §4 |
| **PortSink** | 可选 `OPENOBS_LOG_PORT=9876` | **默认 off** | TCP 行协议 NDJSON |
| **MemoryRingSink**（可选） | 最近 200 条 error | 同左 | 崩溃瞬间 flush 到文件 |

**「一键日常不记、只记崩溃和 error」** = 切换 **全局 Profile**（不是删代码）：

| Profile | LevelFilter | FileSink | PortSink | 用途 |
|---|---|---|---|---|
| **`dev`** | debug（或 trace） | 全开 + 较大 rotation | env 开则开 | 本地开发 |
| **`verbose`** | trace | 全开 + 大文件 | 可开 | 用户复现难 bug 时临时开 |
| **`prod`** | error（+fatal） | 仅 error/fatal + 小文件 | off | **上线默认** |
| **`off`** | 静音 file | 不写（stderr 可选） | off | 极端 |

设置入口建议：

- 环境变量：`OPENOBS_LOG_PROFILE=dev|verbose|prod`
- 应用设置页：**诊断 → 日志详细程度** + **「导出日志…」** + **「打开日志文件夹」**
- 调试会话：设置里 **「开启详细日志直到下次启动」** → 写 `verbose` 到本地 config，重启生效（避免热切换漏掉启动段）

---

## 4. 文件落盘细节

### 4.1 路径（推荐）

| 平台 | 目录（bundle id = `dev.openobsidian.desktop`） |
|---|---|
| macOS | `~/Library/Logs/dev.openobsidian.desktop/` |
| Linux | `~/.local/share/dev.openobsidian.desktop/logs/`（或 XDG） |
| Windows | `%LOCALAPPDATA%\dev.openobsidian.desktop\logs\` |

文件名示例：

```text
openobs-2026-08-02.log          # 当日滚动
openobs-2026-08-02.error.log    # 可选：error 单独一份，反馈时优先交这个
```

实现可用：

- Rust：`tracing` + `tracing-subscriber` + `tracing-appender`（rolling daily），或手写简单 append + 按日切；
- 或 `tauri-plugin-log` 的 LogDir 再包一层 profile。

### 4.2 Rotation / 体积（防「包过大」）

| 策略 | dev / verbose | prod |
|---|---|---|
| 按日滚动 | 是 | 是 |
| 保留天数 | 14 | 7 |
| 单文件软上限 | 50–100 MB 切分 | 10–20 MB |
| 总目录上限 | 500 MB 删最旧 | 50–100 MB |
| 启动时 prune | 是 | 是 |

### 4.3 格式

- **NDJSON 一行一条**（agent 友好：`rg` / `jq` / 按 session_id 过滤）。
- 人读可选：同一文件 plain `ts LEVEL target msg key=val`。

示例：

```json
{"ts":"2026-08-02T12:00:01.234Z","level":"info","target":"ipc.index_vault","msg":"index ok","fields":{"notes":128,"ms":42},"session_id":"a1b2c3"}
{"ts":"2026-08-02T12:00:02.100Z","level":"error","target":"git","msg":"commit failed","fields":{"code":1,"stderr":"..."},"session_id":"a1b2c3"}
```

---

## 5. 端口监听（开发 / 测试）

### 5.1 协议（简单）

- 启动时若 `OPENOBS_LOG_PORT=9876`（或设置「调试端口」）：
  - 本机 **`127.0.0.1` only** 绑定 TCP；
  - 每条通过 Filter 后的事件写一行 NDJSON + `\n`；
  - 多客户端可 fan-out（或仅最后一个连接）。

### 5.2 用法

```bash
# 终端 A：启动 app 带端口
OPENOBS_LOG_PORT=9876 OPENOBS_LOG_PROFILE=dev ui/node_modules/.bin/tauri dev

# 终端 B：实时看日志
nc -l 9876   # 视实现是 server 还是 client；推荐 app 做 server，client 连入
# 或:  socat - TCP:127.0.0.1:9876
```

**推荐：app 为 TCP server**，调试端 `nc 127.0.0.1 9876` 连接即可（不必抢 bind）。

### 5.3 安全

- **禁止 0.0.0.0**；生产 profile 默认不启 PortSink。
- 日志不含 vault 正文、API key；fields 白名单。

---

## 6. 前端 / Rust 接入点

### 6.1 替换 / 扩展现有 diag-log

```text
installConsoleForwarder()
  → 仍捕获 error/warn/unhandled
  → invoke("log_write", { level, target: "webview", msg, fields })
  → 或保留 diag_log 作为 error 快捷通道，内部转 LogBus
```

业务点（逐步加，开发期尽量全）：

| 区域 | target 示例 | 级别 |
|---|---|---|
| 打开 vault / 索引 | `ipc.index_vault` | info + 耗时 fields |
| 写笔记 / 冲突 | `ipc.write_note` | info / error |
| 图布局 / Cytoscape 交互 | `ui.graph` | debug |
| QQL 失败 | `qql` | warn/error |
| git 子进程 | `git` | info 命令名；error 带 exit |
| MCP（若同机） | `mcp` | 独立文件或同 bus |

### 6.2 Rust panic

```rust
// app 启动时
std::panic::set_hook(...); // 写 fatal 到 FileSink + stderr
// 可选：tauri 未处理错误统一 log.error
```

### 6.3 API 草图（app 命令）

| Command | 作用 |
|---|---|
| `log_write` | UI → LogBus（级别 + msg + fields） |
| `log_get_dir` | 返回日志目录路径（设置页「打开文件夹」） |
| `log_set_profile` | 热改 profile（或写 config 下次生效） |
| `log_export_zip` | 打包最近 N 天 / 当前 session → 用户可选保存路径 |

---

## 7. 反馈问题流程（给你 + agent）

### 7.1 用户侧

1. 设置 → **诊断** → 打开 **「详细日志」**（verbose）→ **重启 app**  
2. 复现问题  
3. **导出日志**（zip：当日 log + error log + 可选 `session_id` 元数据）  
4. 反馈时附 zip / 或说明日志目录路径  

### 7.2 Agent / 开发者侧

```bash
# macOS 本机直接读（同一台机器开发时）
ls ~/Library/Logs/dev.openobsidian.desktop/
rg -n 'error|fatal|index_vault' ~/Library/Logs/dev.openobsidian.desktop/openobs-*.log

# 或用户发来 export.zip 解压后同法
```

**约定**：用户反馈模板写进 README / 设置页文案：

> 请附「导出诊断日志」生成的 zip；并写清大致操作时间（对齐 log 时间戳）。

Agent 排查时：**优先 `*.error.log` + 对应 session 前后 2 分钟的 info**。

### 7.3 开发期日常

- `tauri dev` 默认 `OPENOBS_LOG_PROFILE=dev`（或 debug_assertions 自动 dev）  
- 文件 + stderr 双开；需要时再 `OPENOBS_LOG_PORT`  
- CI **不**依赖日志内容断言；单测测 Filter/序列化纯逻辑  

---

## 8. 与「中间件」表述的对应

你说的中间件 ≈：

1. **Filter chain**（级别 / 模块 / 脱敏）—— 上线一键 = 换成 `prod` LevelFilter  
2. **Sink chain**（文件 / stderr / 端口）—— 日常不记录 = FileSink 只收 error，或关 verbose sinks  
3. **不写业务 if 到处散落**—— 统一 `log::info!(target: "…", …)` / `logger.info("…", { fields })`

上线后「一键」产品形态：

- 设置开关：**详细诊断日志 [关]** → profile=`prod`  
- 高级：**导出日志** 仍可用（error 文件很小，照样有用）

---

## 9. 实现分期（建议）

### Phase L1 — 最小可用（优先，1 个会话级）✅

- [x] Rust `LogBus` + LevelFilter + FileSink（daily）+ StderrSink  
- [x] panic hook → fatal 文件  
- [x] 扩展 `diag_log` / 新 `log_write`；JS 桥 error/warn 进文件  
- [x] `log_get_dir` / `log_open_dir` + 设置页「打开日志目录」+ profile 热切换  
- [x] debug build 默认 profile=`dev`；release 默认 `prod`（`OPENOBS_LOG_PROFILE` 可覆盖）  
- [x] 纯函数：序列化 NDJSON、prune 策略单测  


### Phase L2 — 开发体验

- [ ] PortSink + `OPENOBS_LOG_PORT`  
- [x] `log_export_bundle`（合并近期 `.log` → 单 txt；设置页「导出诊断日志」）  
- [x] 设置页 profile 三档（进程内热切换）  
- [x] 关键 IPC 路径 info 打点（index / write / open vault）  

### Phase L3 — 打磨

- [ ] RateLimit + Redact  
- [ ] error 独立文件  
- [ ] 可选接入 `tauri-plugin-log` 若维护成本更低  
- [ ] README「如何反馈问题」  

**Backlog ID（建议写入 backlog）**:

| ID | 项 |
|---|---|
| B-LOG-BUS | LogBus + Filter + File/Stderr sink + panic |
| B-LOG-UI | 设置页 profile / 打开目录 / 导出 zip |
| B-LOG-PORT | PortSink + env |
| B-LOG-IPC-SPANS | 关键 IPC 结构化打点 |

---

## 10. 决策默认值（可 open-questions 化）

| # | 问题 | 默认 |
|---|---|---|
| L1 | 默认 profile | debug=`dev`，release=`prod` |
| L2 | 日志目录 | 系统 AppLog / `appLogDir`，**不**放 vault 内（避免污染 git / 同步） |
| L3 | 端口 | 仅 env 显式开启；默认 9876 |
| L4 | 是否用 tauri-plugin-log | L1 **自研轻量**；L3 再评估 |
| L5 | 是否记笔记 path | 记相对 path；**不记正文** |
| L6 | verbose 是否需重启 | 是（保证启动段也进详细日志） |

---

## 11. 小结

| 你的期望 | 方案对应 |
|---|---|
| 测试时端口拿日志 | **PortSink** + `OPENOBS_LOG_PORT`（L2） |
| 详细写入文件 | **FileSink** + NDJSON + rotation（L1） |
| 先很细、上线裁剪 | **Profile** dev/verbose vs prod |
| 中间件、一键只记 error | **Filter + Sink 链**；prod 只过 error/fatal |
| 反馈问题 agent 能查 | **固定目录 + 导出 zip**；agent `rg` 本地/解压包 |
| 开发日常排查 | dev 默认写文件 + stderr |

**当前缺口一句话**：只有 stderr 桥，Dock 启动与用户反馈场景下 agent **无法**系统排查；L1 落地后即可「要用户导出日志 → 本地读文件」。

---

## 修订

| 日期 | 说明 |
|---|---|
| 2026-08-02 | 初版调研：中间件 LogBus、文件/端口/profile、反馈流程、L1–L3 |

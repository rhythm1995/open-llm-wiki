# 18 — iOS 客户端可行性调研与 M0/M1 方案

- 状态:**✅ M0+M1 已落地**(2026-08-22;iPhone 15 Pro 模拟器调试跑通,落地记录见 §10)
- 输入:仓库代码事实盘点(74 个 `#[tauri::command]`、UI 三栏壳、doc 17 G1–G6)+ 外部证据(Tauri 2 iOS 现状、gitoxide、BlockNote 移动支持、Obsidian 移动端架构)
- 定位:**阅读 + 编辑 + 查询 + 图谱 + 文件同步**的移动端;git / Agent / MCP / 画布 / 表格全部桌面专属

## 1. 一句话结论

可行性**中高**:架构对本项目异常有利(core 纯逻辑 100% 复用、UI 单一 IPC 接缝 + 浏览器 mock、crate-type 已含 staticlib、`mobile_entry_point` 已预留),但有三个桌面级硬依赖必须剪裁或替换——系统 git 子进程、`notify` 文件监听(iOS 无后端)、整条 Agent/ACP/MCP 栈(spawn 子进程,沙箱内无意义)。UI 层需要一个新的移动导航壳(现有三栏布局零响应式)。

## 2. 有利因素(为什么是中高而不是中)

| # | 事实 | 对 iOS 的意义 |
|---|------|--------------|
| A | `core/` 纯 Rust 零 IO(仅 serde) | 解析 / QQL / 检索 / lint **原样编译**进 iOS |
| B | UI 只经 `ipc.ts` 单一接缝,自带浏览器 mock 后端 | 移动壳可在浏览器里开发调试,不必每次编译 Rust |
| C | JS 侧零 `@tauri-apps/plugin-*` 依赖,capabilities 极小 | 无插件移动端兼容矩阵要踩 |
| D | `lib.rs` 已有 `#[tauri::mobile_entry_point]`,crate-type 已含 staticlib | 壳子本来就为 mobile 预留 |
| E | **doc 17 G1–G6 iCloud 防护刚落地** | 原子写 / `.icloud` stub / 冲突对 / 读超时,iOS 端照单复用 |
| F | Obsidian 移动端 = Capacitor + WKWebView + CodeMirror | 同技术路线已被商业验证(装机 ~19MB) |

## 3. 三个硬依赖与处置

1. **git = 系统 `git` 子进程**(`run_git`,`std::process::Command`)。iOS 禁止 spawn 子进程。
   处置:**v1 砍掉**。Obsidian 移动端同样无 git;doc 17 的 git gate 对 iCloud vault 本就默认关。
   中期备选:gix(gitoxide,MIT OR Apache-2.0,许可干净;Cargo 以它做 fetch;merge 仍在演进)。
   **不选** libgit2(GPLv2+linking exception,触碰本仓库"无 GPL 直染依赖"红线)。
2. **`notify 6` 无 iOS 后端**(FSEvents 是 macOS-only)。
   处置:iOS 换**轻量轮询 watcher**——walk + (mtime, len) 快照 diff,emit 与桌面完全相同的
   `vault-changed` 路径列表事件,前端 `apply_vault_changes` 增量管线零改动。桌面 notify 路径不动。
3. **Agent/ACP + MCP onboarding(~30 个命令)天生桌面**(spawn CLI agent、登录 shell 探 PATH、
   sidecar 二进制 `externalBin` 不能进 iOS bundle、写 `~/.claude.json`)。
   处置:iOS **整体剪掉**。doc 17 已把跨设备故事定位在 iCloud 而非 agent,方向一致。

## 4. 运行时安全面(不需要 cfg 也安全的点)

- `create/delete/rename` 内嵌的自动 git 提交:`git_is_repo_inner` 在 iOS spawn 失败 →
  `unwrap_or(false)` → 静默跳过。笔记 CRUD 在 iOS 原样可用。
- `documents_dir()` = `$HOME/Documents`;iOS 的 HOME 即 app 沙箱 → 示例库天然落在
  app Documents(配合 `UIFileSharingEnabled` 在文件 app "我的 iPhone" 下可见)。

## 5. 文件访问与同步模型

- **v1(M1)**:vault = app 沙箱 `Documents/`(Files.app 可见、可经 iTunes/Finder 拖入)。
  欢迎屏移动端只提供「创建示例库」+ 最近 vault;桌面级「打开任意文件夹」入口隐藏
  (iOS document picker 的 security-scoped bookmark 与现有"裸路径字符串"模型不匹配,后置)。
- **M2+**:iCloud Documents entitlement + 自有 ubiquity container(Obisidian 模式,
  `iCloud~dev.openllmwiki.mobile/Documents`),桌面端(非沙盒)直接读写同一路径;
  `detect_storage` 增加对自家 container 路径的分类。需要 Apple Developer 账号 + 真机。

## 6. UI 剪裁清单(74 命令的取舍)

| 处置 | 内容 |
|------|------|
| **保留** | 笔记 CRUD(原子写)、index/search/QQL/lint、图谱布局、附件/媒体、storage 检测 + 冲突扫描 + 横幅 |
| **砍掉** | 全部 git 命令(8+4)、ACP agent(13)、transcript(5)、onboarding(9)、reveal_in_finder、log_open_dir、托盘/原生菜单 |
| **替换** | `watch_vault` → 轮询;iOS 欢迎屏 → 示例库 + 最近列表;外部链接 → 移动端隐藏入口 |
| **编辑器** | 移动端**固定 CodeMirror 源码模式**(BlockNote 移动支持仍实验性,工具栏 experimental、块拖拽有已知 bug;WYSIWYG 后置);画布(Excalidraw)/表格(IronCalc)移动端不渲染,列表里隐藏入口 |

移动壳(v1):顶栏(菜单键开抽屉 + 标题 + 新建/搜索)+ 底部标签(笔记 / 图谱 / 更多)+
抽屉(Nav 智能视图 + 笔记列表堆叠)。Inspector/AgentPanel/StatusBar/TabBar 移动端不渲染。

## 7. Tauri 2 iOS 本身的风险(外部证据)

- stable、有 App Store 上架先例;但已知坑:WKWebView 后台恢复白屏(tauri#14371)、
  iPadOS 半屏(tauri#15367)、safe-area inset 首绘不生效(有成熟 workaround)、
  dialog 插件 iOS 文件选择 bug(plugins-workspace#3030)。全部"有解但要踩"。
- 图谱 force-graph(canvas 2D)是性能最大风险 → M0 spike 在模拟器/真机验证,必要时节点上限。
- 分发:$99/年账号;本地 markdown 类 app 审核先例充足;更新走 App Store(本项目未配 updater,无损失)。

## 8. 里程碑

| 期 | 内容 | 验收 |
|----|------|------|
| **M0 构建通路** | iOS target 编译通过:`cfg(desktop)` 门(托盘/菜单/窗口行为/PATH)、轮询 watcher、`tauri.ios.conf.json`(去 externalBin)、`tauri ios init` 生成 gen/apple、Info.plist 文件共享键;模拟器能起 | `cargo check --target aarch64-apple-ios` 绿;iOS 模拟器显示应用并打开示例库 |
| **M1 移动 MVP** | 移动壳(抽屉 + 底栏 + 移动欢迎)、源码模式编辑、搜索(CommandPalette 复用)、图谱、存储横幅/冲突提示复用、git/Agent 入口全隐藏 | 模拟器:新建示例库 → 编辑保存 → 搜索 → 图谱;桌面端 e2e + vitest 全绿,**零桌面回归** |
| M2 打磨上架 | iCloud ubiquity container、真机 FPS 验收、safe-area/键盘细节、App Store 流水线、CI iOS job | TestFlight |

## 9. 决策记录

- **移动端不做 git**:与 Obsidian 移动端一致;桌面仍是 git 一等公民。
- **轮询而非移植 notify**:iOS 前台为主的生命周期下 2s 轮询可接受;快照 diff 是纯函数可 TDD;
  与桌面 emit 同一事件,前端零改动。
- **源码模式唯一编辑模式(移动 v1)**:BlockNote 移动实验性;CM 有 Obsidian 先例。
- **示例库落 app Documents 而非 iCloud container(M1)**:iCloud entitlement 需账号 + 真机,
  留 M2;Documents + Files.app 已可用。
- **Android**:Tauri 2 同栈支持,但本调研仅承诺 iOS;Android 后置再评估(clipboard/键盘/webview 差异)。

## 10. 落地记录(2026-08-22,M0+M1,TDD)

### 10.1 M0 构建通路

1. **`watch_poll.rs`**(TDD 先行 3 测试):`PollSnapshot` = 相对路径 → (len, mtime);`scan_poll_snapshot`(复用 `path_should_emit` 过滤)/ `diff_poll_snapshots`(新增/变化/删除)/ `poll_once`(首轮 Baseline 不报);`spawn_poll_watcher` 仅 iOS 编译,2s 一轮,世代计数停旧循环,emit 与桌面同款 `vault-changed`。
2. **`app_platform` 命令** + 纯 `platform_id()`(单测锁取值域);ipc `getPlatform`,mock 返回 `"browser"`。
3. **cfg 门**:托盘/原生菜单/窗口隐藏行为/`augment_path` → `#[cfg(desktop)]`(setup 拆「全平台日志」+「桌面专属」两段);`pick_vault`/`reveal_in_finder`/`open_url_in_browser` 移动端返回 Err/None;notify 移到 `cfg(not(ios))` 目标依赖;acp PATH 三函数 `cfg_attr` 压 dead_code。
4. **`tauri.ios.conf.json`**:identifier `dev.openllmwiki.mobile`,`externalBin: []`(sidecar 不进 iOS bundle)。
5. **gen/apple**(tauri ios init):Info.plist 加 `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`(vault 在「文件」app 可见);补 `gen/apple/tauri` shim 转发到 `ui/node_modules/@tauri-apps/cli`(Xcode Build Rust Code phase 用)。

### 10.2 M1 移动壳

- `ui/src/lib/platform.ts`:`resolveMobileLayout` 纯函数(iOS 恒移动;browser ≤768px 移动预览;desktop 恒三栏)+ `useIsMobileLayout`。
- 组件:`MobileTabBar`(笔记/图谱/更多,safe-area 底距)、`MobileTopBar`(抽屉/搜索/新建,safe-area 顶距)、`MobileWelcome`(示例库 + 最近)、`MobileMore`(主题/语言/刷新/vault 信息);i18n 双语 `mobile.*` 17 键。
- `App.tsx` 移动分支:复用全部 store 状态与既有组件(Nav + NoteListView 进抽屉,选笔记关抽屉回编辑;Editor 固定 CodeMirror 源码模式;画布/表格占位「请在桌面端打开」;StorageBanner/ConflictNotice/命令面板照常;桌面三栏分支零改动)。

### 10.3 验证

- 全绿:`cargo test -p core 165 / app 82(watch_poll 3 + platform 1 新增)/ mcp 30`;clippy 0 error;`cargo check --target aarch64-apple-ios` 0 warning 0 error;`pnpm typecheck`;`pnpm test 976`(+10);`pnpm e2e 30`(+`mobile-shell.spec.ts` 4:壳渲染/抽屉选笔记/图谱+更多/搜索入口);`pnpm build`。
- **iPhone 15 Pro 模拟器实跑**(`tauri ios dev "iPhone 15 Pro"`):欢迎屏 → 点「创建示例库」→ 4 个种子文件原子写入沙箱 `Documents/Open LLM Wiki Demo/`(宿主核实)→ 编辑器打开 Welcome.md;宿主机直写 `watcher-probe.md` → ≤2s 轮询 diff → 前端增量索引 → 抽屉列表出现该笔记(**轮询 watcher 全链路实证**);命令桥日志 `ipc.create_sample_vault / index_vault / detect_storage` 全部执行。

### 10.4 已知 M1 缺口(留 M2)

- Nav 智能视图含「Archive」项,移动端点入是 git 空态(git 不可用)——应隐藏,待打磨。
- 图谱为桌面组件直接复用,真机 FPS 未验收(节点上限/降采样待做)。
- 键盘弹起遮挡、WKWebView safe-area 首绘、后台恢复白屏(tauri#14371)等 iOS 细节未专项处理。
- iCloud ubiquity container(桌面 ↔ iPhone 同步)需开发者账号 + 真机,M2。
- CI 尚无 iOS job(release.yml 也未含 iOS lane);App Store 上架流水线 M2。

# 调研:vault 能否放在 iCloud Drive,降低非 geek 用户使用成本

- 日期:2026-08-21
- 分支:`zcode/next`
- 问题:本地优先、文件即真相的本 app,能否把 vault 目录放进 iCloud Drive,作为非 geek 用户的零配置同步方案?

## TL;DR

**可以有条件支持,但不能无脑支持。** 结论分三层:

1. **产品层:应该支持。** 非 geek 的 Apple 全家桶用户,iCloud 是唯一"零安装、零额外账号、零费用"的同步路径;参照产品 Obsidian 在 iOS 端把 "Store in iCloud" 做成创建 vault 时的一等开关。但社区公认它的坑是:重复文件(`Note 2.md`)、静默丢改动、占位文件破坏索引、Windows 端官方承认可能"文件重复或损坏"。
2. **工程层:当前代码直接把 vault 放进 iCloud 有三个真实风险点** —— 保存是非原子 `fs::write`(半截文件可能被同步上去)、git 自动 commit + shadow repo 会在 iCloud 里产生高频小文件 churn(`.git` 损坏是社区高发事故)、eviction(dataless 文件)会让读取阻塞/索引不完整。
3. **最关键的发现:本 app 其实已经"被迫"在支持 iCloud 了。** `create_sample_vault` 默认把示例库建在 `~/Documents/Open LLM Wiki Demo`;而 macOS 的 "Desktop & Documents Folders" 同步开启时(非 geek 用户很常见,系统设置引导开启),`~/Documents` 本身就是 iCloud 管理的目录。**也就是说用户什么都不选,vault 就可能已经在 iCloud 里了。** 所以"I-cloud 防护"不是要不要做的功能,而是现状下就该补的护栏。

## 一、iCloud Drive 的真实工作机制(为什么"不是普通文件夹")

三个独立来源(cabeen 2026、Eclectic Light 2023、arXiv 2602.19433)交叉验证出的机制图景:

- **iCloud Drive 是架在文件系统之上的同步数据库**,由 `bird`/`fileproviderd` 守护进程 + SQLite 状态库(client.db)+ File Provider 框架构成。它靠 FSEvents 发现变更、靠 NSFileCoordination 约定写入。**绕过 coordination 的普通 POSIX 写入(`fs::write`、`rm`、`mv`)它照样同步,但无法区分"故意删除"和"同步冲突",状态机可能错乱**(幻影文件、上传中途被改名等)。
- **Sonoma(14.0)起,占位文件机制彻底变了**:旧系统的 `.文件名.icloud` 小占位文件消失了,改为 APFS **dataless 文件**——文件名、大小、inode 都正常,`stat`/`ls` 全部成功,只是数据块不在本地;**读取会隐式触发阻塞式网络下载**。是否已下载只能通过 `SF_DATALESS`(`stat.st_flags`,Apple TN3150)或 `URLResourceValues.ubiquitousItemDownloadingStatus` 查询。
- **冲突策略是 mtime 的 last-writer-wins,没有逻辑时钟**:并发编辑同一文件时,iCloud 要么生成带编号的重复文件(`Note 2.md`),要么**静默丢弃一方,且不给任何冲突通知**。同步中途还会出现文件名被加随机前缀、整树复制/复活等 reset-and-rescan 病理行为。
- **半截文件会被上传**:app 用"写 → rename"这类多步保存时,同步守护进程可能把中间态上传,在别的设备上留下损坏文件(arXiv Incident 1 的 LaTeX 损坏与此完全同款)。这对我们的 `fs::write` 直写是直接警告。
- **修复手段贫乏**:`killall bird`、登出重登(触发全量重建,数小时),几乎无可诊断工具。

## 二、参照产品:Obsidian 的经验

- **官方姿态是"支持 + 提醒"**:iOS 创建 vault 有 "Store in iCloud" 开关(vault 落在 `iCloud~md~obsidian` 容器);官方文档明确提醒 **"keep the vault folder downloaded"**(防止 eviction);官方文档警告 **Windows 上 iCloud Drive "可能导致文件重复或损坏"**。
- **社区高发问题**(forum/Reddit/MPU 大量同款报告):重复文件(两台设备在同步完成前各写一版 → ` xxx 2.md`)、`.obsidian` 高频小 JSON(workspace.json 每次关 tab 都写)导致配置冲突/工作区复位、iOS 后台限制导致上传暂停(Mac 先打开就编辑到旧文件)、`Optimize Mac Storage` eviction 让搜索/图谱/反链静默失效(被 evict 的笔记"就不是笔记了")。
- **社区共识的安全姿势**:全 Apple 设备 → 可以用 iCloud;有 Windows → vault 放纯本地目录,用别的通道;**绝不在一个 vault 上跑两个同步引擎**(iCloud + git/Syncthing 叠加是最坏组合)。

## 三、对本项目代码的逐条映射

(代码事实来自本次审计,行号为当前 `zcode/next`)

| # | 现状 | iCloud 下的行为 | 评估 |
|---|------|----------------|------|
| 1 | 保存 = 直接 `fs::write`(`app/src-tauri/src/lib.rs:447`,附件 513、graph-layout 496、ACP 写文件 `acp.rs:1432` 同款) | truncate→write→close 的中间态可能被 `bird` 上传,其他设备收到半截 markdown | **P0 风险**。改同目录 tmp+rename 原子写即可消除(仓库里已有现成范式 `mcp/src/onboard.rs:395-406`) |
| 2 | 结构性操作自动 git commit(create/delete/rename,`lib.rs:1484-1502`);agent 归档在**非 git vault** 里也会惰性创建 bare shadow repo `<vault>/.open-llm-wiki/agent-shadow.git`(`git_attr.rs:71-110`) | `.git` 是"大量高频小文件 + 引用文件"的最坏同步负载:refs 损坏、幻影文件、`main 2` 重名冲突都是社区实录(architchandra 等)。iCloud 没有 selective sync,无法排除 `.git` | **P0 风险**。vault 在 iCloud 内时应默认关闭 git 自动化与 shadow repo 创建(或至少显著警告)。注意这不是"用户自己装 git"的问题——**我们的代码会主动在 vault 里建 git** |
| 3 | 扫描跳过一切点开头文件(`lib.rs:209-212`),索引进 `.md` | 旧 macOS( pre-Sonoma)被 evict 的文件是 `.note.md.icloud` → 会被点过滤跳过,**笔记从索引静默消失**;Sonoma+ 后 dataless 文件名正常,但全量扫描会对每个 evicted 文件触发隐式下载(vault 大时=意外流量 + 卡顿) | **P1**。检测到 iCloud 路径时提示用户关闭 "Optimize Mac Storage" / 对 vault 目录 "Keep Downloaded";读取侧要有超时保护 |
| 4 | notify v6 FSEvents 递归监听 + 350ms/500ms 双 debounce,apply 失败自动 fallback 全量重扫(`lib.rs:1701-1750`、`ui/src/lib/store.ts:266-279`) | FSEvents 安全模型 + notify 对新事件旗标支持不全(notify#465),iCloud 物化事件可能漏报/误报 | **可接受**。现有"失败即全量重扫"的兜底正好是对的态度,无需大改 |
| 5 | vault 路径持久化在 localStorage;picker 是原生目录选择对话框(tauri-plugin-dialog,`lib.rs:1141-1160`) | 原生对话框侧栏本身就有 iCloud Drive 入口,用户选得到;但 `~/Library/Mobile Documents/` 在 Finder 里默认不可见,**用户手动导航找不到** | **P1**。若做"存到 iCloud"引导,必须给一键路径而不是让用户自己找 |
| 6 | 示例库默认 `~/Documents/Open LLM Wiki Demo`(`lib.rs:1261-1291`) | "Desktop & Documents Folders" 同步开启时(非 geek 常见),`~/Documents` 就是 iCloud 管理目录 → **默认行为已经落在 iCloud 里** | **本文最重要的发现**。防护逻辑(P0/P1)必须做,与是否官方宣布支持无关 |
| 7 | `.open-llm-wiki/` 内的 graph-layout.json、media-trash、plugins | 小文件高频写(graph 布局每次拖完存)类似 Obsidian 的 workspace.json 问题;好在都在点目录里不进索引 | **P2**。graph-layout 用原子写即可;不需要搬出 vault |
| 8 | asset protocol scope 含 `$HOME/**`(`tauri.conf.json:30-33`) | iCloud 路径在其下,读写无权限障碍 | 无需改动 |

## 四、建议(按优先级)

**P0(不做就别谈支持 iCloud,而这些本来就该做):**

1. **原子写**:`write_note_impl`、附件保存、graph-layout、ACP 写文件统一改为"同目录临时文件 → rename"(范式已在 `onboard.rs`)。这与 iCloud 无关也是正确性修复(崩溃/断电防截断)。
2. **iCloud 路径检测 + 一次性提示**:vault 规范路径落在 `~/Library/Mobile Documents/` 下,或(路径在 `~/Documents`、`~/Desktop` 下且存在 `~/Library/Mobile Documents/com~apple~CloudDocs/Documents`)即判定为 iCloud 管理。首次打开时提示:① 关闭"优化 Mac 储存空间"或对 vault "Keep Downloaded";② 避免两台设备同时编辑;③ iCloud 空间满时的行为。
3. **git 防护**:检测到 vault 在 iCloud 内 → 自动 commit(`git_commit_paths`)与 shadow repo 创建默认关闭,UI 说明"iCloud + git 双同步引擎是已知损坏源",让用户显式选择开启。

**P1(把"能用"变"好用"):**

4. **冲突副本检测**:扫描时发现 ` xxx 2.md` / ` 2.md` 命名模式 → 在 UI 里提示(绝不自动删,社区经验:重复副本有时才是新改动)。
5. **dataless/占位感知**:扫描时把 `*.icloud` 后缀(旧系统)识别为"未下载"单独计数;打开笔记时对隐式下载加超时与进度提示,避免 UI 无限转圈。可用 `stat.st_flags & SF_DATALESS` 判断。
6. **入口引导**:vault picker / 创建流程提供 "iCloud Drive" 快捷定位(直通 `com~apple~CloudDocs`),并把示例库默认位置在检测到 Desktop&Documents 同步时改到非 iCloud 位置或明示后果。

**P2(文档与预期管理):**

7. 用户文档同步矩阵:macOS = 支持(带上述条件);Windows = 不建议(官方生态自己都承认会重复/损坏);与 git 同步 = 二选一。FAQ 预置"为什么出现 Note 2.md"。

## 五、定位与替代方案

非 geek 用户的同步选项实际只有:iCloud(全 Apple 设备)、Obsidian Sync 式付费托管(本项目无此产品组件)、Dropbox/OneDrive(同样有占位文件与冲突问题,坑位类似 iCloud)、Syncthing(geek 门槛)。**在"免费 + 零配置 + 本项目定位"约束下,iCloud 是 Apple 用户群的正解**,工程上以"敌对文件系统"心态加护栏即可;Windows 用户引导"纯本地 + 自选云盘客户端保守策略"。

## 六、局限性

- 未做实证:以上是对社区证据 + 代码审计的推断,建议安排一次 spike(本机开 Desktop&Documents 同步,把示例库放进 iCloud,验证:eviction 下扫描行为、watcher 是否漏事件、原子写后冲突率)。
- arXiv 2602.19433 是事故报告式研究,个别病理案例(iCloud 满载/超大规模库)对普通用户代表性有限;但 LWW 冲突与重复文件机制与 Obsidian 社区经验一致,可信。
- macOS 版本差异大(pre/post-Sonoma 占位机制不同);iCloud for Windows 各版本行为不一,未逐一验证。

## 参考文献

- [iCloud isn't a folder — Ryan Cabeen (2026-01)](https://cabeen.io/blog/posts/2026-01-15-icloud-is-not-a-folder.html)
- [macOS Sonoma has changed iCloud Drive radically — The Eclectic Light Company (2023-10)](https://eclecticlight.co/2023/10/25/macos-sonoma-has-changed-icloud-drive-radically/)
- [Why iCloud Fails: The Category Mistake of Cloud File Systems — arXiv 2602.19433](https://arxiv.org/html/2602.19433v3)
- [Sync your notes across devices — Obsidian 官方文档](https://obsidian.md/help/sync-notes)
- [Obsidian iCloud Sync in 2026, Including the Windows Problem — Stephan Miller](https://www.stephanmiller.com/obsidian-icloud-sync-windows/)
- [Why iCloud Creates Obsidian Sync Conflicts — EiraSync](https://eirasync.app/blog/why-icloud-creates-obsidian-sync-conflicts)
- [Obsidian, iCloud and general files stuff — MPU Talk](https://talk.macpowerusers.com/t/obsidian-icloud-and-general-files-stuff/30047)
- [I Am Moving My Obsidian Vault Away From iCloud — Preslav Rachev](https://preslav.me/scratchpad/2022/obsidian-icloud-git-sync/)
- [A Side Effect of Storing a Git Repository in iCloud Drive — Archit Chandra](https://architchandra.com/articles/a-side-effect-of-storing-a-git-repository-in-icloud-drive)
- [A solution for git repos and iCloud — josh.fail](https://josh.fail/2022/a-solution-for-git-repos-and-icloud/)
- [iCloud Drive Desktop Sync vs. Git — Stack Overflow](https://stackoverflow.com/questions/59308049/)
- [notify crate 文档(FSEvents 安全模型限制)— docs.rs](https://docs.rs/notify/)
- [notify#465: 新 FSEvents 事件旗标未完全处理 — GitHub](https://github.com/notify-rs/notify/issues/465)
- [Turn off iCloud Drive(Desktop & Documents 行为)— Apple Support Community](https://discussions.apple.com/thread/255062088)
- [WWDC21: Sync files to the cloud with FileProvider — Apple](https://developer.apple.com/videos/play/wwdc2021/10182/)

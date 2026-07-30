# 未完成清单(Backlog)

> **单一事实来源**:「还没做 / 还要做」看本文。  
> 难点拆解与前置细节仍在 [deferred.md](./deferred.md);路线图阶段叙事在 [06-roadmap.md](./06-roadmap.md)。  
> 状态:⏳ 未做 · 🟡 部分 · ✅ 已做 · 🧪 真机验收 · 🔑 凭证门  
> 难度:🟢 易 · 🟡 中 · 🔴 硬

**边界变更(2026-07-30)**:原「v1 刻意不做」三项改为正式交付目标并已落地(§A ✅)。软类型原则不变:`type` 永不强制校验、永不阻止保存。

---

## A. 原 v1 边界 → **已全部落地** ✅

| ID | 项 | 状态 | 说明 |
|---|---|---|---|
| B-TYPE-DOC | 类型文档 | ✅ | `types/{Type}.md` / `type: TypeDoc`;Inspector「类型说明」仅提示 |
| B-GRAPH-LAYER | 图谱按 type 分层 | ✅ | `graph-modes.layoutByTypeLayer` |
| B-GRAPH-TIME | 图谱时间轴 | ✅ | `layoutByTimeline`(created/modified) |
| B-GRAPH-LAYOUT-UI | 布局切换 UI | ✅ | GraphView 右上角 select |
| B-QQL-EXPAND | QQL 常用子集扩展 | ✅ | `CONTAINS`/`STARTSWITH`/`ENDSWITH`/`IN`;mock-qql 同步 |

---

## B. 产品大件(未做)

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SHEET | **F-SHEET 嵌入式表格** | 🔴 | ⏳ | ironcalc 仅 wasm、无 React UI;或换库/自研 |
| B-PLUGIN | **F-PLUGIN 插件系统** | 🔴 | ⏳ | API + 沙箱 + 生命周期 + 分发 + 安全 |
| B-MCP | **完整 MCP server(AI 写侧)** | 🔴 | ⏳ | 读侧「复制 AI 上下文」✅;agent 读写 vault 未做 |
| B-BN-FIDELITY | **BlockNote ↔ Markdown 保真** | 🟡 | 🟡 | 双模可用;缺差分测试集 + 禁用特性表 + 长文基线 |
| B-QQL-TS | **QQL 求值器移植到 TS** | 🔴 | ⏳ | 可选;mock-qql 子集够 dev |

---

## C. 编辑器体验(缺口大 · 产品打磨优先)

> 主路径「能写 md」已成立;离「打磨过的写作台」仍有距离。详见 [deferred §编辑器与菜单](./deferred.md)。

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-ED-FMT-BAR | **Source 格式工具条** | 🟡 | ✅ | `md-format` + Editor 顶栏加粗/标题/列表/引用/wikilink |
| B-ED-CTX-MENU | **编辑器正文右键菜单** | 🟢 | ✅ | Source 右键:格式 + 复制/剪切/粘贴 |
| B-ED-FIND-PARITY | **⌘F 双模对齐** | 🟡 | ✅ | ⌘F 统一切 source + CM 高亮(FindBar);关查找可还原 wysiwyg |
| B-ED-QQL-WYSIWYG | **WYSIWYG 内联 ```qql** | 🟡 | ⏳ | source 有 qql-widget;BlockNote 多半当普通代码块 |
| B-ED-MODE-UX | **双模切换心智** | 🟢 | 🟡 | 有切换按钮;缺风险提示、模式在 ⌘K/菜单中的入口 |
| B-ED-MEDIA | **图片粘贴/拖入/预览** | 🟡 | ⏳ | `![]()` 基本当文本 |
| B-ED-READING | **阅读/并排预览** | 🟢 | 🟡 | 有阅读切换;无并排预览等布局 |

---

## D. 菜单与命令(桌面感弱)

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-APP-MENU | **系统应用菜单栏** | 🟡 | ⏳ | Tauri 无 File/Edit/View/Window 标准栏 |
| B-PALETTE-EXPAND | **⌘K 命令扩面** | 🟢 | ✅ | 保存/查找/源码·WYSIWYG/归档/Reveal/主题/语言 + 快捷键标注 |
| B-NAV-CTX | **Nav 树右键** | 🟢 | 🟡 | 文件夹:新建笔记/复制路径 ✅;类型/标签/重命名夹 ⏳ |
| B-TAB-CTX | **标签页右键** | 🟢 | ✅ | 关闭/关闭其它/复制路径 |
| B-SETTINGS | **设置页** | 🟡 | ⏳ | 主题/语言/默认编辑模式等无统一设置入口 |

**右键覆盖对照**(实现现状):

| 区域 | 状态 |
|---|---|
| 笔记列表行 | ✅ 重命名 / wikilink / status / 归档 / 删除 / Finder |
| 图谱节点 | ✅ 打开 / 聚焦 / pin / 复制 / 隐藏类型 |
| 编辑器正文 | ❌ |
| Nav 文件夹/类型/标签 | ❌ |
| Tab 栏 | ❌ |
| 画布 | Excalidraw 自带,未统一到 app |

---

## E. 图谱 / 查询(剩余)

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-GRAPH-FPS | **万级帧率验收** | 🟡 | 🧪 | 代码已齐;1k≥30fps / 5k / 10k LOD 真机门禁 |
| B-QQL-MOCK-GAP | **mock-qql 与 core 语义差** | 🟡 | 🟡 | 复杂 AND/OR/关系函数 mock 仍降级 |

---

## F. 分发与工程

| ID | 项 | 难度 | 状态 | 说明 |
|---|---|---|---|---|
| B-SIGN-MAC | macOS 签名 + 公证 | 🟢 | 🔑 | 需 APPLE_* secrets |
| B-SIGN-WIN | Windows 安装包签名 | 🟢 | 🔑 | 需证书 |
| B-UPDATER | 自动更新 | 🟡 | 🔑 | 需密钥 + 是否上线决策 |
| B-UNIVERSAL-DMG | universal `.dmg` | 🟢 | ⏳ | 现分架构各打 |
| B-AGENTS-TLDRAW | **AGENTS.md tldraw 叙述** | 🟢 | ⏳ | 人类改:Excalidraw / 纯 MIT(agent 不改 AGENTS.md) |
| B-MERGE-MAIN | `feat/phase1-core` → main | 🟢 | 🧪 | 已 push;合 main 由你操作 |

---

## G. 已完成(勿重复开坑)

- F-GRAPH 主路径 + 多布局(力导向/分层/时间轴)+ WebGL/Worker/BH/LOD/标签避让  
- F-QUERY + CONTAINS/STARTSWITH/ENDSWITH/IN + histogram + 内联 qql(source)+ saved query  
- Live 索引 + watcher + 刷新索引自愈  
- Excalidraw 画布;⌘F/⌘P;Nav TAGS;拖拽移动;git pull/push;类型文档提示  
- zh/en i18n;标签循环;恢复上次笔记;CI + 本地 dmg  

---

## 建议实现顺序(产品向)

1. ~~⌘K 扩面 + 编辑器右键 + 格式条 + Tab 右键 + 查找统一~~ ✅  
2. **WYSIWYG qql + 模式 UX**(B-ED-QQL-WYSIWYG / B-ED-MODE-UX)  
3. **B-APP-MENU** 系统菜单;Nav 右键补全;B-SETTINGS  
4. **B-BN-FIDELITY** 保真测试门禁  
5. 大件:B-MCP → B-PLUGIN → B-SHEET  
6. 并行:B-GRAPH-FPS 真机;签名/Updater 配密钥  

---

## 与其它文档的关系

| 文档 | 角色 |
|---|---|
| **本文 backlog.md** | 未做清单总表 |
| [deferred.md](./deferred.md) | 难点/前置/编辑器菜单诚实评估 |
| [04-features.md](./04-features.md) | 功能规格与状态 |
| [06-roadmap.md](./06-roadmap.md) | 阶段叙事 |
| [open-questions.md](./open-questions.md) | 待拍板决策 |

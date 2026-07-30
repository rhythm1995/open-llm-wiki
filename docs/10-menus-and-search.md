# 10 — 菜单系统 · 命令面板 · 搜索（规划）

> 产品打磨规划（2026-07-30）。**Phase 1–2 已落地**（registry / 菜单 / 三 mode 面板 / searchNotes UI）。  
> **单一命令表驱动**系统菜单 / ⌘K / 快捷键；分清 **文件快开 / 库内全文 / 文内查找**。

## 1. 问题诊断（现状）

| 入口 | 现状 | 问题 |
|---|---|---|
| **系统菜单** File/Edit/View | 十来项、英文硬编码、与 ⌘K 不同源 | 观感弱；缺 New Sheet / Archive / Reveal / 并排 / 主题… |
| **⌘K 命令面板** | 命令 + 标题/路径子串笔记列表 | 能力最全但发现性靠快捷键；过滤算法简陋 |
| **⌘P / ⌘O「快开」** | 同一 Palette，`quickOpen` 模式仅笔记 | **⌘O 与「打开 Vault」语义冲突**（菜单是 Open Vault，键位却是快开） |
| **库内全文搜索** | core `search_notes` + mock-search **有后端** | **UI 零调用** `ipc.searchNotes`——全局搜正文实际不可用 |
| **⌘F 文内查找** | FindBar + CM 高亮（强制 source） | 可用；与库搜/快开边界需写清 |
| **列表过滤** | NoteListView 本地 filter | 仅当前 Nav 作用域，不是库搜 |
| **右键菜单** | 列表/Nav/Tab/Editor/图谱有 | 与命令表无共用 id；Sheet 弱 |

**结论**：不是「没功能」，是 **入口分裂 + 全文搜未挂 UI + 菜单偏薄**。

---

## 2. 信息架构：四条入口、三种搜索

```
┌─────────────────────────────────────────────────────────────┐
│  A. 系统菜单栏 (Tauri Menu)     File · Edit · View · …      │
│  B. 命令面板 ⌘K                 命令优先，可附带笔记结果      │
│  C. 快速打开 ⌘P                 仅文件/笔记路径·标题          │
│  D. 库内搜索 ⌘⇧F (新建)         正文+标题 全文命中            │
│  E. 文内查找 ⌘F                 当前笔记 FindBar              │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
   commands.ts 单一注册表 (id → labelKey, category, shortcut?, run, when?)
         │
         ├── 系统菜单生成
         ├── ⌘K 列表
         └── 快捷键绑定 (可渐进)
```

### 三种搜索（必须分清，禁止混成一个框硬扛）

| 名称 | 快捷键（建议） | 搜什么 | 数据源 | UI |
|---|---|---|---|---|
| **文件快开** | **⌘P** | 路径 / 标题 / 文件名 | `snapshot.nodes`（+ 可选 `.canvas`/`.sheet` entries） | Palette `mode=files` |
| **库内全文** | **⌘⇧F** | 标题 + **正文** | `ipc.searchNotes` → core 倒排 | Palette `mode=search` 或独立浮层 |
| **文内查找** | **⌘F** | 当前打开文档 | CM Search / FindBar | 编辑器内条 |

| 名称 | 快捷键 | 是什么 |
|---|---|---|
| **命令面板** | **⌘K** | 执行动作；输入时也可附带文件结果（次要区） |
| **打开 Vault** | 菜单 / 命令 `open-vault` | **不要**再占 ⌘O 做快开（见下） |

### 快捷键纠偏（重要）

| 键 | 现状 | 建议 |
|---|---|---|
| ⌘K | 命令面板 ✅ | 保持 |
| ⌘P | 快开 ✅ | 保持「仅文件」 |
| ⌘O | **快开**（与 P 相同） | 改为 **Open Vault**（对齐 File 菜单与常见桌面惯例） |
| ⌘⇧F | 无 | **库内全文搜索** |
| ⌘F | 文内查找 ✅ | 保持 |
| ⌘, | 设置（菜单有） | 前端也要绑定，与菜单一致 |

---

## 3. 命令注册表（实现核心）

### 3.1 模块

新建 `ui/src/lib/commands/`（纯逻辑优先，可测）：

```
commands/
  types.ts          # CommandDef, CommandContext, CommandCategory
  registry.ts       # 静态定义 + buildCommands(ctx)
  filter.ts         # 模糊过滤 label/id/keywords
  menu-map.ts       # → Tauri 菜单树描述（JSON 可序列化）
  shortcuts.ts      # id → accelerator 展示与匹配
```

`app` 侧菜单仍可在 Rust 建菜单，但 **项列表由前端约定的 id 表生成**，或：

- **阶段 A（推荐）**：Rust 菜单项 id 与 registry 完全同名；前端 `listen("menu-action")` 只 `dispatch(id)`。
- **阶段 B（可选）**：前端启动时把菜单树 post 给 Rust 动态重建（工作量大，可后做）。

### 3.2 CommandDef 形状

```ts
interface CommandDef {
  id: string;                    // 稳定 id: "file.newNote"
  labelKey: string;              // i18n
  category: "file" | "edit" | "view" | "go" | "help";
  keywords?: string[];           // 搜索别名
  shortcut?: string;             // 展示用 "⌘S"
  /** 系统菜单是否显示 */
  inMenu?: boolean;
  /** ⌘K 是否显示 */
  inPalette?: boolean;           // default true
  when?: (ctx: CommandContext) => boolean;  // 有当前笔记等
  run: (ctx: CommandContext) => void;
}
```

### 3.3 首批应对齐的命令（菜单 + 面板）

**File**

| id | 动作 | 菜单 | 面板 | 备注 |
|---|---|---|---|---|
| `file.newNote` | 新建笔记 | ✅ | ✅ | ⌘N |
| `file.newCanvas` | 新建画布 | ✅ | ✅ | |
| `file.newSheet` | 新建表格 | ✅ | ✅ | **菜单现缺** |
| `file.openVault` | 打开 vault | ✅ | ✅ | **快捷键改为 ⌘O** |
| `file.save` | 保存 | ✅ | ✅ | ⌘S |
| `file.reveal` | Reveal in Finder | ✅ | ✅ | when 有笔记且非 mock |
| `file.archive` | 归档当前 | ✅ | ✅ | when 有笔记 |
| `file.closeTab` | 关闭标签 | ✅ | ✅ | |
| `file.settings` | 设置 | ✅ | ✅ | ⌘, |
| `file.quit` | 退出 | 系统预定义 | ❌ | |

**Edit**

| id | 动作 |
|---|---|
| 系统 cut/copy/paste/undo/redo | 保持 Predefined |
| `edit.findInNote` | ⌘F 文内 |
| `edit.findInVault` | ⌘⇧F 库内全文 **新建** |
| `edit.modeSource` / `edit.modeWysiwyg` | |
| `edit.splitPreview` | 并排 **菜单现缺** |

**View**

| id | 动作 |
|---|---|
| `view.editor` / `graph` / `query` / `git` | |
| `view.toggleTheme` | **菜单现缺** |
| `view.toggleLocale` | 可选 |
| `view.refreshIndex` | 可选进菜单 |

**Go（可并入 View 或独立）**

| id | 动作 |
|---|---|
| `go.quickOpen` | ⌘P |
| `go.commandPalette` | 不进面板自身循环 |

---

## 4. 命令面板 UX 规格

### 4.1 三种 mode

| mode | 打开方式 | 列表内容 |
|---|---|---|
| `commands` | ⌘K | ① 过滤后的命令 ② 若 query 非空，附带文件快开结果（标题/路径，上限 20） |
| `files` | ⌘P | 仅文件（.md / .canvas / .sheet），按标题/路径模糊分 |
| `search` | ⌘⇧F | 调用 `searchNotes`，展示 title + path + 可选 preview 一行；点击打开 |

### 4.2 交互

- ↑↓ 选择，Enter 执行，Esc 关闭  
- 分组标题：命令 / 文件 / 搜索结果  
- 展示 shortcut 提示  
- 空态：无匹配提示 + 暗示换 mode（如「试 ⌘⇧F 搜正文」）  
- 防抖：全文搜索 **200–300ms**；快开/命令同步过滤  

### 4.3 文件快开排序（可测纯函数）

1. 标题前缀匹配 > 标题包含 > 路径包含  
2. 同级 recency：最近打开（`last-note` / openPaths）加权  
3. 上限 50 条  

### 4.4 库内全文结果（可测）

- 输入 → `ipc.searchNotes(root, q)`  
- 映射 `id → node` 得 path/title/preview  
- 展示 score 仅调试；UI 用排序即可  
- mock 已通 `mock-search`；真机 core  

---

## 5. 系统菜单规格

### 5.1 结构

```
File
  New Note          ⌘N
  New Canvas
  New Spreadsheet
  ────────
  Open Vault…       ⌘O     ← 纠正语义
  Save              ⌘S
  ────────
  Reveal in Finder
  Archive Note
  Close Tab
  ────────
  Settings…         ⌘,
  ────────
  Quit

Edit
  Undo / Redo / Cut / Copy / Paste   (系统)
  ────────
  Find in Note…     ⌘F
  Search in Vault…  ⌘⇧F
  ────────
  Source Mode
  Wysiwyg Mode
  Toggle Split Preview

View
  Editor / Graph / Query / Git
  ────────
  Toggle Theme
  Refresh Index

（可选二期）Window / Help
```

### 5.2 i18n

- 菜单文案：**阶段 1** 仍可英文（Tauri 启动早于 React）；**阶段 2** 用 `Menu` API 在 locale 变更时重建，或双语表。  
- 最低要求：与面板 **同一 id**，中文用户主要靠 ⌘K 中文 label。

### 5.3 前端 dispatch

```ts
// App: 唯一入口
function runCommand(id: string) {
  const cmd = registry.get(id);
  if (cmd?.when?.(ctx) !== false) cmd.run(ctx);
}
// menu-action / palette / shortcut → runCommand
```

---

## 6. 与右键菜单的关系

- 右键 **不强制** 进同一注册表（场景项多：status、聚焦图谱…）。  
- **原则**：与全局动作重叠的项（归档、Reveal、复制路径）使用 **相同 command id** 或调用同一 `actions.xxx`，避免两套逻辑。  
- Sheet 右键二期：复制单元格等，不挡本期。

---

## 7. 实现分期

### Phase 1 — 命令表 + 菜单对齐 + 键位纠偏（优先）

1. `commands/registry` 抽出现有 palette 命令，统一 id  
2. 菜单补：newSheet、reveal、archive、closeTab、split、search vault、theme  
3. App `runCommand(id)`；menu-action 全走它  
4. **⌘O → openVault**；**⌘P 仅 files**；**⌘⇧F → search mode**  
5. i18n keys 补齐  

### Phase 2 — 库内全文 UI

1. Palette `mode=search` 或轻量 `VaultSearchDialog`  
2. 接 `ipc.searchNotes` + 结果列表 + 打开笔记  
3. mock / 真机路径测试  

### Phase 3 — 快开体验

1. 模糊排序纯函数 + 单测  
2. 纳入 canvas/sheet（list_vault 非 md）  
3. 最近文件加权  

### Phase 4 — 硬化

1. 菜单随 locale 重建（可选）  
2. 快捷键表驱动（减少 App 里散落 keydown）  
3. e2e：⌘K 执行 save、⌘⇧F 打开命中笔记  

---

## 8. 测试计划（认真打磨）

### 8.1 纯逻辑（vitest，必须）

| 模块 | 用例 |
|---|---|
| `filterCommands` | 按 label/id/keywords；空 query 返回全部；when=false 剔除 |
| `filterFiles` | 前缀 > 包含；路径命中；上限 |
| `rankSearchHits` | score 降序；id→node 缺失跳过 |
| `menuTreeFromRegistry` | File 含 newSheet；inMenu=false 不出现 |
| `shortcutMatch` | ⌘O 映射 openVault 不映射 quickOpen |

### 8.2 组件（vitest + testing-library）

| 组件 | 用例 |
|---|---|
| CommandPalette commands | 输入过滤命令；Enter 调用 run；Esc 关闭 |
| CommandPalette files | 仅笔记行；选中打开 selectNote |
| CommandPalette search | mock searchNotes；展示结果；点击打开 |
| 空态 | 三 mode 文案不同 |

### 8.3 集成 / e2e（playwright，至少烟雾）

1. 打开 mock vault → ⌘K → 输入「设置」→ 设置面板出现  
2. ⌘P → 输入笔记标题 → 进入编辑器  
3. 有正文笔记 → ⌘⇧F → 搜正文词 → 打开正确笔记  
4. ⌘F → FindBar 可见（source）  

### 8.4 手测清单（Tauri）

- [ ] 菜单 File 每项可点且行为正确  
- [ ] ⌘O 打开选 vault 对话框，不再误开快开  
- [ ] ⌘P / ⌘K / ⌘⇧F / ⌘F 互不抢、可叠加关闭逻辑正确  
- [ ] zh/en 下面板文案；菜单英文可接受或已本地化  

### 8.5 回归注意

- 编辑器 capture 快捷键：继续 `window` capture  
- mock 无 git/reveal：when 隐藏或 toast  
- canvas/sheet 上 ⌘F 仍应 no-op 或提示  

---

## 9. 非目标（本期）

- Spotlight 级全局 OS 搜索  
- 语义 / AI 搜索  
- 替换（Replace）全库  
- 命令面板插件市场  
- 完全动态 Rust 菜单热重载（可二期）  

---

## 10. 文档与 backlog 建议 ID

| ID | 项 |
|---|---|
| B-CMD-REGISTRY | 单一命令注册表 + runCommand |
| B-APP-MENU-V2 | 系统菜单对齐注册表 + 补项 + ⌘O 纠偏 |
| B-PALETTE-V2 | 三 mode：commands / files / search |
| B-SEARCH-UI | 库内全文 UI 接 searchNotes |
| B-SEARCH-RANK | 快开排序纯函数 |
| B-CMD-TEST | 上表 vitest + e2e 烟雾 |

---

## 11. 成功标准

1. 用户从 **仅系统菜单** 能完成：新建（含表）、打开库、保存、归档、Reveal、切视图、双模、并排、库搜、设置。  
2. **⌘K / ⌘P / ⌘⇧F / ⌘F** 四键语义无重叠、可讲清。  
3. 全文搜索 **真正搜正文**（不再只有标题子串）。  
4. 命令过滤 / 快开排序 / 菜单树 **有单测**；关键路径 **有 e2e 或组件测**。  

---

## 12. 建议实施顺序（开工）

```
1. registry 抽取 + 单测 filter
2. runCommand + 菜单补项 + ⌘O 纠偏
3. Palette mode=files 独立清晰
4. mode=search + searchNotes
5. 快开 rank + canvas/sheet
6. e2e 烟雾 + 文档 backlog 更新
```

预估：认真做完 Phase 1–2 约 **中等工程量**（非大件级，但比「加两个菜单项」重）；测试与键位纠偏是质量关键，不可省。

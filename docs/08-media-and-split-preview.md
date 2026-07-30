# 08 — 附件媒体 v1 与并排阅读预览

> 产品决策(2026-07-30):**工程形态参考 Tolaria**(vault 文件落盘、命令边界);**用户习惯参考 Obsidian**(粘贴即插图、附件目录设置、左右预览)。  
> 不实现:Live Preview 内核、完整媒体浏览器/画廊、音视频/PDF 工作台。

## 目标

| 能力 | v1 范围 | 非目标 |
|---|---|---|
| **B-ED-MEDIA** | 粘贴/拖入图片 → 写入 vault → 插入 Markdown 图片语法;阅读/并排预览显示图 | 相册 UI、图床、HEIC 全家桶、音视频编辑 |
| **B-ED-READING** | Source 模式可选 **左编辑 \| 右阅读** 并排;阅读侧用现有 `renderMarkdown`+sanitize | 再造 Live Preview;WYSIWYG 再开第三套预览 |

## 数据与语法

- 附件是 vault 内普通文件(非 note)。默认目录:**`attachments/`**(相对 vault 根)。
- 插入语法(主路径):**标准 Markdown**  
  `![alt](attachments/foo.png)`  
  相对 vault 根;不强制 `![[wikilink]]`(后续可兼容)。
- 文件名:时间戳 + 消毒 basename,避免冲突。
- Settings 可改默认附件子目录(相对 vault 根,禁止 `..` 逃逸)。

## 架构

```
UI (paste/drop)
  → attachments.ts(纯逻辑:路径/文件名/md 片段)
  → ipc.saveAttachment(root, relPath, bytes)
  → app write under vault
  → Editor 插入 md / ReadingPane 经 convertFileSrc 显示
```

- **mock**:内存 Map 存 base64,dev 用 data URL 预览。
- **阅读侧**:`renderMarkdown` 后改写相对 `img[src]` 为可加载 URL(Tauri asset / mock data URL)。

## 并排预览

- 状态:`editorLayout: "edit" | "split"`(localStorage `openobs.editorLayout`)。
- **仅 source 模式**启用 split(WYSIWYG 已是所见即所得)。
- 左:`Editor`;右:`ReadingPane`(只读 HTML,wikilink 点击仍 `onFollow`)。
- 工具栏/⌘K:切换「并排预览」。

## 设置

- `attachmentsDir`(默认 `attachments`)
- `editorLayout`(默认 `edit`)

## 验收

1. 桌面:粘贴 PNG → vault 出现文件 + 笔记插入 `![](…)` → 并排/阅读可见图。  
2. mock:粘贴仍插入路径,预览用 data URL。  
3. 纯逻辑单测:路径消毒、md 片段、layout 键。  
4. backlog B-ED-MEDIA / B-ED-READING 标 ✅(v1 范围)。

## 实现落点(2026-07-30)

| 层 | 文件 / 命令 |
|---|---|
| 纯逻辑 | `ui/src/lib/attachments.ts`(+ test) |
| IPC | `save_attachment` / `ipc.saveAttachment` / `resolveMediaUrl` |
| mock | `mock.ts` 内存 Map + data URL |
| 编辑 | `Editor.tsx` paste/drop |
| 阅读 | `ReadingPane.tsx` + `rewriteHtmlImageSrcs` |
| 布局 | `App.tsx` `editorLayout` split;Settings / ⌘K |
| Rust | `app/src-tauri` `save_attachment` + base64 解码 |

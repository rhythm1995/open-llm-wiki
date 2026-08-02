# 08 — 附件 / 媒体 / 阅读预览

> 产品:**工程形态参考 Tolaria**;**用户习惯参考 Obsidian**。  
> **已做代码索引**见 [FEATURE-INDEX §附件](./FEATURE-INDEX.md)。**未做切片**见 [plan §Media](./plan.md)。

## 原则

1. 附件是 vault 普通文件,**不进**笔记 `VaultIndex` / 图谱 / 全文检索。  
2. 媒体一等索引:`MediaIndex`(files + by_note + by_media)。  
3. 链接 **vault 根相对** → 改笔记名默认不断图。  
4. GC:**不**在删笔记时静默删图;⌘K 确认 → `.openobsidian/media-trash/`。

## 已落地

| 能力 | 说明 |
|---|---|
| 插图 | 粘贴/拖入/按钮/WYSIWYG upload → 落盘 + `![alt](path)` |
| 布局 | folder-note(默认) / folder-date / folder / note-folder |
| 文件名 | `YYYYMMDD-HHmmss-basename`;中文保留 |
| MediaIndex | core + live 增量 + IPC + Inspector 附件 + 孤儿清理 |
| 并排阅读 | source `edit\|split` + ReadingPane |
| Wiki 嵌入图 | `![[img.ext]]` 阅读渲染 + 短名解析(插入默认仍 MD) |
| 迁笔记搬图 | refcount==1 时:同目录跟搬 **或** stem 桶改名,并改写正文 |

## 语法

| 写法 | 角色 |
|---|---|
| `![alt](attachments/…/x.png)` | **主路径**(插入默认) |
| `![[x.png]]` / `![[dir/x.png\|alt]]` | Wiki 嵌入;阅读侧显示;索引可抽取 |
| `![[Note]]`(无图扩展名) | **不做**全文嵌笔记(仍可当普通 wikilink 显示链路) |

## 迁笔记搬图规则

仅当 `refcount(media)==1` 且属于被改名笔记的引用:

1. **同父目录**(note-folder):`dir(note)/a.png` → `dir(newNote)/a.png`  
2. **stem 桶**(folder-note):`…/{oldStem}/file` → `…/{newStem}/file`  
3. 其它路径:不搬(链接仍有效)

## 布局表

| 布局 | 路径 |
|---|---|
| folder-note(默认) | `{dir}/{noteStem}/{stamp}-{file}` |
| folder-date | `{dir}/YYYY-MM-DD/{stamp}-{file}` |
| folder | `{dir}/{stamp}-{file}` |
| note-folder | 与笔记同目录 |

## IPC(媒体)

`save_attachment` · `attachment_exists` · `list_attachments` · `read_attachment_data_url` · `media_index` · `media_of_note` · `media_used_by` · `trash_attachments`

## 明确不做

全屏相册 · 删笔记自动 GC · 静默硬删 · 图床 · 音视频工作台

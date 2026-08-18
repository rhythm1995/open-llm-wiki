# 参考

<!-- README-I18N:START -->

[English](./reference.md) | **简体中文**

<!-- README-I18N:END -->

只列事实。怎么完成任务见 [操作指南](./how-to.zh.md)。

## Help 菜单

| 项 | 打开 |
| --- | --- |
| User Guide | <https://rhythm1995.github.io/open-llm-wiki/docs/start> |
| Report Issue… | 本仓库的 GitHub Issues |

顶栏 logo（`⌘K` 旁）打开的是应用内短卡片，不是这本手册。

## 键盘快捷键

macOS。Windows / Linux 把 `⌘` 换成 `Ctrl`。

| 快捷键 | 作用 |
| --- | --- |
| `⌘K` | 命令面板 |
| `⌘P` | 按标题快开 |
| `⌘⇧F` | 库内全文搜索 |
| `⌘O` | 打开 Vault |
| `⌘N` | 新建笔记 |
| `⌘S` | 立即保存（平时已自动保存） |
| `⌘W` | 关闭当前标签 |
| `⌘F` | 当前笔记内查找 / 替换 |
| `⌘,` | 设置 |
| `⌘A` | 全选（桌面端） |

应用内简介：点顶栏 `⌘K` 旁的 logo。

## 主视图

顶栏左侧四个图标：

| 视图 | 做什么 |
| --- | --- |
| 编辑器 | 默认。列表 + 正文 + Inspector |
| 图谱 | 笔记关系网络 |
| 库健康 | 分数、下一步、11 条锁定查询 |
| Git | 桌面端、且 vault 是 git 仓库时：status / log / commit / pull / push |

没有「查询视图」。不要找 QueryPanel。

## 三栏

| 栏 | 内容 |
| --- | --- |
| 左 | 收件箱 / 全部笔记 / 归档 / 类型 / 标签 / 文件夹 |
| 中 | 笔记列表；点开后是编辑器、图谱、健康或 Git |
| 右 | Inspector（反链、属性、大纲、附件）或 Agent |

顶栏右侧四个开关分别切换：导航、列表、Inspector、Agent。

## 文件类型

| 扩展名 | 角色 |
| --- | --- |
| `.md` | 笔记。YAML frontmatter + Markdown 正文 |
| `.canvas` | Excalidraw 白板。不进图谱、不进搜索索引 |
| 表格文件 | 嵌入式 Sheet（多表 / 冻结 / 公式）。不是 Excel 全量兼容 |

隐藏目录（路径段以 `.` 开头，如 `.git`、`.open-llm-wiki`）不进索引。

## Frontmatter 软类型

`type:` 是可选字符串，**从不校验、从不阻止保存**。缺省当作 `Note`。wiki-starter 约定：

| `type` | 中文界面 | 用来干什么 |
| --- | --- | --- |
| `Source` | 来源 | 不可变原文 |
| `Summary` | 摘要 | 从 Source 派生的可读摘要 |
| `Entity` | 实体 | 人 / 组织 / 系统 |
| `Concept` | 主张 | 可被争议的命题 |
| `Query` | 查询笔记 | 健康模板等；人不当 DSL 学 |
| `Note` | 笔记 | 其它 |

常见 `status:`：

| 用在 | 取值 |
| --- | --- |
| Source | `Unprocessed` / `Digested` |
| Summary | `Active` / `Superseded` |
| Concept | `Active` / `Contested` |

其它常见键：`tags`、`definition`、`related_to`、`contradicts`、`source`、`mentions`、`provenance`（`human` / `agent` / `ingested`）、`reviewed`、`evidence_tier`、`last_verified`。都可以不写。

## 库健康 11 条

内置目录，按文件名与 starter `health/*.md` 对齐。人只看标题，不写 QQL。

| 组 | 指标 |
| --- | --- |
| 结构 | 争议主张、孤儿、撞名 |
| 证据 | 主张饥饿度、单源主张、证据分布、陈旧来源 |
| 信任 | Agent 未复审、Agent 复审超期、未复审页、知识构成 |

总览六格来自图谱即时计算（与反链同一口径），不是第 12 条查询。信任三条依赖 `reviewed` / `provenance`；字段全空时数字会偏红，组下有说明。

## Agent 记忆

| 入口 | 是什么 |
| --- | --- |
| 设置 → Agent 记忆 | 一键给 Cursor / Claude Code 等写 MCP；安装 `wiki-ingest` |
| Agent 栏（工具栏机器人） | 应用内 ACP 会话 |
| `hot.md` | 库根约 500 词的缓存，整页覆写，不是日志 |
| `index.md` | Agent 在 `hot.md` 之后该读的目录 |

应用内 Agent 首轮和之后每隔数轮会读入 `hot.md`。写过库则请你更新。聊天记录永不进 vault。

## MCP 工具

内置 server `open-llm-wiki-mcp`，8 个工具：

| 工具 | 作用 |
| --- | --- |
| `list_notes` | 列出相对路径 |
| `read_note` | 正文 + 图摘要（反链 / 出链 / 断链 / 度数） |
| `write_note` | 写入并返回断链与孤儿提示 |
| `links` | 反链 / 出链 / 断链 / 孤儿 / 枢纽 / 建议 |
| `search_notes` | 全文 AND |
| `run_qql` | 求值查询（给 Agent，不给 GUI） |
| `vault_info` | 根路径与笔记数 |
| `lint_vault` | 结构 lint 候选，不改文件 |

`lint_vault` 只出候选：矛盾未标争议、争议没有 contradicts、Summary 挂在已废 Source、仍引用已废页、归一化撞名。

## 设置（用户能改的）

`⌘,`：主题、语言、默认编辑模式、附件布局、日志 profile。全部本地。

## 反馈

Issues：<https://github.com/rhythm1995/open-llm-wiki/issues>

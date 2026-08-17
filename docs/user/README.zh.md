# Open LLM Wiki 用户文档

<!-- README-I18N:START -->

[English](./README.md) | **简体中文**

<!-- README-I18N:END -->

这是给**使用这款应用的人**看的手册，不是给改源码的人看的。设计文档在 [../README.zh.md](../README.zh.md)。

Open LLM Wiki 把本机上的一个 Markdown 文件夹当作知识库（Vault）。笔记是文件，链接织成图谱，库健康告诉你下一步该补什么。

![编辑器三栏：导航、正文、反链](./images/editor-zh.png)

## 怎么读

按 [Diátaxis](https://diataxis.fr/) 分成四类。每次只打开你现在需要的那一类：

| 类型 | 你现在的状态 | 打开 |
| --- | --- | --- |
| **教程** | 第一次打开，想跟着做完一件事 | [tutorial.md](./tutorial.zh.md) |
| **操作指南** | 已经会开库，想完成一个具体任务 | [how-to.md](./how-to.zh.md) |
| **参考** | 记得有这个功能，想查快捷键或字段 | [reference.md](./reference.zh.md) |
| **概念** | 想搞懂「为什么这样设计」 | [concepts.md](./concepts.zh.md) |

应用内随时点顶栏 `⌘K` 旁边的 logo，可打开精简版简介。

## 先记住三件事

1. **Vault = 文件夹。** 没有专有数据库。用访达 / Finder 能看到的 `.md` 就是笔记。
2. **用 `[[wikilink]]` 连笔记，不要靠文件夹分类。** 图谱和反链都从链接算出来。
3. **不要学查询语言。** 看「库健康」；临时问题点「问 Agent」。

截图来自浏览器 mock 预览（界面与桌面版相同）。库健康的 QQL 明细只在桌面端求值；mock 仍显示图谱即时分数。

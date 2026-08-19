# Open LLM Wiki 用户文档

<!-- README-I18N:START -->

[English](./README.md) | **简体中文**

<!-- README-I18N:END -->

给**使用这款应用的人**。给改源码的人看的设计文档在 [../README.zh.md](../README.zh.md)。

Vault 是本机上的一个 Markdown 文件夹。应用把源编译成 wiki，把链接画成图谱，用库健康做 lint，并让任何 Agent 把同一座文件夹当长期记忆。没有账号，没有第二份数据库。

![编辑器三栏：导航、正文、反链](./images/editor-zh.png)

## 怎么读

按 [Diátaxis](https://diataxis.fr/) 分成四类。每次只打开你现在需要的那一类：

| 类型 | 你现在的状态 | 打开 |
| --- | --- | --- |
| **教程** | 第一次打开，想跟着做完一件事 | [教程](./tutorial.zh.md) |
| **操作指南** | 已经会开库，想完成一个具体任务 | [操作指南](./how-to.zh.md) |
| **参考** | 查快捷键、视图、字段或 MCP 工具 | [参考](./reference.zh.md) |
| **概念** | 想搞懂「为什么」 | [概念](./concepts.zh.md) |

应用内：Help → **User Guide**，或点顶栏 `⌘K` 旁的 logo。

## 五条规则

展开写在 [概念](./concepts.zh.md)。

1. **文件即真相。** 访达里的 `.md` 就是笔记。想走，带走文件夹。
2. **编译，不要每次检索。** Source 只提炼一次。以后的问题读这些页面，不是原始片段。
3. **Vault 就是记忆。** 应用内 ACP 和一键 MCP 接的是同一批文件。聊天不是记忆。
4. **链接优先于文件夹。** 关系写在 `[[wikilink]]` 和 frontmatter。`type:` 从不挡保存。
5. **库健康，不是查询语言。** 看分数和下一步。临时问题点「问 Agent」。

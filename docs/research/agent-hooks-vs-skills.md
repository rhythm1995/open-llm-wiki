# 调研:Agent Hooks vs Skills（vs 长 prompt）用于 Wiki Ingest

> 日期:2026-08-11 · 背景:Open LLM Wiki「提炼进 Wiki」交付形态选型。  
> 结论供 backlog `B-WIKI-SKILLS-NPM` / `B-WIKI-INGEST-HOOKS` 引用;不自动改产品默认。

## 1. 三层能力对照

| 机制 | 是什么 | 触发方式 | 适合 |
|------|--------|----------|------|
| **长 prompt** | 会话里塞完整 checklist | 用户/App 粘贴 | 原型;易丢、难升级 |
| **Skill** | 可发现的规程文档(`SKILL.md`) | Agent 按 description 选用 / 用户点名 | **多步判断流程**(ingest 蒸馏) |
| **MCP tools** | 读写 vault / QQL / lint | Agent 调用 | **能力面**(能不能做) |
| **Hooks** | 生命周期上跑脚本/检查(Claude Code / Cursor 等) | 确定性:Pre/PostToolUse、会话事件 | **门禁与自动化副作用**(必须 100% 发生的事) |

业界共识(Claude Code / Cursor 文档与 2025–2026 实践总结):

- **Skills = 概率性规程**(agent 判断是否遵循、如何填内容)。
- **Hooks = 确定性执行**(每次写文件后跑 lint、拦危险命令)。
- **MCP = 外部能力**。
- 组合拳:**Skills + MCP 覆盖 80% 工作流;Hooks 补强制规则**。

## 2. 对「提炼 / ingest」是否更适合 Hooks?

**否,不能作为主方案。** 原因:

1. **蒸馏是语义任务**,不是事件脚本。要从 Source 正文抽出 TL;DR / Concept / 矛盾,必须有 LLM 读与写——hook 脚本做不到「理解原文」。
2. **Hooks 跨产品碎片化**。Claude Code(`.claude/settings` hooks)、Cursor(`hooks.json`)、其它 agent 各一套;Open LLM Wiki 要服务多 agent + 应用内 ACP,**skill 文件 + MCP 更中性**。
3. **Hooks 通常绑在「某个项目/仓库目录」**,不是任意 Vault 自动生效——用户知识库路径与 agent 工程目录常不一致。
4. **Hooks 适合挂在 ingest 之后**,例如:
   - `PostToolUse` / after write:提醒跑 `lint_vault`、检查 Source 是否已 `Digested`、是否有 Summary 的 `source` 边;
   - 禁止在未备份时批量删笔记。
5. **应用内 ACP** 目前没有与 Claude/Cursor 同构的 hooks 配置面;按钮短触发 skill 仍是统一入口。

## 2.1 Hooks 入口在哪(用户怎么配)

Open LLM Wiki **应用内没有 Hooks 设置页**。Hooks 属于各家编码 Agent 自己的配置:

| Agent | 入口 / 配置位置 |
|-------|-----------------|
| **Claude Code** | 用户级 `~/.claude/settings.json`(或项目 `.claude/settings.json`)里的 `hooks` 字段;事件如 PreToolUse / PostToolUse / Stop 等。文档与社区多称 Settings → hooks,实质是 JSON 配置而非 OLW UI。 |
| **Cursor** | 项目 `.cursor/hooks.json` 或用户 `~/.cursor/hooks.json`;也可通过 Cursor 的 `/create-hook` 等命令生成。在 **以该目录为工作区** 打开时生效。 |
| **应用内 Agent(ACP)** | **无 hooks 入口**(当前架构未实现)。 |
| **Open LLM Wiki 桌面** | **无 hooks 入口**;记忆接入是 MCP setup,规程是 vault skill。 |

因此:要「对指定目录」用 hooks,须在**该目录作为 agent 工程打开时**配置上述文件——不能在 OLW 里点一下全局生效。

## 3. 推荐分层(与已实现方向一致)

```
触发: App「提炼进 Wiki」 / 用户说「ingest this」
  → 短指令: Run skill wiki-ingest on <path>
规程: vault skill wiki-ingest (SKILL.md)
能力: open-llm-wiki MCP
可选加固: hooks 在 write 后跑 doctor 式检查(后置,B-WIKI-INGEST-HOOKS)
```

## 4. 何时再做 Hooks 样例

出现以下信号再 seed 可选 hooks 模板:

- 用户反复漏跑 consolidate / Digested 不一致;
- 明确只要 Claude Code 或 Cursor 其中一家;
- 需要「每次 write_note 后强制 lint 摘要」的硬门禁。

在此之前:**不把 hooks 当 ingest 主路径**;npm skill 包 + MCP setup 优先(见 backlog `B-WIKI-SKILLS-NPM`)。

## 5. 参考

- Cursor Skills 目录:`.agents/skills/`、`.cursor/skills/` 等(项目级发现)。
- Claude Code:Skills vs Hooks 决策框架——hooks deterministic, skills probabilistic。
- 本仓库既有决策:不做 inkeep 式 skills marketplace(doc 12);文件式 vault skill 与之兼容。

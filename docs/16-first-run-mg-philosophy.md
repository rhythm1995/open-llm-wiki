# 首次启动理念 MG（Philosophy Motion Graphic）

> **状态**：审阅版满意（v4）· **已接入** `WelcomeEmpty`（无 Vault 时展示）  
> **产物**：[`brand/mg-philosophy.html`](../brand/mg-philosophy.html)  
> **品牌锁定**：[`brand/LOCK.md`](../brand/LOCK.md) · 主标仅 VI 板 panels 1–3 的 **raster**

本文把当前满意版本的**叙事、规格、生成 / 优化 prompt** 收成可 diff 的文档，方便以后改时长、文案、动效或嵌入欢迎台。

---

## 1. 目的与嵌入位

| 项 | 内容 |
|---|---|
| **目的** | 首次 / 无 Vault 时，用 10–15s 循环短片讲清产品理念，而不是空壳 +「打开 Vault」 |
| **受众** | 新装用户；不假设会 Obsidian 术语 |
| **拟嵌入** | 无 `root` 的欢迎台：产品名与主 CTA（「打开 Vault 文件夹」）**上方**；静音循环 |
| **退出** | 打开 Vault 后自然消失；MG 右上角 ✕ 可收起，并可勾选「以后默认右上角 logo」 |
| **当前** | 审阅源：`brand/mg-philosophy.html`；客户端：`WelcomePhilosophyMg` 嵌在 `WelcomeEmpty`；`vaultBootReady` 避免 lastRoot 恢复时闪欢迎台 |
| **偏好键** | `open-llm-wiki.welcomeMgPlacement` = `hero` \| `corner`（见 `ui/src/lib/welcome-mg-pref.ts`） |

---

## 2. 品牌硬约束（改 MG 时不许破）

1. **主标几何 SoT**：`brand/olw-vi-board.jpg` 的 **左上 / 构造 / App Icon** 三格。  
2. **产品可见主标必须是批准 raster**（见 LOCK 清单），例如：
   - `brand/olw-mark.png` / `olw-mark-transparent.png`
   - `brand/olw-mark-canonical.jpg` / `olw-mark-from-vi.jpg`
   - app：`app-icon-canonical.jpg` / `app-icon-1024.png` / `app-icon-flat-1024.png`
3. **禁止**：错误密网格 SVG、手画「六节点网单独一幕再变 logo」、用未审矢量冒充终帧。  
4. **动效脚手架**（描边 path）可以近似轮廓，但**定格帧必须是批准 PNG**，脚手架需淡出或被盖住。  
5. **色板**：Near black `#050A16` · Charcoal `#1F2A3C` · Sky `#7FC8FF` · Soft steel `#8A9AA6`。

---

## 3. 当前满意结构（v4 · 三幕 · ~12s 循环）

总时长建议 **12s**（`--duration: 12s`），可调 10–15s。

### 幕 1 · 文件即真相（约 0–25%）

| | |
|---|---|
| **画面** | 三张 `.md` 卡片微浮 + 「本机磁盘」指示点 |
| **文案** | 主：知识住在**你的文件夹**里，不在别人的云里 |
| **副** | 本机磁盘 · 文件即真相 |
| **意图** | 本地优先、Vault = 文件夹 |

### 幕 2 · 洞察晶格连线（约 25–60%）— **核心**

| | |
|---|---|
| **画面** | **一张**灯泡晶格：脚手架 path 描边生长 → 节点点亮 → **淡入批准主标 PNG 定格** |
| **文案** | `[[wikilink]]` 连成网 · 收成 **洞察晶格** |
| **意图** | 链接网络 = 主标本身；不再拆「六节点幕 + logo 幕」 |
| **不要** | 独立六节点图再 morph；会让人以为主标是另一套图 |

**动效分层（实现要点）**

1. `stroke-dashoffset`（`pathLength="1"`）分 3–4 批描 envelope / 内环 / 辐条 / 径向。  
2. 节点 `circle` 在描线中后段 pop-in。  
3. `olw-mark.png`（批准 raster）在描线将完成时 fade-in，脚手架 fade-out。  
4. 终帧用户只应看到 **正确主标**，不是脚手架几何。

### 幕 3 · Agent 蒸馏（约 60–95%）

| | |
|---|---|
| **画面** | Agent 卡片 → DISTILL 流光 → Vault 笔记行（Concept / Entity / Summary） |
| **标题** | Distill **what matters**. |
| **文案** | Agent 把对话与来源**蒸馏**进本地知识库 |
| **不要** | QQL / 查询引擎（次要能力，不进理念片） |

### 环间

- 底进度条 0→100% 与循环对齐。  
- 审阅页提供 Replay（重置 CSS animation）。

---

## 4. 技术规格（当前 HTML）

| 项 | 值 |
|---|---|
| 文件 | `brand/mg-philosophy.html` |
| 主标资源 | 同目录 `olw-mark.png`（= 批准 transparent / UI mark） |
| 舞台 | ~400×250（`aspect-ratio: 16/10`），嵌入欢迎台时宽约 360–400px |
| 字体 | Inter / SF Pro / PingFang |
| 实现 | 纯 HTML + CSS animation；无构建；无音轨 |
| 审阅 | 在 `brand/` 下用浏览器打开（需与 `olw-mark.png` 同目录） |

---

## 5. 生成 / 改版 Prompt 包（复制即用）

以下 prompt 供以后用 LLM / 设计工具重做或优化；**输出优先仍是可审阅 HTML**，嵌入客户端另开任务。

### 5.1 系统角色（System）

```text
你是 Open LLM Wiki 的品牌与动效设计师。产品是本地优先、文件即真相的 Markdown 知识库，
主标是「洞察晶格」灯泡：节点+边组成的经典灯泡轮廓（非密网格测地球、非 AI 紫光球）。

硬规则：
1) 终帧主标必须是批准 raster（olw-mark.png / VI 板 panels 1–3），禁止用错误 SVG 冒充品牌。
2) 理念片不讲 QQL、账号、云同步。
3) 动效脚手架 path 可以近似，但必须在终帧让位给批准 PNG。
4) 色板：#050A16 / #1F2A3C / #7FC8FF / #8A9AA6。
5) 输出单一自包含 HTML（或明确的分文件），可本地 file:// 打开审阅。
```

### 5.2 用户任务 Prompt（User · 完整重生成）

```text
为 Open LLM Wiki 做「首次启动理念 MG」审阅页 HTML。

目标：无 Vault 用户 12 秒内理解三件事——本地文件、链接成晶格、Agent 蒸馏。

结构（循环 12s，三幕，不要第四幕）：

幕1（0–25%）文件即真相
- 三张 .md 卡片微动
- 文案：「知识住在你的文件夹里，不在别人的云里」
- 副文案：本机磁盘 · 文件即真相

幕2（25–60%）洞察晶格 · 单图连线动画（关键）
- 禁止单独「六节点网」再切到 logo
- 在灯泡晶格上做连线生长（envelope → 内环 → 辐条）
- 节点随描线点亮
- 终帧必须显示同目录批准主标文件：olw-mark.png（透明底或黑底均可，object-fit contain）
- 脚手架 path 淡出；用户最终只看到正确主标
- 文案：「[[wikilink]] 连成网 · 收成 洞察晶格」

幕3（60–95%）Agent 蒸馏
- 左：Agent 卡片（长对话/来源）
- 中：DISTILL 流光
- 右：Vault 笔记行 Concept / Entity / Summary 依次出现
- 标题：Distill what matters.
- 文案：Agent 把对话与来源蒸馏进本地知识库
- 禁止出现 QQL、查询语言、数据库等次要能力

规格：
- 舞台约 400px 宽，16:10，深色 elev 背景，sky 点缀
- 底进度条与循环同步
- Replay 按钮重置动画
- 中文主文案；品牌英文 tagline 可保留 Distill what matters.
- 底部用简短 notes 说明「未接入客户端 / 主标 raster 锁定」

参考品牌锁定：olw-vi-board.jpg 仅 panels 1–3 为主标真相；见 brand/LOCK.md。
```

### 5.3 增量优化 Prompt（User · 小改）

```text
在现有 brand/mg-philosophy.html（v4）上改，不要推翻叙事：

保留：三幕结构、批准 olw-mark.png 终帧、无六节点独立幕、无 QQL。
请只改：
- [ ] 总时长改为 __ s
- [ ] 幕2 描线节奏 / 缓动
- [ ] 文案：______
- [ ] 幕3 Agent 视觉
- [ ] 嵌入尺寸（宽 __ px）

约束：脚手架 path 不得在终帧压过 olw-mark.png；色板与 LOCK 不变。
输出完整 HTML 或 unified diff。
```

### 5.4 主标资源 Prompt（若需重导出 raster · 禁止乱画矢量）

```text
从 brand/olw-vi-board.jpg 仅提取 TOP-LEFT 主标（及可选 TOP-RIGHT app icon）。
要求：与板内几何一致——经典灯泡轮廓、节点+细边、双螺口条、#7FC8FF、黑底或透明底。
禁止：密网格测地球、多出一圈装饰轨道、渐变玻璃、假 3D。
输出：正方形 1024 PNG（透明主标 + 可选 near-black app flat）。
```

### 5.5 嵌入客户端时的实现提示（给工程 · 非生成）

```text
当接入 WelcomeEmpty：
1) 复用 brand/mg-philosophy.html 的 stage 片段或抽成 React 组件 + CSS module。
2) 主标用 /olw-mark.png（ui/public，来自批准 transparent）。
3) 仅在 !root 时渲染；openVault 成功后卸载。
4) prefers-reduced-motion: reduce 时跳过描线，直接显示定格主标 + 静态文案。
5) 不要在客户端重新引入错误 SVG 主标。
```

---

## 6. 已否决方案（避免回潮）

| 方案 | 原因 |
|---|---|
| 六节点网 → 再淡入 logo 两段式 | 节点网本就是主标的一部分；两段像两套资产 |
| 错误密网格 SVG 当主标 / 当终帧 | 与 VI 板 panels 1–3 不符 |
| 理念片讲 QQL / 图谱高级功能 | 次要；冲淡「本地 + 链接 + 蒸馏」 |
| 强制多步 wizard / 注册 | 与本地优先、零账户冲突 |

---

## 7. 版本记录

| 版本 | 要点 |
|---|---|
| v1–v2 | 四/三幕探索；曾用独立图 + 错误矢量 |
| v3 | 六节点 + logo 融合尝试；主标改用批准 raster |
| **v4（当前满意）** | 去掉六节点独立幕；**单图晶格连线 → 定格正确主标**；Agent 蒸馏无 QQL；brand 侧删除全部错误 SVG |

---

## 8. 指针

- 审阅产物：[`brand/mg-philosophy.html`](../brand/mg-philosophy.html)  
- 主标锁定：[`brand/LOCK.md`](../brand/LOCK.md)  
- 欢迎台（无 Vault）：`ui/src/components/WelcomeEmpty.tsx`（未来挂 MG 的位置）  
- 产品 tagline（VI 板）：*Distill what matters.* — insight lattice for local knowledge  

# 09 — 产品大件 v1 切片(SHEET / PLUGIN / MCP / QQL-TS)

> 2026-07-30。四项均为 🔴 大件;本轮交付**可用 v1**,非「空注册器」占位。  
> 原则:复用 `openobs-core` 语义;前端 mock 可跑;桌面/agent 真路径可接。

## 范围总表

| ID | v1 交付 | 明确非目标 |
|---|---|---|
| **B-QQL-TS** | ~~TS 全量解析+求值;mock `run_qql` 走 TS~~ **已删(2026-08-02)**:QQL 用户面整体移除,TS 重写 `ui/src/lib/qql/*` + `mock-qql` 一并清掉。引擎仅留 Rust core + MCP `run_qql`,待 6B 用 NL 重建表面。详见 [04](./04-features.md) F-QUERY。 | — |
| **B-MCP** | 独立 `openobs-mcp` stdio JSON-RPC:list/read/write/search/qql | OAuth、远程 HTTP、细粒度多租户权限 |
| **B-PLUGIN** | v1 宿主保留 | **产品决定不做深化**(商店/签名/vault 扫描 UI) |
| **B-SHEET** | v2:多表、冻结、图表、md 嵌入、SUM 族、IronCalc 可选 | **⛔ 不做**:XLSX 全量导入导出、实时协作(对照 Obsidian 核心亦非主路径;共享靠 git) |

## 架构落点

```
ui/src/lib/qql/*     ← ❌ 已删(QQL 用户面移除;引擎改由 Rust core + MCP 独占)
mcp/                 ← Rust bin: openobs-core + vault fs, MCP tools(含 `run_qql`,agent 用)
ui/src/lib/plugin-*  ← 宿主 API / 加载 vault `.openobs/plugins/`
ui/src/lib/sheet.ts  ← schema + 公式求值;SheetView 网格
  + app 打开 .sheet 同 .canvas 路由
```

## 验收

1. ~~QQL-TS:单测覆盖 WHERE/AND/OR/NOT/CONTAINS/IN/SORT/LIMIT/SHOW/RENDER;mock 内联 qql 有结果。~~ **已删(2026-08-02)**,见上 B-QQL-TS 行。  
2. MCP:`cargo run -p openobs-mcp -- /path/to/vault` + tools/list 非空;read/write 真文件。  
3. PLUGIN:启用示例插件可注册 ⌘K 命令;崩溃不拖垮主线程(iframe)。  
4. SHEET:新建 `.sheet`、编辑格、`=A1+1` 显示结果、保存 JSON。  
5. backlog §B 四项标 ✅(v1)并写清非目标。

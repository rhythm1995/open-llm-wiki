# OpenObsidian

> ⚠️ 工作名(占位)。**公开发布前必须改为自创名**——见 [docs/07-provenance.md](./docs/07-provenance.md#命名闸门硬约束公开前必做)。

本地优先、文件即真相、MIT 许可的知识管理 app。以 Tolaria 的公开设计与实现为蓝本参考(clean-room 重写,未复制源码),补齐 Obsidian 最被需要的两件事:**图谱可视化** 与 **实时聚合查询**。

## 状态

🚧 早期开发中。当前:完整设计文档 + Rust core 地基(TDD)。

- 设计:[docs/](./docs/) —— 先读 [docs/README.md](./docs/README.md)
- 待你拍板的事:[docs/open-questions.md](./docs/open-questions.md)
- 路线图:[docs/06-roadmap.md](./docs/06-roadmap.md)

## 架构一句话

```
ui (React) ──IPC──▶ app/src-tauri (薄壳) ──▶ core (Rust, 纯逻辑, 全测试)
```

核心逻辑(解析/图谱/查询)在 `core/`,纯函数、IO-free、TDD。

## 开发

```bash
cargo test                 # 跑 core 全部测试
# 前端待 Phase 2 起步
```

## 许可

MIT —— 见 [LICENSE](./LICENSE)。设计参考自 [Tolaria](https://github.com/refactoringhq/tolaria)(AGPL,代码未复制)与 Obsidian 的公开功能;均重写为自己的表达。

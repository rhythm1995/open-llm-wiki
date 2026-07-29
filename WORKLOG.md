# WORKLOG

> **Append-only 工作日志**。任何 agent:**开工前读最近 ~10 条**,**收工后追加一条**。格式:
>
> ```
> ### YYYY-MM-DD <agent> — <一句话摘要>
> - **branch**: <branch>(已 / 未 push,已 / 未合并 main)
> - **做了**: …
> - **理由 / 影响**: …
> - **下一步 / 接手注意**: …
> ```
>
> **永不修改历史条目**。**新条目加在最上方**(倒序),让最新交接是读者第一眼看到的。
> 本日志是可读叙事,不是状态机;结构化任务用 GitHub Issues。

---

### 2026-07-30 Claude Code — 搜索三 scope 重构 / 默认 wysiwyg / 笔记右键菜单

- **branch**: `feat/phase1-core`(本地 3 commits `23dafce` `467c6da` `6f77c9a`,已 push origin 该分支更早的提交,这 3 个新 commit **尚未 push**)。
- **做了**:
  1. 第二栏表头从静态「全部笔记」标签改成**即时过滤框**(title+preview 子串),顺带消除「点 search 后第二栏仍高亮全部笔记」的残留态 bug。
  2. `editMode` 默认 `source` → **`wysiwyg`**(新用户即开即所见即所得)。
  3. 搜索分三 scope:第二栏过滤(小)/ ⌘F FindBar(`window.find()`,source + wysiwyg 双模式通用)/ ⌘⇧F 全库(现有 `ipc.searchNotes`)。⌘K 命令面板按钮图标放大镜 → Command,去掉「两个放大镜」。
  4. 第二栏笔记行**右键菜单**:重命名 / 复制 `[[wikilink]]` / 切 status(Active/Contested/Superseded/Draft + 清除)/ 归档(confirm)/ Reveal in Finder(桌面专用,mock 隐藏)。
- **顺手修的真 bug**:inline 重命名提交后列表标题不刷新——新 H1 落盘发生在 `renameNote` 的 `refreshIndex` 之后,索引里 body 仍是占位 H1。给 `commitDraftRename` 末尾补 `await refreshIndex(root)`。
- **新后端命令**:`reveal_in_finder`(macOS `open -R` / Windows `explorer /select,` / Linux `xdg-open <parent>`),已注册进 `generate_handler!`。
- **CI 门**:typecheck clean · `test:cov` 67.84% · e2e 12/12 · `cargo test -p openobs-core` + `-p openobs-app` 绿 · `pnpm --dir ui build` OK。
- **下一步 / 接手注意**:
  - ⌘F 的 `window.find()` 是非标准 API,**Tauri WKWebView 真机需验证**;若不稳,fallback = 给 source 模式加 `@codemirror/search`(后置,未做)。
  - `editMode` 存 localStorage;老设备若之前存过 `"source"`,需手动切一次或清 `openobs.editMode` 才看得到 wysiwyg 默认。
  - 本批 3 commits 未 push;接手前先 `git pull` / 确认是否要我 push。

/**
 * i18n —— 界面文案的字典与查找(F-L10N 基础)。
 *
 * 纯逻辑、无 IO:`translate(locale, key, vars?)` 在字典里查 key,缺失时回退到默认
 * 语言(zh),再回退到 key 本身。`format` 做 `{name}` 占位符插值。持久化与 React
 * 绑定见 `useLocale.ts`。
 *
 * 键用稳定的英文 dot-path id(如 "view.editor"),值是各语言文案。新增界面字符串
 * 时:在此加键 + zh/en 两语值,组件里把硬编码换成 `t("…")`。
 *
 * 范围说明:本字典先覆盖**顶层 chrome**(工具栏 / 状态栏 / 命令面板 / Inspector /
 * 空状态);深层面板(GitPanel / QueryPanel / SearchPanel / TrashPanel / Sidebar /
 * NewNoteDialog)的字符串仍为中文,沿用同一 `t()` 模式逐步迁移(见路线图)。
 */

export type Locale = "zh" | "en";

/** 翻译函数的形状(组件 prop 用,避免耦合到 hook 类型)。 */
export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

export const LOCALE_STORAGE_KEY = "openobs.locale";
export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALES: Locale[] = ["zh", "en"];

/** 字典:键 → 各语言文案。 */
export const dict: Record<Locale, Record<string, string>> = {
  zh: {
    // 视图名
    "view.editor": "编辑器",
    "view.graph": "图谱",
    "view.query": "查询",
    "view.search": "搜索",
    "view.trash": "回收站",
    "view.git": "Git",
    // 工具栏
    "toolbar.save": "立即保存",
    "toolbar.palette": "命令面板 (⌘K)",
    "toolbar.theme.light": "切换到浅色",
    "toolbar.theme.dark": "切换到深色",
    "toolbar.locale.toEn": "Switch to English",
    "toolbar.locale.toZh": "切换为中文",
    // 状态栏
    "status.saving": "保存中",
    "status.saved": "已保存",
    "status.dirty": "未保存",
    "status.idle": "就绪",
    "status.notes": "{n} 篇笔记",
    "status.mock": "mock 模式",
    // 命令面板
    "palette.placeholder": "搜索笔记或输入命令…",
    "palette.section.notes": "笔记",
    "palette.empty": "无匹配项。",
    "palette.action.openVault": "打开 Vault",
    "palette.action.newNote": "新建笔记",
    "palette.action.viewPrefix": "视图:",
    "palette.title": "命令面板",
    // Inspector
    "inspector.noSelection": "无选中笔记",
    "inspector.tab.backlinks": "反链",
    "inspector.tab.props": "属性",
    "inspector.tab.outline": "大纲",
    "inspector.backlinks.empty": "没有指向此笔记的链接。",
    "inspector.props.empty": "此笔记无 frontmatter。",
    "inspector.outline.empty": "此笔记无标题。",
    "inspector.props.add": "新增属性",
    "inspector.props.keyPlaceholder": "键名",
    "inspector.props.valuePlaceholder": "值",
    "inspector.props.listPlaceholder": "逗号分隔",
    "inspector.props.emptyValue": "空",
    "inspector.props.delete": "删除该属性",
    "inspector.ai.copy": "复制为 AI 上下文(当前笔记 + 其链接到的笔记)",
    // 空状态
    "empty.selectOrCreate": "从左侧选择一篇笔记,或新建一篇开始。",
    "common.close": "关闭",
    "common.confirm": "确认",
    // 画布(F-CANVAS;tldraw,非商用许可,见 THIRD_PARTY_NOTICES)
    "canvas.poweredBy": "由 tldraw 驱动",
    "canvas.namePrompt": "画布名称:",
    "canvas.loading": "画布加载中…",
    "palette.action.newCanvas": "新建画布",
    "sidebar.newCanvas": "画布",
    // 通用
    "common.cancel": "取消",
    // app 级
    "app.unresolvedConfirm": "「{target}」尚不存在,是否新建?",
    // 左栏 / 文件树
    "sidebar.openVault": "打开 Vault",
    "sidebar.newNote": "新建笔记",
    "sidebar.newNoteShort": "新建",
    "sidebar.files": "文件",
    "sidebar.empty": "尚未打开 vault。点击「打开 Vault」选择一个 Markdown 文件夹。",
    "sidebar.renamePrompt": "重命名为:",
    "sidebar.rename": "重命名",
    "sidebar.delete": "删除",
    "sidebar.trashConfirm": "移入回收站「{name}」?\n可在「回收站」视图恢复或彻底删除。",
    // 新建笔记对话框
    "newNote.title": "新建笔记",
    "newNote.namePlaceholder": "名称(可含路径,如 sources/foo)",
    "newNote.template": "模板",
    "newNote.noTemplate": "(空模板)",
    "newNote.create": "创建",
    // 搜索面板
    "search.title": "搜索",
    "search.placeholder": "输入关键词(空格分隔,AND)",
    "search.go": "搜索",
    "search.empty": "无结果。",
    // QQL 查询面板
    "query.title": "QQL 查询",
    "query.run": "运行",
    "query.running": "运行中…",
    "query.count": "计数",
    "query.sum": "求和",
    "query.group": "分组",
    "query.noteCol": "笔记",
    "query.empty": "无匹配行。(mock 浏览器模式下 QQL 返回空 —— 请用 Tauri 构建以获得完整求值。)",
    // Git 面板
    "git.empty": "未打开 vault。",
    "git.refresh": "刷新",
    "git.mockHint": "mock 模式:git 命令不可用。请在桌面 app 中打开一个 git 仓库后使用。",
    "git.changes": "变更({n})",
    "git.clean": "工作区干净,无待提交改动。",
    "git.commitSection": "提交(git add -A + commit)",
    "git.commitPlaceholder": "提交信息…",
    "git.committing": "提交中…",
    "git.commitAll": "提交全部改动",
    "git.recentCommits": "最近提交({n})",
    "git.noHistory": "无提交历史。",
    // 回收站
    "trash.count": "{n} 篇",
    "trash.empty": "清空",
    "trash.emptyTitle": "清空回收站",
    "trash.emptyConfirm": "彻底清空回收站(共 {n} 篇)?此操作不可撤销。",
    "trash.emptyState": "回收站为空。",
    "trash.emptyHint": "删除的笔记会先到这里,可随时恢复。",
    "trash.restore": "还原",
    "trash.purge": "删除",
    "trash.purgeConfirm": "彻底删除「{name}」?此操作不可撤销。",
    // 编辑/阅读切换
    "editor.toRead": "切换到阅读视图",
    "editor.toEdit": "切换到编辑视图",
    // 图谱视图
    "graph.empty": "图谱为空 —— 打开一个含链接的 vault。",
    "graph.stats": "{nodes} 节点 · {edges} 边",
    "graph.truncated": " · 布局截断至 {n}",
    "graph.zoomIn": "放大",
    "graph.zoomOut": "缩小",
    "graph.resetView": "重置视图",
    "graph.filter": "过滤",
    "graph.typeSection": "类型",
    "graph.typeless": "无类型",
    "graph.tagSection": "标签",
    "graph.edgeSection": "边类型",
    "graph.edgeWiki": "正文链接",
    "graph.edgeRelation": "frontmatter 关系",
    "graph.hideOrphans": "隐藏孤儿节点",
    "graph.focusNeighborhood": "聚焦邻域",
    "graph.hops": "跳数",
    "graph.focusCurrent": "聚焦当前笔记",
    "graph.resetFilter": "重置过滤",
  },
  en: {
    "view.editor": "Editor",
    "view.graph": "Graph",
    "view.query": "Query",
    "view.search": "Search",
    "view.trash": "Trash",
    "view.git": "Git",
    "toolbar.save": "Save now",
    "toolbar.palette": "Command palette (⌘K)",
    "toolbar.theme.light": "Switch to light",
    "toolbar.theme.dark": "Switch to dark",
    "toolbar.locale.toEn": "Switch to English",
    "toolbar.locale.toZh": "切换为中文",
    "status.saving": "Saving…",
    "status.saved": "Saved",
    "status.dirty": "Unsaved",
    "status.idle": "Ready",
    "status.notes": "{n} notes",
    "status.mock": "mock mode",
    "palette.placeholder": "Search notes or type a command…",
    "palette.section.notes": "Notes",
    "palette.empty": "No matches.",
    "palette.action.openVault": "Open Vault",
    "palette.action.newNote": "New note",
    "palette.action.viewPrefix": "View: ",
    "palette.title": "Command palette",
    "inspector.noSelection": "No note selected",
    "inspector.tab.backlinks": "Backlinks",
    "inspector.tab.props": "Properties",
    "inspector.tab.outline": "Outline",
    "inspector.backlinks.empty": "No links point to this note.",
    "inspector.props.empty": "This note has no frontmatter.",
    "inspector.outline.empty": "This note has no headings.",
    "inspector.props.add": "Add property",
    "inspector.props.keyPlaceholder": "key",
    "inspector.props.valuePlaceholder": "value",
    "inspector.props.listPlaceholder": "comma-separated",
    "inspector.props.emptyValue": "empty",
    "inspector.props.delete": "Delete property",
    "inspector.ai.copy": "Copy as AI context (this note + its linked notes)",
    "empty.selectOrCreate": "Select a note from the left, or create one to start.",
    "common.close": "Close",
    "common.confirm": "Confirm",
    "canvas.poweredBy": "Powered by tldraw",
    "canvas.namePrompt": "Canvas name:",
    "canvas.loading": "Loading canvas…",
    "palette.action.newCanvas": "New canvas",
    "sidebar.newCanvas": "Canvas",
    "common.cancel": "Cancel",
    "app.unresolvedConfirm": "\"{target}\" does not exist yet. Create it?",
    "sidebar.openVault": "Open Vault",
    "sidebar.newNote": "New note",
    "sidebar.newNoteShort": "New",
    "sidebar.files": "Files",
    "sidebar.empty": "No vault open. Click \"Open Vault\" to pick a Markdown folder.",
    "sidebar.renamePrompt": "Rename to:",
    "sidebar.rename": "Rename",
    "sidebar.delete": "Delete",
    "sidebar.trashConfirm": "Move \"{name}\" to trash?\nRestore or permanently delete it from the Trash view.",
    "newNote.title": "New note",
    "newNote.namePlaceholder": "name (path allowed, e.g. sources/foo)",
    "newNote.template": "Template",
    "newNote.noTemplate": "(blank)",
    "newNote.create": "Create",
    "search.title": "Search",
    "search.placeholder": "keywords (space-separated, AND)",
    "search.go": "Search",
    "search.empty": "No results.",
    "query.title": "QQL query",
    "query.run": "Run",
    "query.running": "Running…",
    "query.count": "Count",
    "query.sum": "Sum",
    "query.group": "Group",
    "query.noteCol": "Note",
    "query.empty": "No matching rows. (QQL returns nothing in mock browser mode — use the Tauri build for full evaluation.)",
    "git.empty": "No vault open.",
    "git.refresh": "Refresh",
    "git.mockHint": "mock mode: git is unavailable. Open a git repository in the desktop app to use it.",
    "git.changes": "Changes ({n})",
    "git.clean": "Working tree clean — nothing to commit.",
    "git.commitSection": "Commit (git add -A + commit)",
    "git.commitPlaceholder": "Commit message…",
    "git.committing": "Committing…",
    "git.commitAll": "Commit all changes",
    "git.recentCommits": "Recent commits ({n})",
    "git.noHistory": "No commit history.",
    "trash.count": "{n} items",
    "trash.empty": "Empty",
    "trash.emptyTitle": "Empty trash",
    "trash.emptyConfirm": "Permanently empty the trash ({n} items)? This cannot be undone.",
    "trash.emptyState": "Trash is empty.",
    "trash.emptyHint": "Deleted notes land here first — restore anytime.",
    "trash.restore": "Restore",
    "trash.purge": "Delete",
    "trash.purgeConfirm": "Permanently delete \"{name}\"? This cannot be undone.",
    "editor.toRead": "Switch to reading view",
    "editor.toEdit": "Switch to edit view",
    "graph.empty": "Graph is empty — open a vault with links.",
    "graph.stats": "{nodes} nodes · {edges} edges",
    "graph.truncated": " · layout truncated to {n}",
    "graph.zoomIn": "Zoom in",
    "graph.zoomOut": "Zoom out",
    "graph.resetView": "Reset view",
    "graph.filter": "Filter",
    "graph.typeSection": "Type",
    "graph.typeless": "no type",
    "graph.tagSection": "Tags",
    "graph.edgeSection": "Edge type",
    "graph.edgeWiki": "body wikilink",
    "graph.edgeRelation": "frontmatter relation",
    "graph.hideOrphans": "Hide orphan nodes",
    "graph.focusNeighborhood": "Focus neighborhood",
    "graph.hops": "hops",
    "graph.focusCurrent": "Focus current note",
    "graph.resetFilter": "Reset filters",
  },
};

/** `{name}` 占位符插值;未提供的占位符原样保留。 */
export function format(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    vars[k] != null ? String(vars[k]) : m,
  );
}

/** 按 locale 查 key;缺失回退到默认语言,再回退到 key 本身。最后做插值。 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = dict[locale]?.[key] ?? dict[DEFAULT_LOCALE]?.[key] ?? key;
  return format(entry, vars);
}

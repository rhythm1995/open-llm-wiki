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
    "palette.action.newCanvas": "新建画布",
    "sidebar.newCanvas": "画布",
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
    "palette.action.newCanvas": "New canvas",
    "sidebar.newCanvas": "Canvas",
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

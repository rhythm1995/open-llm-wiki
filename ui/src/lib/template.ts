/**
 * F-TEMPLATES 模板的纯逻辑(无 IO)。
 *
 * vault 根下 `templates/` 目录里的 .md 即模板。新建笔记时可选一个模板作为
 * 初始内容,并做变量替换:`{{title}}` / `{{name}}` → 新笔记标题;`{{date}}`
 * → 当天日期(由调用方传入,运行时取,本模块不碰时间)。
 *
 * 仅做字符串与路径的纯计算;读模板内容、写新笔记是 IO,在 store / app 层。
 */
export const TEMPLATES_DIR = "templates";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const replaceVar = (body: string, key: string, value: string): string =>
  body.replace(new RegExp(`{{\\s*${key}\\s*}}`, "gi"), value);

/**
 * 应用模板变量:`{{title}}`/`{{name}}` → vars.title;`{{date}}` → vars.date(若给)。
 * 未传入的变量(date 缺省)其占位符原样保留,便于用户事后手填。
 */
export function applyTemplate(
  body: string,
  vars: { title: string; date?: string },
): string {
  let out = replaceVar(body, "name", escapeRegExp(vars.title));
  out = replaceVar(out, "title", escapeRegExp(vars.title));
  if (vars.date !== undefined) {
    out = replaceVar(out, "date", vars.date);
  }
  return out;
}

/** 默认空模板:以标题(取路径末段)为 H1。 */
export function defaultTemplate(name: string): string {
  const stem = name.split("/").pop() ?? name;
  return `# ${stem.replace(/\.md$/i, "")}\n\n`;
}

/** 该相对路径是否位于 templates/ 下。 */
export function isTemplatePath(path: string): boolean {
  return path === TEMPLATES_DIR || path.startsWith(`${TEMPLATES_DIR}/`);
}

/** 模板文件相对路径 → 展示名(去 `templates/` 前缀与 `.md` 后缀,保留子目录)。 */
export function templateName(path: string): string {
  const rel = isTemplatePath(path)
    ? path.slice(TEMPLATES_DIR.length + 1)
    : path;
  return rel.replace(/\.md$/i, "");
}

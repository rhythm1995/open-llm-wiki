/**
 * git-parse —— `git status --porcelain=v1` 与 `git log` 输出的**纯字符串解析**(F-GIT)。
 *
 * 设计与项目惯例一致:命令(Rust)只做 IO,返回 git 的原始 stdout 字符串;解析是
 * 纯逻辑、无 IO、可单测,放前端。Rust 端用 `std::process::Command` 调系统 `git`
 * 并 `current_dir(vault)`,故**仅在 Tauri 桌面 app 打开一个真正的 git 仓库时生效**;
 * 浏览器 mock 模式下 git 不可用(面板会提示)。
 *
 * 参考格式:
 * - porcelain v1:每行 `XY <path>`。X=索引区状态、Y=工作区状态;`??` 未跟踪、
 *   `!!` 忽略;重命名/拷贝在非 -z 模式下写作 `old -> new`。
 * - log:我们让后端用 `--format=%H%x09%an%x09%ad%x09%s --date=short`,故每行是
 *   制表符分隔的 `hash<TAB>author<TAB>date<TAB>subject`。
 */

/** `git status` 单条结果。 */
export interface GitStatusEntry {
  /** 原始 XY 两字符(如 " M"、"M "、"A "、"D "、"R "、"??")。 */
  raw: string;
  /** 显示路径(重命名取新名)。 */
  path: string;
  /** 仅重命名/拷贝:原文件名。 */
  renamedFrom?: string;
  /** 未跟踪(`??`)。 */
  untracked: boolean;
  /** 忽略(`!!`)。 */
  ignored: boolean;
  /** X 字符:索引区状态。 */
  index: string;
  /** Y 字符:工作区状态。 */
  worktree: string;
}

/** `git log` 单条结果。 */
export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

const RENAME_ARROW = " -> ";

/**
 * 解析 `git status --porcelain=v1` 的完整 stdout。
 * 跳过空行;长度 < 3(不可能出现合法行)跳过。重命名/拷贝行拆出 `renamedFrom`。
 */
export function parseStatusPorcelain(out: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  for (const line of out.split("\n")) {
    if (line === "" || line.length < 3) continue;
    const index = line[0];
    const worktree = line[1];
    let path = line.slice(3);
    let renamedFrom: string | undefined;
    if ((index === "R" || index === "C") && path.includes(RENAME_ARROW)) {
      const i = path.indexOf(RENAME_ARROW);
      renamedFrom = path.slice(0, i);
      path = path.slice(i + RENAME_ARROW.length);
    }
    entries.push({
      raw: line.slice(0, 2),
      path,
      renamedFrom,
      untracked: index === "?" && worktree === "?",
      ignored: index === "!" && worktree === "!",
      index,
      worktree,
    });
  }
  return entries;
}

/**
 * 解析 `git log --format=%H%x09%an%x09%ad%x09%s` 的完整 stdout。
 * 跳过空行与字段不足的行;subject 内若含制表符会被合并保留。
 */
export function parseLog(out: string): GitLogEntry[] {
  const entries: GitLogEntry[] = [];
  for (const line of out.split("\n")) {
    if (line === "") continue;
    const parts = line.split("\t");
    const [hash, author, date] = parts;
    if (!hash || author === undefined || date === undefined) continue;
    const subject = parts.slice(3).join("\t");
    entries.push({ hash, author, date, subject });
  }
  return entries;
}

/** 状态 → 简短中文标签(用于徽标着色)。 */
export function statusLabel(entry: GitStatusEntry): string {
  if (entry.untracked) return "新";
  if (entry.ignored) return "略";
  const { index, worktree } = entry;
  if (index === "A") return "加";
  if (index === "R") return "更名";
  if (index === "C") return "拷";
  if (index === "D" || worktree === "D") return "删";
  if (index === "M" || worktree === "M") return "改";
  if (index === "U" || worktree === "U") return "冲";
  return entry.raw.trim() || "?";
}

/** 是否为未合并/冲突路径(XY 任一为 U,或双方均改的 AA/DD 等)。 */
export function isConflictEntry(entry: GitStatusEntry): boolean {
  return entry.index === "U" || entry.worktree === "U" || entry.raw === "AA" || entry.raw === "DD";
}

/** status 列表中是否含冲突路径。 */
export function hasConflicts(entries: GitStatusEntry[]): boolean {
  return entries.some(isConflictEntry);
}

/** 抽出冲突路径(给 UI 横幅列表)。 */
export function conflictPaths(entries: GitStatusEntry[]): string[] {
  return entries.filter(isConflictEntry).map((e) => e.path);
}

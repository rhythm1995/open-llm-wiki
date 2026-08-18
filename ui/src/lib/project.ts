/** 本项目公开仓库(界面反馈 / clone / Releases 用这一处)。 */
export const PROJECT_REPO_URL = "https://github.com/rhythm1995/open-llm-wiki";
export const PROJECT_ISSUES_URL = `${PROJECT_REPO_URL}/issues`;
/** GitHub Pages 用户文档入口(与 site.yml SITE_BASE 对齐)。 */
export const PROJECT_DOCS_URL =
  "https://rhythm1995.github.io/open-llm-wiki/docs/start";

export const EXTERNAL_OPEN_WINDOW_MS = 800;

export type ExternalOpenGate = { url: string; at: number };

/** 同一 URL 在短窗口内只放行一次(菜单监听泄漏时不会连开多个窗口)。 */
export function shouldOpenExternal(
  prev: ExternalOpenGate | null,
  url: string,
  now: number,
  windowMs = EXTERNAL_OPEN_WINDOW_MS,
): boolean {
  if (prev && prev.url === url && now - prev.at < windowMs) return false;
  return true;
}

let gate: ExternalOpenGate | null = null;
let opener: ((url: string) => void) | null = null;

export function resetExternalOpenGate(): void {
  gate = null;
}

/** 测试注入打开器;传 null 恢复默认 ipc。 */
export function setExternalOpenerForTests(
  fn: ((url: string) => void) | null,
): void {
  opener = fn;
}

function defaultOpen(url: string): void {
  void import("./ipc").then(({ ipc }) => {
    void ipc.openExternalUrl(url);
  });
}

export function openProjectUrl(url: string, now = Date.now()): boolean {
  if (!shouldOpenExternal(gate, url, now)) return false;
  gate = { url, at: now };
  (opener ?? defaultOpen)(url);
  return true;
}

export function openProjectIssues(): void {
  openProjectUrl(PROJECT_ISSUES_URL);
}

export function openUserDocs(): void {
  openProjectUrl(PROJECT_DOCS_URL);
}


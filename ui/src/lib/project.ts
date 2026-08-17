/** 本项目公开仓库(界面反馈 / clone / Releases 用这一处)。 */
export const PROJECT_REPO_URL = "https://github.com/rhythm1995/open-llm-wiki";
export const PROJECT_ISSUES_URL = `${PROJECT_REPO_URL}/issues`;

export function openProjectIssues(): void {
  void import("./ipc").then(({ ipc }) => {
    void ipc.openExternalUrl(PROJECT_ISSUES_URL);
  });
}

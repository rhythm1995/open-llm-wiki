/**
 * E2E 移动壳(doc 18 M1)—— 浏览器 mock + 窄视口(390×844)即渲染移动分支
 * (platform="browser" + resolveMobileLayout 断点),与 iOS 真机同一条代码路径。
 *
 * 覆盖:移动壳渲染 / 抽屉导航选笔记回编辑 / 图谱与更多标签 / 搜索面板入口;
 * 桌面回归由其余 spec(默认桌面视口)守护。
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function mobileReady(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("mobile-tabbar")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("移动壳(窄视口浏览器预览)", () => {
  test("渲染移动壳:顶栏 + 底栏 + 编辑器,而非桌面三栏", async ({ page }) => {
    await page.goto("/");
    await mobileReady(page);
    await expect(page.getByTestId("mobile-topbar")).toBeVisible();
    // mock 自动开库 → notes 标签直接是编辑器(CodeMirror 挂载)。
    await expect(page.locator(".cm-editor")).toBeVisible();
    // 桌面三栏的笔记列表(未开抽屉)与右栏不渲染。
    await expect(page.getByTestId("note-list")).toHaveCount(0);
    await expect(page.getByTestId("mobile-drawer")).toHaveCount(0);
  });

  test("抽屉:打开 → 选笔记 → 关抽屉回编辑", async ({ page }) => {
    await page.goto("/");
    await mobileReady(page);
    await page.getByTestId("mobile-drawer-open").click();
    const drawer = page.getByTestId("mobile-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("nav")).toBeVisible();
    await expect(drawer.getByText("Zettelkasten", { exact: true })).toBeVisible();
    await drawer.getByText("Zettelkasten", { exact: true }).click();
    await expect(page.getByTestId("mobile-drawer")).toHaveCount(0);
    // 编辑器内容跟随所选笔记。
    await expect(page.locator(".cm-content")).toContainText("Zettelkasten");
  });

  test("图谱与更多标签;更多页展示 vault 信息", async ({ page }) => {
    await page.goto("/");
    await mobileReady(page);
    await page.getByTestId("mobile-tab-graph").click();
    await expect(page.getByTestId("graph-view")).toBeVisible();
    await page.getByTestId("mobile-tab-more").click();
    const more = page.getByTestId("mobile-more");
    await expect(more).toBeVisible();
    await expect(more).toContainText("mock-vault");
  });

  test("顶栏搜索入口打开命令面板(search 模式)", async ({ page }) => {
    await page.goto("/");
    await mobileReady(page);
    await page.getByTestId("mobile-search").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
  });
});

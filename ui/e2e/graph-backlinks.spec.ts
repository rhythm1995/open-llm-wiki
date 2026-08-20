/**
 * e2e:图谱 type 过滤 + 反链(TDD 策略关键路径 2 / 4 的 mock 面)。
 *
 * 图谱 Canvas 本身不断言像素;只锁 chrome:统计数字、过滤改计数。
 * 反链:种子 vault 里 Index → Zettelkasten,Inspector 必须列出 Index。
 */
import { test, expect, type Page } from "@playwright/test";

async function vaultReady(page: Page) {
  await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 15_000 });
}

test.describe("图谱过滤与反链", () => {
  test("图谱全库过滤 Concept 后节点变少", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page
      .getByTestId("center-toolbar")
      .getByRole("button", { name: "图谱" })
      .click();
    const stats = page.getByTestId("graph-stats");
    await expect(stats).toBeVisible({ timeout: 10_000 });
    await expect(stats).toContainText(/节点/);
    const before = (await stats.textContent()) ?? "";
    const beforeN = Number(/(\d+)\s*节点/.exec(before)?.[1] ?? "0");
    expect(beforeN).toBeGreaterThan(0);

    await page.getByTestId("graph-scope").click();
    await expect(page.getByTestId("graph-scope")).toContainText("全库");

    const allText = (await stats.textContent()) ?? "";
    const allN = Number(/(\d+)\s*节点/.exec(allText)?.[1] ?? "0");

    await page.getByTestId("graph-filter-toggle").click();
    const concept = page.getByTestId("graph-filter-type-Concept");
    await expect(concept).toBeVisible();
    await concept.uncheck();

    await expect
      .poll(async () => {
        const t = (await stats.textContent()) ?? "";
        return Number(/(\d+)\s*节点/.exec(t)?.[1] ?? allN);
      })
      .toBeLessThan(allN);
  });

  test("Zettelkasten 反链列出 Index;点反链跳回 Index", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.getByTestId("note-list").getByText("Zettelkasten", { exact: true }).click();
    const inspector = page.getByTestId("inspector");
    await expect(inspector).toBeVisible({ timeout: 10_000 });
    const backTab = inspector.getByRole("tab", { name: /反链/ });
    await expect(backTab).toBeVisible();
    await backTab.click();
    const indexHit = inspector.getByText("Index", { exact: true });
    await expect(indexHit).toBeVisible();
    await indexHit.click();
    await expect(page.locator(".ProseMirror").first()).toContainText("mock vault", {
      timeout: 10_000,
    });
  });
});

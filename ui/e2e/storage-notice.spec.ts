/**
 * E2E 存储防护(doc 17)—— mock 模式经 ?mock-storage= 覆写 detect_storage 类别:
 * - local(默认):零打扰,不出现任何存储横幅;
 * - icloud:横幅出现,「知道了」按 root 持久化,重载后不再出现;
 * - cloud-other:出"云盘不建议"文案。
 */
import { test, expect, type Page } from "@playwright/test";

async function vaultReady(page: Page) {
  await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 15_000 });
}

test.describe("存储防护横幅", () => {
  test("local 零打扰:不出现任何存储提示", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await expect(page.getByTestId("storage-banner")).toHaveCount(0);
    await expect(page.getByTestId("conflict-notice")).toHaveCount(0);
  });

  test("icloud:横幅出现 → 知道了 → 重载后不再出现", async ({ page }) => {
    await page.goto("/?mock-storage=icloud");
    await vaultReady(page);
    const banner = page.getByTestId("storage-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-kind", "icloud");
    await page.getByTestId("storage-banner-dismiss").click();
    await expect(banner).toHaveCount(0);
    // 同一浏览器上下文重载:localStorage 记住了关闭,不再出现。
    await page.reload();
    await vaultReady(page);
    await expect(page.getByTestId("storage-banner")).toHaveCount(0);
  });

  test("cloud-other:出云盘不建议文案", async ({ page }) => {
    await page.goto("/?mock-storage=cloud-other");
    await vaultReady(page);
    const banner = page.getByTestId("storage-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-kind", "cloud-other");
  });
});

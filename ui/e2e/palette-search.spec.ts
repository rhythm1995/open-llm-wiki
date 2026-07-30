/**
 * 命令面板 / 快开 / 库内搜索 e2e(web mock)。
 *
 * 键位与 mode:⌘K commands · ⌘P files · ⌘⇧F search · ⌘O 不测对话框(系统)。
 */
import { test, expect, type Page } from "@playwright/test";

async function vaultReady(page: Page) {
  await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 15_000 });
}

/** mac: Meta, 其它: Control */
function mod() {
  return process.platform === "darwin" ? "Meta" : "Control";
}

test.describe("命令面板与搜索", () => {
  test("⌘K 打开命令面板并可点设置", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.keyboard.press(`${mod()}+KeyK`);
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible({ timeout: 5_000 });
    await expect(palette).toHaveAttribute("data-palette-mode", "commands");
    await page.getByTestId("palette-input").fill("设置");
    await page.getByTestId("palette-cmd-settings").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("⌘P 文件快开:过滤并打开笔记", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.keyboard.press(`${mod()}+KeyP`);
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    await expect(palette).toHaveAttribute("data-palette-mode", "files");
    await page.getByTestId("palette-input").fill("Zettel");
    await page.getByTestId("palette-file-zettelkasten.md").click();
    // 打开后进编辑器(默认 wysiwyg)
    await expect(page.locator(".ProseMirror").first()).toContainText(
      "原子化卡片",
      { timeout: 15_000 },
    );
  });

  test("⌘⇧F 库内全文:搜正文打开命中笔记", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    // Shift+F with mod
    await page.keyboard.press(`${mod()}+Shift+KeyF`);
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    await expect(palette).toHaveAttribute("data-palette-mode", "search");
    // mock 种子 zettelkasten body 含「原子化」
    await page.getByTestId("palette-input").fill("原子化");
    await expect(
      page.getByTestId("palette-search-zettelkasten.md"),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("palette-search-zettelkasten.md").click();
    await expect(page.locator(".ProseMirror").first()).toContainText(
      "原子化卡片",
      { timeout: 15_000 },
    );
  });

  test("⌘K 输入命令名 Enter 执行保存路径可达", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page
      .getByTestId("note-list")
      .getByText("Index", { exact: true })
      .click();
    await page.keyboard.press(`${mod()}+KeyK`);
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("palette-input").fill("保存");
    await expect(page.getByTestId("palette-cmd-save")).toBeVisible();
    await page.getByTestId("palette-input").press("Enter");
    // 面板应关闭
    await expect(page.getByTestId("command-palette")).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("Esc 关闭面板", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.keyboard.press(`${mod()}+KeyK`);
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
  });
});

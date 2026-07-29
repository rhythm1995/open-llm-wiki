/**
 * E2E 冒烟(web mock 模式)—— 覆盖前端集成关键路径。
 *
 * mock 模式下 App 启动即自动打开种子 vault(index/zettelkasten/evergreen-notes/…),
 * 故每个 test 先 goto("/") 等列表就绪。选择器一律限定容器(note-list / center-toolbar)
 * 或用 exact 文本 / aria-label,避免 strict-mode 命中多处。run_qql 在 mock 下返回空
 * (core 不在浏览器复刻),查询路径信心来自 cargo test;此处不测查询结果。
 */
import { test, expect, type Page } from "@playwright/test";

/** mock vault 异步 openVault 后,列表容器出现即就绪。 */
async function vaultReady(page: Page) {
  await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 15_000 });
}

test.describe("mock vault 关键路径", () => {
  test("启动并渲染种子笔记列表", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    const list = page.getByTestId("note-list");
    await expect(list.getByText("Index", { exact: true })).toBeVisible();
    await expect(list.getByText("Zettelkasten", { exact: true })).toBeVisible();
    await expect(list.getByText("Evergreen Notes", { exact: true })).toBeVisible();
  });

  test("点列表笔记 → 编辑器加载正文", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.getByTestId("note-list").getByText("Zettelkasten", { exact: true }).click();
    await expect(page.locator(".cm-content").first()).toContainText("原子化卡片", {
      timeout: 10_000,
    });
  });

  test("图谱视图渲染节点统计", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page
      .getByTestId("center-toolbar")
      .getByRole("button", { name: "图谱" })
      .click();
    // GraphView 顶部统计文案 "{nodes} 节点 · {edges} 边";种子 vault 有节点有边。
    await expect(page.getByText(/\d+\s*节点/)).toBeVisible({ timeout: 10_000 });
  });

  test("新建笔记 inline 命名后出现在列表", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    const name = `E2E-${Date.now()}`;
    await page
      .getByTestId("center-toolbar")
      .getByRole("button", { name: "新建笔记" })
      .click();
    // inline(任务3):无弹窗,列表内直接出现标题输入框(默认值"未命名")。
    const input = page.getByTestId("note-list").getByRole("textbox");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(name);
    await input.press("Enter");
    await expect(
      page.getByTestId("note-list").getByText(name, { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("wysiwyg 模式可编辑,切回源码见输入(round-trip)", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page
      .getByTestId("note-list")
      .getByText("Zettelkasten", { exact: true })
      .click();
    await expect(page.locator(".cm-content").first()).toContainText("原子化卡片", {
      timeout: 10_000,
    });
    // 切到 wysiwyg(BlockNote 块编辑器)。
    await page.getByTitle("切换到所见即所得").click();
    const wysiwyg = page.locator(".ProseMirror").first();
    await expect(wysiwyg).toBeVisible({ timeout: 15_000 });
    // 在 wysiwyg 输入标记文字。
    await wysiwyg.click();
    await page.keyboard.type(" RoundTripMark 标记 ");
    // 切回 source:卸载时 flush 落盘,源码应含标记文字。
    await page.getByTitle("切换到源码").click();
    await expect(page.locator(".cm-content").first()).toContainText("RoundTripMark", {
      timeout: 10_000,
    });
  });

  test("wysiwyg 模式渲染 wikilink chip 并点击跳转", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.getByTestId("note-list").getByText("Index", { exact: true }).click();
    await expect(page.locator(".cm-content").first()).toContainText("Index", {
      timeout: 10_000,
    });
    await page.getByTitle("切换到所见即所得").click();
    await expect(page.locator(".ProseMirror").first()).toBeVisible({ timeout: 15_000 });
    // Index body 含 [[Zettelkasten]] 等 wikilink;应被 hydrate 成可点击 chip(data-wikilink)。
    const chip = page.locator("[data-wikilink]", { hasText: "Zettelkasten" }).first();
    await expect(chip).toBeVisible({ timeout: 10_000 });
    // 点击 chip → handleFollow → 跳转 Zettelkasten;重建后载入其 body(含「原子化卡片」)。
    await chip.click();
    await expect(page.locator(".ProseMirror").first()).toContainText("原子化卡片", {
      timeout: 10_000,
    });
  });
});

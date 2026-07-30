/**
 * E2E 冒烟(web mock 模式)—— 覆盖前端集成关键路径。
 *
 * mock 模式下 App 启动即自动打开种子 vault(index/zettelkasten/evergreen-notes/…),
 * 默认编辑模式为 wysiwyg(BlockNote)。故点笔记后看到的是 `.ProseMirror`,非 `.cm-content`。
 * 选择器一律限定容器(note-list / center-toolbar)或用 exact 文本 / aria-label,避免
 * strict-mode 命中多处。run_qql 在 mock 下返回空(core 不在浏览器复刻),查询路径信心
 * 来自 cargo test;此处不测查询结果。
 *
 * 第二栏表头是常驻过滤框(textbox);inline 重命名也用 textbox。新建/重命名用例里,
 * 过滤框是第 0 个 textbox、重命名输入是第 1 个,用 nth(1) 精确定位避开歧义。
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

  test("点列表笔记 → 编辑器加载正文(默认 wysiwyg)", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.getByTestId("note-list").getByText("Zettelkasten", { exact: true }).click();
    // 默认 wysiwyg:ProseMirror 渲染 body,含「原子化卡片」。
    await expect(page.locator(".ProseMirror").first()).toContainText("原子化卡片", {
      timeout: 15_000,
    });
  });

  test("图谱视图渲染节点统计", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page
      .getByTestId("center-toolbar")
      .getByRole("button", { name: "图谱" })
      .click();
    await expect(page.getByText(/\d+\s*节点/)).toBeVisible({ timeout: 10_000 });
  });

  test("新建笔记 inline 命名后出现在列表", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    const name = `E2E-${Math.floor(Math.random() * 1e9)}`;
    await page
      .getByTestId("center-toolbar")
      .getByRole("button", { name: "新建笔记" })
      .click();
    // inline(任务3):无弹窗,列表内直接出现标题输入框(默认值"未命名")。
    const input = page.getByTestId("rename-input");
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
    await page.getByTestId("note-list").getByText("Zettelkasten", { exact: true }).click();
    // 默认 wysiwyg:ProseMirror 就绪后输入标记文字。
    const wysiwyg = page.locator(".ProseMirror").first();
    await expect(wysiwyg).toBeVisible({ timeout: 15_000 });
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

  test("第二栏过滤框即时收窄列表", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    const list = page.getByTestId("note-list");
    // 默认可见三篇(Index/Zettelkasten/Evergreen Notes)。
    await expect(list.getByText("Zettelkasten", { exact: true })).toBeVisible();
    await expect(list.getByText("Evergreen Notes", { exact: true })).toBeVisible();
    // 输入「原子化」:只命中 Zettelkasten 的预览,Index / Evergreen Notes 行消失。
    // (用 zettel 会同时命中别篇预览里的 [[Zettelkasten]],故选更独特的词。)
    await list.getByTestId("list-filter").fill("原子化");
    await expect(list.getByText("Zettelkasten", { exact: true })).toBeVisible();
    await expect(list.getByText("Index", { exact: true })).toHaveCount(0);
    await expect(list.getByText("Evergreen Notes", { exact: true })).toHaveCount(0);
    // 清空恢复全量。
    await list.getByTestId("list-filter").fill("");
    await expect(list.getByText("Evergreen Notes", { exact: true })).toBeVisible();
  });

  test("右键笔记行 → 重命名进入 inline 输入态", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    const row = page.getByTestId("note-list").getByText("Zettelkasten", { exact: true });
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "重命名" }).click();
    // 该行变 input,初值为标题。
    const rename = page.getByTestId("rename-input");
    await expect(rename).toBeVisible({ timeout: 5_000 });
    await expect(rename).toHaveValue("Zettelkasten");
  });

  test("右键笔记行 → 复制 [[wikilink]] 入剪贴板", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await vaultReady(page);
    const row = page.getByTestId("note-list").getByText("Zettelkasten", { exact: true });
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "复制 [[wikilink]]" }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("[[Zettelkasten]]");
  });

  test("右键笔记行 → 删除文件移除该行", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    // 删除无 confirm;mock 下 delete_note 仅从内存 vault 删除。
    const list = page.getByTestId("note-list");
    await expect(list.getByText("Zettelkasten", { exact: true })).toBeVisible();
    await list.getByText("Zettelkasten", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除文件" }).click();
    await expect(list.getByText("Zettelkasten", { exact: true })).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("右键菜单在 mock 下不含「在 Finder 中显示」", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page
      .getByTestId("note-list")
      .getByText("Zettelkasten", { exact: true })
      .click({ button: "right" });
    // mock 无 fs:Reveal 项应被 gate 隐藏。
    await expect(page.getByRole("menuitem", { name: "在 Finder 中显示" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "重命名" })).toBeVisible();
  });

  test("⌘F 唤起文档内查找条 FindBar(切到 source 以高亮)", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    await page.getByTestId("note-list").getByText("Zettelkasten", { exact: true }).click();
    await expect(
      page.locator(".ProseMirror, .cm-content").first(),
    ).toBeVisible({ timeout: 15_000 });
    // 显式派发 capture 键(兼容 Meta/Control;避免平台差异)。
    await page.evaluate(() => {
      for (const mod of [
        { metaKey: true, ctrlKey: false },
        { metaKey: false, ctrlKey: true },
      ] as const) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "f",
            code: "KeyF",
            metaKey: mod.metaKey,
            ctrlKey: mod.ctrlKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await expect(page.getByTestId("find-bar")).toBeVisible({ timeout: 8_000 });
    await page.getByTestId("find-bar").locator("input").fill("原子");
    await expect(page.getByTestId("find-count")).toBeVisible({ timeout: 5_000 });
  });

  test("顶栏无「搜索」视图按钮", async ({ page }) => {
    await page.goto("/");
    await vaultReady(page);
    // 搜索视图已删除:工具栏不应再出现独立搜索入口。
    await expect(page.getByRole("button", { name: "搜索" })).toHaveCount(0);
  });
});

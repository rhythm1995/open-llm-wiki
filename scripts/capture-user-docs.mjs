#!/usr/bin/env node
/**
 * Capture product screenshots for README + docs/user.
 * Requires `pnpm --dir ui dev` on :5173 (or PLAYWRIGHT_BASE_URL).
 *
 *   node scripts/capture-user-docs.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../ui/node_modules/@playwright/test/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/user/images");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(locale, name, act) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: locale === "en" ? "en-US" : "zh-CN",
  });
  await context.addInitScript((loc) => {
    localStorage.setItem("open-llm-wiki.locale", loc);
    localStorage.setItem("open-llm-wiki.theme", "light");
    localStorage.setItem("open-llm-wiki.navOpen", "true");
    localStorage.setItem("open-llm-wiki.listOpen", "true");
    localStorage.setItem("open-llm-wiki.propsOpen", "true");
    localStorage.setItem("open-llm-wiki.welcomeMgPlacement", "corner");
  }, locale);

  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("note-list").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await act(page);
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, type: "png" });
  console.log("wrote", path.replace(root + "/", ""));
  await context.close();
}

async function openNote(page, title) {
  await page.getByTestId("note-list").getByText(title, { exact: true }).click();
  await page.locator(".ProseMirror").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function openGraph(page) {
  await page.getByRole("button", { name: /图谱|Graph/ }).first().click();
  await page.getByText(/\d+\s*(节点|nodes)/).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2200);
}

// Chinese UI (product default)
await shot("zh", "editor-zh", async (page) => {
  await openNote(page, "Zettelkasten");
});
await shot("zh", "graph-zh", async (page) => {
  await openNote(page, "Index");
  await openGraph(page);
});
await shot("zh", "health-zh", async (page) => {
  await page.getByTestId("view-health").click();
  await page.getByTestId("health-view").waitFor({ timeout: 10_000 });
  await page.getByTestId("health-scorecard").waitFor();
  await page.waitForTimeout(400);
});
await shot("zh", "palette-zh", async (page) => {
  await openNote(page, "Index");
  await page.keyboard.press("Meta+k");
  await page.locator("[data-testid=command-palette], [role=dialog]").first().waitFor({
    timeout: 8_000,
  });
  await page.waitForTimeout(250);
});
await shot("zh", "help-zh", async (page) => {
  await page.getByTestId("toolbar-brand-logo").click();
  await page.getByTestId("help-guide-dialog").waitFor({ timeout: 8_000 });
  await page.waitForTimeout(250);
});
await shot("zh", "agent-zh", async (page) => {
  await openNote(page, "Zettelkasten");
  await page.getByTestId("toggle-agent").click();
  await page.waitForTimeout(500);
});

// English UI
await shot("en", "editor-en", async (page) => {
  await openNote(page, "Zettelkasten");
});
await shot("en", "graph-en", async (page) => {
  await openNote(page, "Index");
  await openGraph(page);
});
await shot("en", "health-en", async (page) => {
  await page.getByTestId("view-health").click();
  await page.getByTestId("health-view").waitFor({ timeout: 10_000 });
  await page.getByTestId("health-scorecard").waitFor();
  await page.waitForTimeout(400);
});
await shot("en", "palette-en", async (page) => {
  await openNote(page, "Index");
  await page.keyboard.press("Meta+k");
  await page.locator("[data-testid=command-palette], [role=dialog]").first().waitFor({
    timeout: 8_000,
  });
  await page.waitForTimeout(250);
});

await browser.close();
console.log("done");

import { defineConfig, devices } from "@playwright/test";

// E2E 跑在 web mock 模式:vite dev server 下 `__TAURI_INTERNALS__` 不在 window →
// ipc 自动走 mock.ts 内存后端(种子 vault 自动开)。这覆盖前端集成(组件协作、store
// 生命周期、UI 流程);真后端(core/app)的信心来自 cargo test(含 git_tests + proptest)。
//
// 故 e2e 不依赖 Tauri runtime / WebDriver,只需一个浏览器 + dev server。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

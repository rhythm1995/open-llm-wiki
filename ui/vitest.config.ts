import { defineConfig } from "vitest/config";

// 独立的 vitest 配置(不碰 Tauri 用的 vite.config.ts)。
// UI 侧的 TDD 表面:只测 src 下的纯逻辑(frontmatter 编辑、图谱过滤、tab reducer),
// 不挂 DOM 环境组件渲染。组件交互留待后续 Playwright/RTL。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    reporters: "default",
  },
});

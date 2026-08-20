import { defineConfig } from "vitest/config";

// 独立的 vitest 配置(不碰 Tauri 用的 vite.config.ts)。
//
// 两层测试表面:
//  - src/lib/*.test.ts    —— 纯逻辑(frontmatter、图谱过滤、tab reducer…),不碰 DOM。
//  - src/components/*.test.tsx —— 组件渲染(@testing-library/react + jsdom),props-driven,
//    mock 边界在 ipc 层(直接 import ipc 的组件用 vi.mock)。
//
// 全局 jsdom:纯逻辑不碰 DOM,jsdom 下无副作用;组件测试需要 DOM。setupFiles 注入
// jest-dom 的 DOM 断言(toBeInTheDocument 等)。
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    reporters: "default",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // 阈值 = 当前基线减约 5%:防明显回退。2026-08-20 L-1 把原先未 import 的
      // Editor/GraphView/Nav 等纳入覆盖率分母,branch 基线从 ~60 落到 ~58,门槛随之下调 1。
      thresholds: {
        statements: 63,
        branches: 57,
        functions: 56,
        lines: 63,
      },
    },
  },
});

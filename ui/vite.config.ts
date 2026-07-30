import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * npm 包 `@ironcalc/wasm` 声明了 `./snippets/*` 但发布物未带上该目录,
 * 导致 vite/rollup 解析失败。指向本地 Intl shim。
 */
function ironcalcSnippetsShim(): Plugin {
  const shim = path.resolve(rootDir, "src/lib/ironcalc-tz-shim.js");
  return {
    name: "ironcalc-snippets-shim",
    resolveId(id) {
      if (
        id.includes("snippets/ironcalc_base") ||
        id.endsWith("/inline0.js")
      ) {
        return shim;
      }
      return null;
    },
  };
}

// Tauri 友好的 Vite 配置:
// - strictPort:5173 与 tauri.conf.json devUrl 对齐,端口占用直接报错而非顺延。
// - host:仅本机,避免 dev server 暴露到网络。
// - clearScreen:false 让 Tauri 控制台不被清屏。
// - esnext target:现代桌面 webview 一律支持。
export default defineConfig({
  plugins: [react(), tailwindcss(), ironcalcSnippetsShim()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
  envPrefix: ["VITE_", "TAURI_"],
  optimizeDeps: {
    exclude: ["@ironcalc/wasm"],
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    target: "es2022",
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});

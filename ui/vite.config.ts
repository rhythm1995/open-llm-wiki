import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri 友好的 Vite 配置:
// - strictPort:5173 与 tauri.conf.json devUrl 对齐,端口占用直接报错而非顺延。
// - host:仅本机,避免 dev server 暴露到网络。
// - clearScreen:false 让 Tauri 控制台不被清屏。
// - esnext target:现代桌面 webview 一律支持。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
  envPrefix: ["VITE_", "TAURI_"],
  // IronCalc wasm:不预打包,运行时加载。
  optimizeDeps: {
    exclude: ["@ironcalc/wasm"],
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    target: "es2022",
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});

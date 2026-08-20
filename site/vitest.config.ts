import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(siteDir, "..");

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [siteDir, path.join(repoRoot, "docs/user")],
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
  },
});

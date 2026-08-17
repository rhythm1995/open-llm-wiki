import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(siteDir, "..");
const userDocsDir = path.resolve(repoRoot, "docs/user");
const userImagesDir = path.join(userDocsDir, "images");

/**
 * Serve and ship ../docs/user/images as /docs-media so Markdown
 * `./images/foo.png` can resolve without copying the user-doc tree.
 */
function userDocsMedia(): Plugin {
  return {
    name: "user-docs-media",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/docs-media/")) {
          next();
          return;
        }
        const name = path.basename(decodeURIComponent(url));
        const file = path.join(userImagesDir, name);
        if (!file.startsWith(userImagesDir) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "image/png");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const dest = path.resolve(siteDir, "dist/docs-media");
      fs.mkdirSync(dest, { recursive: true });
      if (fs.existsSync(userImagesDir)) {
        for (const name of fs.readdirSync(userImagesDir)) {
          fs.copyFileSync(path.join(userImagesDir, name), path.join(dest, name));
        }
      }
      const index = path.resolve(siteDir, "dist/index.html");
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.resolve(siteDir, "dist/404.html"));
      }
    },
  };
}

export default defineConfig({
  // GitHub project Pages: https://<user>.github.io/open-llm-wiki/
  base: process.env.SITE_BASE ?? "/",
  plugins: [react(), tailwindcss(), userDocsMedia()],
  resolve: {
    alias: {
      "@user-docs": userDocsDir,
    },
  },
  server: {
    port: 5174,
    host: "127.0.0.1",
    fs: {
      allow: [siteDir, userDocsDir],
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});

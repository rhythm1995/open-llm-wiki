#!/usr/bin/env node
// gen-tray-icon.mjs — 生成 macOS 菜单栏(menubar)template 图标。
//
// 规范:template image = 单色(黑)形状 + 完全透明背景;macOS 经 icon_as_template(true)
// 自动按菜单栏明暗反色渲染(浅色栏→白、深色栏→黑)。本脚本输出纯黑+alpha 的 PNG。
//
// 形状:简洁几何灯泡剪影(与主 app icon 的"灯泡"意象一致;节点网络细节在 22pt 下糊成
// 一团,故取灯泡外轮廓)。24×24 视图框,描边偏粗以适配 menubar 视觉重量。
//
// 用法:node scripts/gen-tray-icon.mjs
// 依赖:sharp(已随 ui/node_modules 安装)。
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const OUT_DIR = path.join(ROOT, "app/src-tauri/icons");
// sharp 装在 ui/node_modules;createRequire 以 ui/ 为基准,可靠解析 bare spec。
const require = createRequire(path.join(ROOT, "ui", "package.json"));
const sharp = require("sharp");

// 24×24 灯泡:上部圆形(球泡)+ 下部螺纹底座,几何风,与主图标一致意象。
// 填充纯黑(#000),背景透明 → template 规范。
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- 球泡:圆心 (12,9) 半径 6.5,底部略压。用 path 近似灯泡形(上圆下收)。 -->
  <path fill="#000" d="M12 2c3.6 0 6.5 2.9 6.5 6.5 0 2.5-1.4 4.6-3.4 5.8-.7.4-1.1 1.1-1.1 1.9v.3H10v-.3c0-.8-.4-1.5-1.1-1.9C6.9 13.1 5.5 11 5.5 8.5 5.5 5.9 8.4 2 12 2Z"/>
  <!-- 底座:两段螺纹矩形。 -->
  <rect x="9.3" y="17.5" width="5.4" height="1.8" rx="0.4" fill="#000"/>
  <rect x="9.8" y="19.8" width="4.4" height="1.8" rx="0.4" fill="#000"/>
  <!-- 底部尖(灯泡底端小圆点)。 -->
  <rect x="10.8" y="21.8" width="2.4" height="1.2" rx="0.5" fill="#000"/>
</svg>`;

const sizes = [
  { name: "tray-icon-light.png", px: 22 },
  { name: "tray-icon-light@2x.png", px: 44 },
];

for (const { name, px } of sizes) {
  const out = path.join(OUT_DIR, name);
  // 渲染后强制 RGB=0(保留 alpha):消除抗锯齿边缘的灰度像素,
  // 得到标准 template image(纯黑 + alpha),系统据此干净反色。
  const raw = Buffer.from(
    await sharp(Buffer.from(SVG), { density: 384 })
      .resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  );
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 0;
    raw[i + 1] = 0;
    raw[i + 2] = 0;
    // alpha(raw[i+3]) 保留
  }
  await sharp(raw, { raw: { width: px, height: px, channels: 4 } }).png().toFile(out);
  console.log(`✓ ${name} (${px}×${px}) → ${path.relative(ROOT, out)}`);
}
console.log("完成。两者均为黑+透明 template PNG;Rust 侧用 icon_as_template(true) 渲染。");

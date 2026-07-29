#!/usr/bin/env node
/**
 * gen-benchmark-vault —— 生成一个**大尺寸 benchmark vault**(图谱大图性能的前置)。
 *
 * 为什么存在:docs/deferred.md「图谱大图性能(>400 节点)」的前置是「先造一个
 * >400 / >1000 节点的 benchmark vault,测当前帧率与收敛时间基线」。图谱布局本身在
 * n≤400 时数十毫秒收敛(见 graph-layout.ts);**真正的瓶颈是 SVG 渲染**(每节点一个
 * `<g>` DOM),而帧率只能在 GUI 里目视。所以这个脚本只管造数据,把测量留给真机打开。
 *
 * 用法(从仓库根):
 *   node tools/gen-benchmark-vault.mjs              # 1000 篇 → ./benchmark-vault/
 *   node tools/gen-benchmark-vault.mjs 3000 ./big   # 3000 篇 → ./big/
 *
 * 生成内容:每篇 .md 带 frontmatter(type/status/created/modified)+ 正文 + 若干
 * `[[wikilink]]`(刻意造度数偏斜:头几篇是高连接 hub,其余 2~6 条边,贴合真实 wiki)。
 * 少量篇内嵌 ```qql 块,顺带压测内联查询渲染。
 *
 * 纯 Node、零依赖;输出目录会被清空重建。benchmark-vault/ 已在 .gitignore。
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TYPES = ["Concept", "Entity", "Source", "Summary", "Note"];
const STATUSES = ["Active", "Done", "Contested", "Superseded"];
const HUB_COUNT = 12; // 头 N 篇做成 hub(高连接),造度数偏斜

const count = Math.max(1, parseInt(process.argv[2] ?? "1000", 10));
const outDir = process.argv[3] ?? "./benchmark-vault";

// 简易确定性 PRNG(可复现基准;不依赖 Math.random 的平台差异)。
let _s = 0x9e3779b9;
const rand = () => {
  _s ^= _s << 13;
  _s ^= _s >>> 17;
  _s ^= _s << 5;
  _s >>>= 0;
  return _s / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad = (n, w = 4) => String(n).padStart(w, "0");

// 建边:返回 note id(1-based)→ Set<邻居 id>。
function buildEdges(n) {
  const adj = new Map();
  for (let i = 1; i <= n; i++) adj.set(i, new Set());
  const link = (a, b) => {
    if (a === b) return;
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (let i = 1; i <= n; i++) {
    if (i <= HUB_COUNT) {
      // hub:连 30~60 条(偏向其它 hub + 随机散点)。
      const deg = 30 + Math.floor(rand() * 30);
      for (let e = 0; e < deg; e++) {
        link(i, 1 + Math.floor(rand() * n));
      }
    } else {
      // 普通节点:2~6 条边,偏向低 id(hub),造 preferential-attachment 感。
      const deg = 2 + Math.floor(rand() * 5);
      for (let e = 0; e < deg; e++) {
        const bias = Math.floor(rand() * rand() * n) + 1; // rand² 偏向小 id
        link(i, bias);
      }
    }
  }
  return adj;
}

const bodyPara = (i) =>
  `节点 ${i} 的占位正文。Benchmark vault 用来压测图谱在大尺寸下的渲染帧率与交互流畅度;` +
  `正文长短无关紧要,关键是节点数与连接密度。第 ${i} 段重复几遍以模拟真实笔记篇幅。`.repeat(2);

const qqlBlock = (type) =>
  "```qql\n" +
  `WHERE type = "${type}" SORT title ASC SHOW title, status LIMIT 50\n` +
  "```";

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const adj = buildEdges(count);
  let edgeCount = 0;
  let maxDeg = 0;

  for (let i = 1; i <= count; i++) {
    const name = `note-${pad(i)}`;
    const type = TYPES[i % TYPES.length];
    const status = STATUSES[i % STATUSES.length];
    const neighbors = [...adj.get(i)].sort((a, b) => a - b);
    edgeCount += neighbors.length;
    maxDeg = Math.max(maxDeg, neighbors.length);

    // 正文:段落 + 内联 wikilink(邻居);每 ~50 篇嵌一个 qql 块压测内联渲染。
    const linksMd = neighbors.slice(0, 12).map((j) => `[[note-${pad(j)}]]`).join(" · ");
    const sections = [
      `# Note ${i}`,
      "",
      `> Benchmark 占位笔记 ${i} / ${count}。类型 ${type}。`,
      "",
      bodyPara(i),
      "",
      "## 相关",
      "",
      linksMd || "_(孤立节点)_",
      "",
    ];
    if (i % 47 === 0) {
      sections.push("## 查询", "", qqlBlock(type), "");
    }

    const fm =
      "---\n" +
      `type: ${type}\n` +
      `status: ${status}\n` +
      `created: 2024-0${1 + (i % 9)}-1${i % 9}\n` +
      `modified: 2025-0${1 + (i % 9)}-2${i % 8}\n` +
      "---\n\n";

    await writeFile(join(outDir, `${name}.md`), fm + sections.join("\n"), "utf8");
  }

  await writeFile(
    join(outDir, "README.md"),
    `# Benchmark Vault\n\n由 \`tools/gen-benchmark-vault.mjs\` 生成:${count} 篇笔记,` +
      `度数偏斜(头 ${HUB_COUNT} 篇为 hub)。用来压测图谱大图性能。\n` +
      `**不是真实知识库,勿提交**(已 gitignore)。\n`,
    "utf8",
  );

  const avgDeg = (edgeCount / count).toFixed(1);
  console.log(
    `生成完成:${count} 篇 → ${outDir}/\n` +
      `边(双向计数):${edgeCount} · 平均度:${avgDeg} · 最大度:${maxDeg}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

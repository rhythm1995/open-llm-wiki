/**
 * outline.ts —— 大纲(F-OUTLINE)的纯解析。
 *
 * 从 markdown 正文提取 1–6 级 ATX 标题(`# 标题`),忽略围栏代码块(``` … ```)
 * 内的 `#` 行。返回按出现顺序,带层级、文本与**行号(1-based)**,供大纲面板点击
 * 后把编辑器滚动到对应行。不碰 DOM/编辑器,纯函数。
 */
export interface Heading {
  level: number;
  text: string;
  line: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*```/;

export function parseOutline(md: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m) {
      out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
    }
  }
  return out;
}

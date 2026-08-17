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

/** 按标题层级嵌成树;index 是 parseOutline 平坦序,给跳转 / 折叠用。 */
export interface OutlineNode {
  heading: Heading;
  index: number;
  children: OutlineNode[];
}

/** 把平坦大纲收成树。后一项 level 更深则挂到最近的更浅祖先下;同级或更浅则出栈。 */
export function nestOutline(headings: Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  headings.forEach((heading, index) => {
    const node: OutlineNode = { heading, index, children: [] };
    while (
      stack.length > 0 &&
      stack[stack.length - 1]!.heading.level >= heading.level
    ) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  return roots;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*```/;

/** BlockNote 文档里按出现顺序收集 heading(含嵌套 children),与大纲条目下标对齐。 */
export function collectHeadingBlocks<T extends { type: string; children?: T[] }>(
  blocks: T[],
): T[] {
  const out: T[] = [];
  const walk = (bs: T[]) => {
    for (const b of bs) {
      if (b.type === "heading") out.push(b);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

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

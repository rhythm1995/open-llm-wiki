/**
 * broken-links —— 当前笔记正文中未解析的 `[[wikilink]]`(纯逻辑,B-ED-BROKEN-LINKS)。
 * 与图谱 dead 边不同:只扫**本笔记** body,用与编辑器相同的 resolveWikiTarget。
 */
import type { NodeOut } from "./ipc";
import { parseLinkInner, resolveWikiTarget } from "./wikilink";

export interface BrokenLink {
  /** `[[...]]` 内层完整文本(可含 \|alias / #anchor)。 */
  inner: string;
  /** 解析用的 target(去 alias/anchor)。 */
  target: string;
}

/**
 * 从 Markdown 抽出 wikilink 内层(忽略围栏代码块与行内代码,对齐 core 精神)。
 */
export function extractWikilinkInners(md: string): string[] {
  if (!md) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // 去掉行内 `...` 后再扫
    const stripped = line.replace(/`[^`]*`/g, "");
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const inner = (m[1] ?? "").trim();
      if (!inner || seen.has(inner)) continue;
      seen.add(inner);
      out.push(inner);
    }
  }
  return out;
}

/** 本笔记 body 中 resolve 失败的 wikilink(按出现顺序,inner 去重)。 */
export function findBrokenWikilinks(
  body: string,
  nodes: NodeOut[],
): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const inner of extractWikilinkInners(body)) {
    const { target } = parseLinkInner(inner);
    if (!target) continue;
    if (resolveWikiTarget(target, nodes) == null) {
      broken.push({ inner, target });
    }
  }
  return broken;
}

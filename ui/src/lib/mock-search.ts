/**
 * mock-search —— 浏览器 mock 后端用的极简 AND 检索。
 *
 * 真机走 Rust core 的倒排检索(标题×2 加权、AND、unicode 分词);浏览器 mock
 * 不复刻那套重活,只用一个**近似**实现让 `searchNotes` 在 `vite dev` 下可用、
 * 可演示。语义以 Rust core 为准,本模块仅为预览。
 *
 * AND:查询的每个空白分隔词都必须命中(标题或正文);命中分 = 标题命中×2 +
 * 正文命中×1(每词最多计一次,不按出现次数累加)。结果按分降序。
 */
export interface SearchDoc {
  id: number;
  title: string;
  body: string;
}

export function mockSearch(
  docs: SearchDoc[],
  query: string,
): Array<{ id: number; score: number }> {
  const terms = query
    .split(/\s+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return [];

  const out: Array<{ id: number; score: number }> = [];
  for (const d of docs) {
    const title = d.title.toLowerCase();
    const body = d.body.toLowerCase();
    let score = 0;
    let allHit = true;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const inBody = body.includes(t);
      if (!inTitle && !inBody) {
        allHit = false;
        break;
      }
      score += (inTitle ? 2 : 0) + (inBody ? 1 : 0);
    }
    if (allHit) out.push({ id: d.id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

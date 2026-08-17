/**
 * hot-cache —— vault 根 `hot.md` 会话缓存(纯逻辑)。
 *
 * 整页覆写、约 500 词;是蒸馏产物不是日志。应用内 Agent 启动/长会话再注入;
 * 回合结束若本轮写过 vault 则提醒更新。不自动改文件。
 */

export const HOT_CACHE_PATH = "hot.md";
export const HOT_WORD_BUDGET = 500;
/** 自上次注入起满这么多回合再注入一次(压缩后再读的廉价近似)。 */
export const HOT_REINJECT_TURNS = 6;

/** CJK 一字一词;其余按空白切。frontmatter 围栏也计入(缓存页很短)。 */
export function countHotWords(text: string): number {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const rest = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ").trim();
  const latin = rest.length === 0 ? 0 : rest.split(/\s+/).length;
  return cjk + latin;
}

export function isHotOverBudget(text: string): boolean {
  return countHotWords(text) > HOT_WORD_BUDGET;
}

/** null = 本会话还没注入过。 */
export function shouldInjectHot(turnsSinceInject: number | null): boolean {
  if (turnsSinceInject == null) return true;
  return turnsSinceInject >= HOT_REINJECT_TURNS;
}

export function wrapHotCache(hotBody: string, userText: string): string {
  const body = hotBody.trim();
  if (!body) return userText;
  return `Vault hot cache (read silently; do not announce that you read it).\n\n${body}\n\n---\n\n${userText}`;
}

export function shouldRemindHotUpdate(
  wroteThisTurn: boolean,
  hotBody: string | null,
): boolean {
  return wroteThisTurn && hotBody != null && hotBody.trim().length > 0;
}

/** 本会话还没注入过 → null。 */
export function turnsSinceHotInject(
  lastInjectTurn: number | null,
  turnCount: number,
): number | null {
  if (lastInjectTurn == null) return null;
  return turnCount - lastInjectTurn;
}

export interface HotAttachResult {
  text: string;
  injected: boolean;
  hotBody: string | null;
}

/** 一轮 prompt 是否/如何附上 hot.md。AgentPanel 只调这个。 */
export async function applyHotCacheToPrompt(opts: {
  enabled: boolean;
  userText: string;
  turnsSinceInject: number | null;
  readHot: () => Promise<string>;
}): Promise<HotAttachResult> {
  if (!opts.enabled) {
    return { text: opts.userText, injected: false, hotBody: null };
  }
  if (!shouldInjectHot(opts.turnsSinceInject)) {
    return { text: opts.userText, injected: false, hotBody: null };
  }
  try {
    const hot = await opts.readHot();
    if (!hot.trim()) {
      return { text: opts.userText, injected: false, hotBody: hot };
    }
    return {
      text: wrapHotCache(hot, opts.userText),
      injected: true,
      hotBody: hot,
    };
  } catch {
    return { text: opts.userText, injected: false, hotBody: null };
  }
}

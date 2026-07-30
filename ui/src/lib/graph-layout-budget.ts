/**
 * graph-layout-budget —— 增量布局迭代预算(纯逻辑)。
 *
 * 结构未变 / 仅少量新节点时少跑 FR,避免每次索引刷新主线程/Worker 重活。
 * GraphView 与测试共用。
 */

export interface LayoutBudgetInput {
  /** 当前渲染节点数。 */
  n: number;
  /** 相对上一帧新增、需要播种的节点数。 */
  newNodeCount: number;
  /**
   * 结构签名是否变化(节点集或边集)。
   * false = 仅尺寸/pin 触发,极短暖启动。
   */
  structureChanged: boolean;
  /** 画布尺寸是否相对上次布局变化。 */
  sizeChanged?: boolean;
}

/**
 * 建议 FR 迭代次数。
 * - 全量结构变化:按 n 分档(与历史 GraphView 一致)
 * - 仅新节点:中等迭代
 * - 仅 pin/尺寸:短迭代
 */
export function suggestLayoutIterations(input: LayoutBudgetInput): number {
  const { n, newNodeCount, structureChanged } = input;
  if (n <= 0) return 0;

  if (!structureChanged) {
    // pin / 尺寸:轻推一下即可。
    if (input.sizeChanged) return n > 400 ? 20 : 30;
    return n > 400 ? 12 : 20;
  }

  // 结构变了,但多数位置可暖启动。
  if (newNodeCount === 0) {
    // 边变了或过滤后节点子集变了但 pos 大多仍在。
    if (n > 1200) return 35;
    if (n > 800) return 50;
    if (n > 250) return 70;
    return 100;
  }

  if (newNodeCount <= 3) {
    return n > 500 ? 40 : 55;
  }
  if (newNodeCount <= 15) {
    return n > 500 ? 55 : 75;
  }

  // 大量新节点 ≈ 接近全量。
  if (n > 1200) return 45;
  if (n > 800) return 60;
  if (n > 250) return 90;
  return 130;
}

/**
 * 统计 ids 中尚无位置的节点数(新播种量)。
 */
export function countMissingPositions(
  ids: readonly number[],
  pos: ReadonlyMap<number, unknown>,
): number {
  let n = 0;
  for (const id of ids) {
    if (!pos.has(id)) n++;
  }
  return n;
}

import { describe, expect, it } from "vitest";
import { neighborhoodOf, type Adjacency } from "./graph-neighborhood";

const adj = (m: Record<number, number[]>): Adjacency =>
  new Map(
    Object.entries(m).map(([k, v]) => [Number(k), new Set(v)] as const),
  );

describe("neighborhoodOf", () => {
  it("hops=0 只含根", () => {
    expect([...neighborhoodOf(adj({ 1: [2, 3] }), 1, 0)]).toEqual([1]);
  });

  it("1 跳 = 根 + 直接邻居", () => {
    const out = [
      ...neighborhoodOf(adj({ 1: [2, 3], 2: [1], 3: [1, 4] }), 1, 1),
    ].sort();
    expect(out).toEqual([1, 2, 3]);
  });

  it("2 跳含孙辈,但不含更深", () => {
    // 链 1-2-3-4:从 1 出发 2 跳 = {1,2,3},4 是 3 跳不进。
    const out = [
      ...neighborhoodOf(adj({ 1: [2], 2: [1, 3], 3: [2, 4], 4: [3] }), 1, 2),
    ].sort();
    expect(out).toEqual([1, 2, 3]);
  });

  it("根不在邻接表 → 只返回根(孤立点)", () => {
    expect([...neighborhoodOf(adj({ 1: [2] }), 99, 2)]).toEqual([99]);
  });

  it("环不死循环:大 hops 也只返回连通分量", () => {
    // 三角环 1-2-3-1。
    const out = [
      ...neighborhoodOf(adj({ 1: [2, 3], 2: [1, 3], 3: [1, 2] }), 1, 5),
    ].sort();
    expect(out).toEqual([1, 2, 3]);
  });

  it("负 hops 当 0 处理(只根)", () => {
    expect([...neighborhoodOf(adj({ 1: [2] }), 1, -3)]).toEqual([1]);
  });
});

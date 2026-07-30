import { describe, expect, it } from "vitest";
import { createSyncLayoutClient } from "./graph-layout-client";
import type { Pt } from "./graph-layout";

describe("createSyncLayoutClient", () => {
  it("播种 + 松弛后所有 id 有位置", async () => {
    const client = createSyncLayoutClient();
    const pos = await client.run({
      ids: [1, 2, 3],
      springs: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
      positions: new Map<number, Pt>(),
      neighbors: new Map([
        [1, [2]],
        [2, [1, 3]],
        [3, [2]],
      ]),
      w: 400,
      h: 300,
      iterations: 40,
    });
    expect(pos.size).toBe(3);
    for (const id of [1, 2, 3]) {
      const p = pos.get(id)!;
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
    }
    client.dispose();
  });

  it("pinned 节点位置不变", async () => {
    const client = createSyncLayoutClient();
    const pinnedPos = { x: 50, y: 50 };
    const pos = await client.run({
      ids: [1, 2],
      springs: [{ from: 1, to: 2 }],
      positions: new Map([
        [1, { ...pinnedPos }],
        [2, { x: 200, y: 200 }],
      ]),
      neighbors: new Map([
        [1, [2]],
        [2, [1]],
      ]),
      w: 400,
      h: 400,
      iterations: 80,
      pinned: new Set([1]),
    });
    expect(pos.get(1)).toEqual(pinnedPos);
    client.dispose();
  });
});

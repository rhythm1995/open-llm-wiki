/**
 * graph-layout-store 单测 —— 落盘序列化 / drop-orphan / 合流 / 容错(无 IO)。
 */
import { describe, expect, it } from "vitest";
import {
  deserializePositions,
  mergePositions,
  parseLayoutJson,
  serializeLayoutJson,
  serializePositions,
} from "./graph-layout-store";
import type { Pt } from "./graph-layout";

// path ↔ id 双向映射(id 视为已重排过:path 才是稳定真相)。
const PATH_OF: Map<number, string> = new Map([
  [10, "notes/a.md"],
  [11, "notes/b.md"],
  [12, "folder/c.md"],
]);
const ID_OF: Map<string, number> = new Map([
  ["notes/a.md", 10],
  ["notes/b.md", 11],
  ["folder/c.md", 12],
]);
const idToPath = (id: number) => PATH_OF.get(id) ?? null;
const pathToId = (p: string) => ID_OF.get(p) ?? null;

describe("serializePositions / deserializePositions — 往返", () => {
  it("serialize→deserialize 回到原 pos(id 全部已知)", () => {
    const pos = new Map<number, Pt>([
      [10, { x: 12.5, y: -3 }],
      [11, { x: 0, y: 99 }],
      [12, { x: 400, y: 300 }],
    ]);
    const stored = serializePositions(pos, idToPath);
    const back = deserializePositions(stored, pathToId);
    expect([...back.entries()].sort((a, b) => a[0] - b[0])).toEqual(
      [...pos.entries()].sort((a, b) => a[0] - b[0]),
    );
  });

  it("serialize 丢弃无 path 的节点(无稳定主键不落盘)", () => {
    const pos = new Map<number, Pt>([
      [10, { x: 1, y: 1 }],
      [99, { x: 2, y: 2 }], // 99 不在 PATH_OF
    ]);
    const stored = serializePositions(pos, idToPath);
    expect(Object.keys(stored.positions)).toEqual(["notes/a.md"]);
  });

  it("serialize 丢弃 NaN/Infinity 坐标", () => {
    const pos = new Map<number, Pt>([
      [10, { x: NaN, y: 1 }],
      [11, { x: 2, y: Infinity }],
      [12, { x: 3, y: 3 }],
    ]);
    const stored = serializePositions(pos, idToPath);
    expect(Object.keys(stored.positions)).toEqual(["folder/c.md"]);
  });
});

describe("deserializePositions — drop-orphan", () => {
  it("path 已不存在(被删/改名)的键被丢弃", () => {
    const stored = serializePositions(
      new Map<number, Pt>([
        [10, { x: 1, y: 1 }],
        [11, { x: 2, y: 2 }],
      ]),
      idToPath,
    );
    // 模拟 b.md 已删除:ID_OF 不再含它。
    const pruned = (p: string) => (p === "notes/b.md" ? null : pathToId(p));
    const back = deserializePositions(stored, pruned);
    expect([...back.keys()]).toEqual([10]);
  });

  it("非法输入(非对象 / 缺 positions / 错版本)→ 空 Map,不抛", () => {
    expect(deserializePositions(null, pathToId).size).toBe(0);
    expect(deserializePositions({}, pathToId).size).toBe(0);
    expect(deserializePositions({ v: 99, positions: {} }, pathToId).size).toBe(0);
    expect(deserializePositions("nope", pathToId).size).toBe(0);
    expect(deserializePositions(undefined, pathToId).size).toBe(0);
  });

  it("单个坐标非有限数被跳过,其余保留", () => {
    const data = {
      v: 1,
      positions: {
        "notes/a.md": { x: 1, y: 1 },
        "notes/b.md": { x: "oops", y: 2 },
        "folder/c.md": { x: 3, y: 3 },
      },
    };
    const back = deserializePositions(data, pathToId);
    expect([...back.keys()].sort()).toEqual([10, 12]);
  });
});

describe("mergePositions — 暖启动 + 落盘合流", () => {
  it("stored 覆盖已知 id,warm 填充其余", () => {
    const warm = new Map<number, Pt>([
      [10, { x: 100, y: 100 }], // warm 已有,会被 stored 覆盖
      [11, { x: 200, y: 200 }], // warm 独有(无 stored)→ 保留
    ]);
    const stored = new Map<number, Pt>([
      [10, { x: 5, y: 5 }], // 覆盖
      [12, { x: 7, y: 7 }], // stored 独有 → 并入
    ]);
    const merged = mergePositions(warm, stored);
    expect(merged.get(10)).toEqual({ x: 5, y: 5 });
    expect(merged.get(11)).toEqual({ x: 200, y: 200 });
    expect(merged.get(12)).toEqual({ x: 7, y: 7 });
  });

  it("不修改入参 Map", () => {
    const warm = new Map<number, Pt>([[10, { x: 1, y: 1 }]]);
    const stored = new Map<number, Pt>([[10, { x: 9, y: 9 }]]);
    mergePositions(warm, stored);
    expect(warm.get(10)).toEqual({ x: 1, y: 1 });
    expect(stored.get(10)).toEqual({ x: 9, y: 9 });
  });
});

describe("JSON 往返 + 容错", () => {
  it("serializeLayoutJson → parseLayoutJson 回到 id→Pt", () => {
    const pos = new Map<number, Pt>([
      [10, { x: 1, y: 2 }],
      [12, { x: 3, y: 4 }],
    ]);
    const json = serializeLayoutJson(serializePositions(pos, idToPath));
    expect(json).not.toBeNull();
    const back = parseLayoutJson(json, pathToId);
    expect(back.get(10)).toEqual({ x: 1, y: 2 });
    expect(back.get(12)).toEqual({ x: 3, y: 4 });
  });

  it("parseLayoutJson: null / 空 / 非法 JSON → 空 Map", () => {
    expect(parseLayoutJson(null, pathToId).size).toBe(0);
    expect(parseLayoutJson("", pathToId).size).toBe(0);
    expect(parseLayoutJson("{not json", pathToId).size).toBe(0);
    expect(parseLayoutJson('{"v":99}', pathToId).size).toBe(0);
  });
});

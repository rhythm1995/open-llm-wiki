/**
 * mock-qql —— 兼容层。
 *
 * 历史子集求值已由 B-QQL-TS 全量移植取代(`./qql`)。
 * 本文件保留 `nodesFromOut` / `mockEvalQql` 导出名,避免旧 import 断裂;
 * 实现委托 `runQqlTs`(无 body/度数时能力受限——优先走 mock.handle run_qql)。
 */
import type { NodeOut, ResultSet } from "./ipc";
import { runQqlTs, type QqlNote } from "./qql";

export interface MockQqlNode {
  id: number;
  title: string;
  type: string | null;
  tags: string[];
  status: string | null;
  path: string;
}

export function nodesFromOut(nodes: readonly NodeOut[]): MockQqlNode[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type,
    tags: n.tags,
    status: n.status,
    path: n.path,
  }));
}

function toQqlNotes(nodes: readonly MockQqlNode[]): QqlNote[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type,
    tags: n.tags,
    path: n.path,
    body: "",
    frontmatter: n.status != null ? { status: n.status } : {},
    backlinkCount: 0,
    linkCount: 0,
  }));
}

/** @deprecated 用 `runQqlTs` / mock `run_qql`;此函数无 body/图度数。 */
export function mockEvalQql(
  qql: string,
  nodes: readonly MockQqlNode[],
): ResultSet {
  return runQqlTs(qql, toQqlNotes(nodes)) as ResultSet;
}

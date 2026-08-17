/**
 * nav-filter —— 左栏 Nav 的选择模型与中间 List 的过滤逻辑(纯函数)。
 *
 * Nav 与 NoteListView 的契约:`NavSelection` 描述"当前选中的是哪一组笔记",
 * List 据 `filterByNav` 在 `snapshot.nodes` 上做客户端过滤。folder 走路径前缀匹配。
 *
 * 无 IO、无 React,可 node 单测(见 nav-filter.test.ts)。
 */
import type { NodeOut } from "./ipc";
import type { TFunc } from "./i18n";
import { labelType } from "./wiki-labels";
import { isWikiOsPath } from "./wiki-digest";

/**
 * Nav 选择模型。`type` 的 `id:""` 代表"未分类"(type 缺失)——与 type 字面量
 * 走同一 kind,过滤时 `(n.type ?? "") === id` 一致处理。
 *
 * `archive` = 归档(并入 git)——`filterByNav` 对它返回空;NoteListView 据此
 * 委派给 ArchiveView,渲染已删笔记(从 git 历史还原)+ 最近提交时间线。
 */
export type NavSelection =
  | { kind: "all" }
  | { kind: "inbox" }
  | { kind: "archive" }
  | { kind: "type"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "folder"; id: string };

/**
 * Inbox / TYPES「未分类」:无 type 的原料。
 * wiki 操作系统(AGENTS.md / skills / prompts…)即使未标 type 也不进收件箱。
 */
export function isInbox(n: NodeOut): boolean {
  return n.type == null && !isWikiOsPath(n.path);
}

/**
 * 据 navSelection 过滤节点列表。folder 用路径前缀匹配(含恰好等于该路径的文件)。
 */
export function filterByNav(nodes: NodeOut[], sel: NavSelection): NodeOut[] {
  switch (sel.kind) {
    case "all":
      return nodes;
    case "inbox":
      return nodes.filter(isInbox);
    case "archive":
      // 归档数据来自 git 历史(不在 nodes 里);NoteListView 对 archive 委派给 ArchiveView。
      return [];
    case "type":
      if (sel.id === "") return nodes.filter(isInbox);
      return nodes.filter((n) => (n.type ?? "") === sel.id);
    case "tag":
      return nodes.filter((n) => n.tags.includes(sel.id));
    case "folder": {
      const prefix = sel.id.endsWith("/") ? sel.id : `${sel.id}/`;
      return nodes.filter((n) => n.path === sel.id || n.path.startsWith(prefix));
    }
  }
}

/** 两个选择是否指向同一组(用于 Nav 高亮)。 */
export function sameSelection(a: NavSelection | null, b: NavSelection): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if ("id" in a && "id" in b) return a.id === b.id;
  return true;
}

/**
 * 当前选中的人类可读标签(顶栏中间与列表头共用)。type 的 `""` →「未分类」;
 * folder 取末段目录名。
 */
export function selectionLabel(sel: NavSelection, t: TFunc): string {
  switch (sel.kind) {
    case "all":
      return t("nav.allNotes");
    case "inbox":
      return t("nav.inbox");
    case "archive":
      return t("nav.archive");
    case "type":
      return sel.id === "" ? t("nav.untyped") : labelType(sel.id, t);
    case "tag":
      return `#${sel.id}`;
    case "folder":
      return sel.id.split("/").pop() || sel.id;
  }
}

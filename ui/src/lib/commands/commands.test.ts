import { describe, expect, it, vi } from "vitest";
import { translate } from "../i18n";
import {
  buildAppCommands,
  buildFileEntries,
  filterCommands,
  mapSearchHits,
  menuCommandIds,
  rankFiles,
  runCommandById,
} from "./index";
import type { CommandDeps } from "./types";

const t = (key: string, vars?: Record<string, string | number>) =>
  translate("zh", key, vars);

function deps(over: Partial<CommandDeps> = {}): CommandDeps {
  return {
    t,
    openPicker: () => {},
    onNewNote: () => {},
    onNewCanvas: () => {},
    onNavigate: () => {},
    refreshIndex: () => {},
    ...over,
  };
}

describe("buildAppCommands", () => {
  it("含 open-vault 且 shortcut ⌘O", () => {
    const cmds = buildAppCommands(deps());
    const open = cmds.find((c) => c.id === "open-vault");
    expect(open?.shortcut).toBe("⌘O");
  });

  it("菜单含 new-sheet / find-vault / toggle-split", () => {
    const cmds = buildAppCommands(
      deps({
        onNewSheet: () => {},
        openVaultSearch: () => {},
        toggleSplitLayout: () => {},
        saveNow: () => {},
        openFind: () => {},
        hasCurrentNote: true,
        archiveCurrent: () => {},
        revealCurrent: () => {},
        canReveal: true,
      }),
    );
    const menu = menuCommandIds(cmds);
    expect(menu).toContain("new-sheet");
    expect(menu).toContain("find-vault");
    expect(menu).toContain("toggle-split");
    expect(menu).toContain("archive");
    expect(menu).toContain("reveal");
  });

  it("runCommandById 执行", () => {
    const saveNow = vi.fn();
    const cmds = buildAppCommands(deps({ saveNow }));
    expect(runCommandById(cmds, "save")).toBe(true);
    expect(saveNow).toHaveBeenCalled();
    expect(runCommandById(cmds, "no-such")).toBe(false);
  });
});

describe("filterCommands", () => {
  it("按 label / keywords", () => {
    const cmds = buildAppCommands(deps());
    expect(filterCommands(cmds, "vault").some((c) => c.id === "open-vault")).toBe(
      true,
    );
    expect(filterCommands(cmds, "zzzz").length).toBe(0);
  });
});

describe("rankFiles", () => {
  const files = [
    { path: "alpha.md", title: "Alpha", kind: "note" as const },
    { path: "beta/note.md", title: "Note", kind: "note" as const },
    { path: "board.canvas", title: "board", kind: "canvas" as const },
  ];

  it("前缀优先", () => {
    const r = rankFiles(files, "al");
    expect(r[0]?.path).toBe("alpha.md");
  });

  it("路径命中", () => {
    const r = rankFiles(files, "beta");
    expect(r.some((x) => x.path.includes("beta"))).toBe(true);
  });

  it("recent 加权", () => {
    const r = rankFiles(files, "", ["board.canvas"]);
    expect(r[0]?.path).toBe("board.canvas");
  });
});

describe("buildFileEntries / mapSearchHits", () => {
  it("合并 canvas entry", () => {
    const e = buildFileEntries(
      [{ path: "a.md", title: "A" }],
      ["a.md", "w.canvas", "t.sheet"],
    );
    expect(e.some((x) => x.path === "w.canvas")).toBe(true);
    expect(e.some((x) => x.path === "t.sheet")).toBe(true);
  });

  it("map hits", () => {
    const views = mapSearchHits(
      [{ id: 1, score: 3 }],
      [{ id: 1, path: "a.md", title: "A", preview: "hi" }],
    );
    expect(views).toEqual([
      { id: 1, path: "a.md", title: "A", preview: "hi", score: 3 },
    ]);
  });
});

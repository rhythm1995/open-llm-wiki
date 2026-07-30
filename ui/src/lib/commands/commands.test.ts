import { describe, expect, it, vi } from "vitest";
import { translate } from "../i18n";
import {
  buildAppCommands,
  buildFileEntries,
  filterCommands,
  mapSearchHits,
  menuCommandIds,
  paletteCommandsFrom,
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

  it("quick-open 为 ⌘P 且不进菜单", () => {
    const openQuickOpen = vi.fn();
    const cmds = buildAppCommands(deps({ openQuickOpen }));
    const q = cmds.find((c) => c.id === "quick-open");
    expect(q?.shortcut).toBe("⌘P");
    expect(q?.inMenu).toBe(false);
    q!.run();
    expect(openQuickOpen).toHaveBeenCalled();
  });

  it("find-vault 为 ⌘⇧F", () => {
    const openVaultSearch = vi.fn();
    const cmds = buildAppCommands(deps({ openVaultSearch }));
    const f = cmds.find((c) => c.id === "find-vault");
    expect(f?.shortcut).toBe("⌘⇧F");
    f!.run();
    expect(openVaultSearch).toHaveBeenCalled();
  });

  it("菜单含 new-sheet / find-vault / toggle-split / close-tab", () => {
    const cmds = buildAppCommands(
      deps({
        onNewSheet: () => {},
        openVaultSearch: () => {},
        toggleSplitLayout: () => {},
        saveNow: () => {},
        openFind: () => {},
        hasCurrentNote: true,
        hasOpenTab: true,
        closeCurrentTab: () => {},
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
    expect(menu).toContain("close-tab");
    expect(menu).not.toContain("quick-open");
  });

  it("when 无笔记时不出现 archive / reveal", () => {
    const cmds = buildAppCommands(
      deps({
        hasCurrentNote: false,
        archiveCurrent: () => {},
        revealCurrent: () => {},
        canReveal: true,
      }),
    );
    expect(cmds.some((c) => c.id === "archive")).toBe(false);
    expect(cmds.some((c) => c.id === "reveal")).toBe(false);
  });

  it("canReveal=false 时无 reveal", () => {
    const cmds = buildAppCommands(
      deps({
        hasCurrentNote: true,
        revealCurrent: () => {},
        canReveal: false,
      }),
    );
    expect(cmds.some((c) => c.id === "reveal")).toBe(false);
  });

  it("runCommandById 执行 / 未知 id", () => {
    const saveNow = vi.fn();
    const cmds = buildAppCommands(deps({ saveNow }));
    expect(runCommandById(cmds, "save")).toBe(true);
    expect(saveNow).toHaveBeenCalled();
    expect(runCommandById(cmds, "no-such")).toBe(false);
  });

  it("plugin 命令带前缀", () => {
    const run = vi.fn();
    const cmds = buildAppCommands(
      deps({ pluginCommands: [{ id: "hello.greet", label: "Hi", run }] }),
    );
    const p = cmds.find((c) => c.id === "plugin:hello.greet");
    expect(p).toBeDefined();
    p!.run();
    expect(run).toHaveBeenCalled();
  });

  it("paletteCommandsFrom 去掉 inPalette=false", () => {
    const cmds = buildAppCommands(deps({ openQuickOpen: () => {} }));
    // quick-open 在面板里
    expect(paletteCommandsFrom(cmds).some((c) => c.id === "quick-open")).toBe(
      true,
    );
  });

  it("视图切换 run 调 onNavigate", () => {
    const onNavigate = vi.fn();
    const cmds = buildAppCommands(deps({ onNavigate }));
    runCommandById(cmds, "view-graph");
    expect(onNavigate).toHaveBeenCalledWith("graph");
  });
});

describe("filterCommands", () => {
  it("空 query 返回全部(含 inPalette 默认)", () => {
    const cmds = buildAppCommands(deps());
    expect(filterCommands(cmds, "").length).toBe(cmds.length);
  });

  it("按 label / keywords / id / shortcut", () => {
    const cmds = buildAppCommands(
      deps({ saveNow: () => {}, openVaultSearch: () => {} }),
    );
    expect(filterCommands(cmds, "vault").some((c) => c.id === "open-vault")).toBe(
      true,
    );
    expect(filterCommands(cmds, "save").some((c) => c.id === "save")).toBe(true);
    expect(filterCommands(cmds, "⌘s").some((c) => c.id === "save")).toBe(true);
    expect(filterCommands(cmds, "全文").some((c) => c.id === "find-vault")).toBe(
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
    { path: "data.sheet", title: "data", kind: "sheet" as const },
  ];

  it("前缀优先于中间包含", () => {
    const r = rankFiles(
      [
        { path: "x.md", title: "My Alpha Note", kind: "note" },
        { path: "a.md", title: "Alpha", kind: "note" },
      ],
      "alpha",
    );
    // "Alpha".startsWith("alpha") → 100; "My Alpha Note" 仅 includes → 60
    expect(r[0]?.title).toBe("Alpha");
  });

  it("路径命中", () => {
    const r = rankFiles(files, "beta");
    expect(r.some((x) => x.path.includes("beta"))).toBe(true);
  });

  it("recent 加权(空 query)", () => {
    const r = rankFiles(files, "", ["board.canvas"]);
    expect(r[0]?.path).toBe("board.canvas");
  });

  it("limit 截断", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      path: `n${i}.md`,
      title: `Note${i}`,
      kind: "note" as const,
    }));
    expect(rankFiles(many, "note", [], 5)).toHaveLength(5);
  });

  it("无匹配为空", () => {
    expect(rankFiles(files, "qqqqqq")).toEqual([]);
  });
});

describe("buildFileEntries / mapSearchHits", () => {
  it("合并 canvas/sheet,忽略点段路径", () => {
    const e = buildFileEntries(
      [{ path: "a.md", title: "A" }],
      ["a.md", "w.canvas", "t.sheet", ".hidden/x.md"],
    );
    expect(e.some((x) => x.path === "w.canvas")).toBe(true);
    expect(e.some((x) => x.path === "t.sheet")).toBe(true);
    expect(e.some((x) => x.path.includes(".hidden"))).toBe(false);
  });

  it("map hits 跳过缺失 id", () => {
    const views = mapSearchHits(
      [
        { id: 1, score: 3 },
        { id: 99, score: 1 },
      ],
      [{ id: 1, path: "a.md", title: "A", preview: "hi" }],
    );
    expect(views).toHaveLength(1);
    expect(views[0].path).toBe("a.md");
  });
});

/** 与 Tauri menu id 对齐清单(防止漂移)。 */
describe("menu id contract", () => {
  const REQUIRED_MENU_IDS = [
    "new-note",
    "new-canvas",
    "new-sheet",
    "open-vault",
    "save",
    "reveal",
    "archive",
    "close-tab",
    "settings",
    "find",
    "find-vault",
    "mode-source",
    "mode-wysiwyg",
    "toggle-split",
    "view-editor",
    "view-graph",
    "view-query",
    "view-git",
    "toggle-theme",
    "refresh-index",
  ];

  it("全量 deps 时菜单覆盖契约 id", () => {
    const menu = menuCommandIds(
      buildAppCommands(
        deps({
          onNewSheet: () => {},
          saveNow: () => {},
          openFind: () => {},
          openVaultSearch: () => {},
          setEditMode: () => {},
          toggleSplitLayout: () => {},
          toggleTheme: () => {},
          theme: "light",
          hasCurrentNote: true,
          hasOpenTab: true,
          closeCurrentTab: () => {},
          archiveCurrent: () => {},
          revealCurrent: () => {},
          canReveal: true,
          openSettings: () => {},
        }),
      ),
    );
    for (const id of REQUIRED_MENU_IDS) {
      expect(menu, `missing menu id ${id}`).toContain(id);
    }
  });
});

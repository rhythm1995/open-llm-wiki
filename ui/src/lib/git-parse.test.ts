import { describe, expect, it } from "vitest";
import {
  conflictPaths,
  hasConflicts,
  isConflictEntry,
  parseLog,
  parseStatusPorcelain,
  statusLabel,
} from "./git-parse";

describe("git-parse", () => {
  describe("parseStatusPorcelain", () => {
    it("工作区修改:' M'", () => {
      const [e] = parseStatusPorcelain(" M file.md");
      expect(e.raw).toBe(" M");
      expect(e.index).toBe(" ");
      expect(e.worktree).toBe("M");
      expect(e.path).toBe("file.md");
      expect(e.untracked).toBe(false);
    });
    it("未跟踪:'??'", () => {
      const [e] = parseStatusPorcelain("?? new.md");
      expect(e.untracked).toBe(true);
      expect(e.path).toBe("new.md");
    });
    it("已暂存新增:'A '", () => {
      const [e] = parseStatusPorcelain("A  staged.md");
      expect(e.index).toBe("A");
      expect(e.path).toBe("staged.md");
    });
    it("删除:'D '", () => {
      const [e] = parseStatusPorcelain("D  gone.md");
      expect(e.index).toBe("D");
    });
    it("重命名:拆出 renamedFrom,路径取新名", () => {
      const [e] = parseStatusPorcelain("R  old.md -> new.md");
      expect(e.index).toBe("R");
      expect(e.path).toBe("new.md");
      expect(e.renamedFrom).toBe("old.md");
    });
    it("拷贝也拆 renamedFrom", () => {
      const [e] = parseStatusPorcelain("C  orig.md -> copy.md");
      expect(e.renamedFrom).toBe("orig.md");
      expect(e.path).toBe("copy.md");
    });
    it("忽略:'!!'", () => {
      const [e] = parseStatusPorcelain("!! node_modules");
      expect(e.ignored).toBe(true);
    });
    it("空输出 → []", () => {
      expect(parseStatusPorcelain("")).toEqual([]);
    });
    it("跳过空行,保留多条", () => {
      const out = " M a.md\n\n?? b.md\nA  c.md\n";
      const r = parseStatusPorcelain(out);
      expect(r).toHaveLength(3);
      expect(r[0].path).toBe("a.md");
      expect(r[1].untracked).toBe(true);
      expect(r[2].index).toBe("A");
    });
    it("路径含空格正常保留", () => {
      const [e] = parseStatusPorcelain("?? my note.md");
      expect(e.path).toBe("my note.md");
    });
  });

  describe("parseLog", () => {
    it("单条:四字段", () => {
      const [e] = parseLog("abc123\tAlice\t2026-07-28\tfix bug");
      expect(e).toEqual({
        hash: "abc123",
        author: "Alice",
        date: "2026-07-28",
        subject: "fix bug",
      });
    });
    it("空输出 → []", () => {
      expect(parseLog("")).toEqual([]);
    });
    it("多条 + 跳过空行", () => {
      const out =
        "h1\tA\t2026-07-28\tone\n\nh2\tB\t2026-07-27\ttwo\n";
      const r = parseLog(out);
      expect(r).toHaveLength(2);
      expect(r[1].subject).toBe("two");
    });
    it("subject 内含制表符:合并保留", () => {
      const [e] = parseLog("h\tA\t2026-07-28\tcol1\tcol2");
      expect(e.subject).toBe("col1\tcol2");
    });
    it("字段不足的行跳过", () => {
      const r = parseLog("only-one-field\n");
      expect(r).toEqual([]);
    });
  });

  describe("statusLabel", () => {
    it("未跟踪 → 新", () => {
      const [e] = parseStatusPorcelain("?? x.md");
      expect(statusLabel(e)).toBe("新");
    });
    it("工作区修改 → 改", () => {
      const [e] = parseStatusPorcelain(" M x.md");
      expect(statusLabel(e)).toBe("改");
    });
    it("暂存新增 → 加", () => {
      const [e] = parseStatusPorcelain("A  x.md");
      expect(statusLabel(e)).toBe("加");
    });
    it("删除 → 删", () => {
      const [e] = parseStatusPorcelain("D  x.md");
      expect(statusLabel(e)).toBe("删");
    });
    it("重命名 → 更名", () => {
      const [e] = parseStatusPorcelain("R  a.md -> b.md");
      expect(statusLabel(e)).toBe("更名");
    });
    it("双方未合并 → 冲", () => {
      const [e] = parseStatusPorcelain("UU conflict.md");
      expect(statusLabel(e)).toBe("冲");
    });
  });

  describe("hasConflicts / conflictPaths", () => {
    it("UU 视为冲突", () => {
      const entries = parseStatusPorcelain("UU a.md\n M b.md");
      expect(isConflictEntry(entries[0])).toBe(true);
      expect(hasConflicts(entries)).toBe(true);
      expect(conflictPaths(entries)).toEqual(["a.md"]);
    });
    it("干净列表无冲突", () => {
      const entries = parseStatusPorcelain(" M a.md\n?? b.md");
      expect(hasConflicts(entries)).toBe(false);
      expect(conflictPaths(entries)).toEqual([]);
    });
  });
});

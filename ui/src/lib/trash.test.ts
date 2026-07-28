import { describe, expect, it } from "vitest";
import {
  TRASH_DIR,
  isTrashPath,
  restorePath,
  toTrashPath,
  uniqueName,
} from "./trash";

describe("trash path logic", () => {
  describe("toTrashPath", () => {
    it("把笔记相对路径映射到回收站内,保留目录结构", () => {
      expect(toTrashPath("x.md")).toBe(".trash/x.md");
      expect(toTrashPath("a/b.md")).toBe(".trash/a/b.md");
    });
  });

  describe("isTrashPath", () => {
    it("识别回收站根与其下任意路径", () => {
      expect(isTrashPath(".trash")).toBe(true);
      expect(isTrashPath(".trash/x.md")).toBe(true);
      expect(isTrashPath(".trash/a/b.md")).toBe(true);
    });
    it("拒绝普通笔记路径与近义前缀", () => {
      expect(isTrashPath("x.md")).toBe(false);
      expect(isTrashPath("a/b.md")).toBe(false);
      // 不能被 ".trashcan/x.md" 这类前缀骗到
      expect(isTrashPath(".trashcan/x.md")).toBe(false);
    });
  });

  describe("restorePath", () => {
    it("去掉 .trash/ 前缀还原原始路径", () => {
      expect(restorePath(".trash/x.md")).toBe("x.md");
      expect(restorePath(".trash/a/b.md")).toBe("a/b.md");
    });
    it("对非回收站路径原样返回(幂等)", () => {
      expect(restorePath("a/b.md")).toBe("a/b.md");
    });
  });

  describe("uniqueName", () => {
    it("无冲突时原样返回", () => {
      expect(uniqueName("x.md", new Set())).toBe("x.md");
    });
    it("单次冲突加 -2 后缀", () => {
      expect(uniqueName("x.md", new Set(["x.md"]))).toBe("x-2.md");
    });
    it("连续冲突递增到 -3/-4…", () => {
      expect(uniqueName("x.md", new Set(["x.md", "x-2.md"]))).toBe("x-3.md");
      expect(
        uniqueName("x.md", new Set(["x.md", "x-2.md", "x-3.md", "x-4.md"])),
      ).toBe("x-5.md");
    });
    it("只改文件名,不动目录前缀", () => {
      expect(uniqueName("a/b.md", new Set(["a/b.md"]))).toBe("a/b-2.md");
    });
    it("扩展名无关:非 .md 同样适用", () => {
      expect(uniqueName("readme", new Set(["readme"]))).toBe("readme-2");
    });
    it("大小写不敏感", () => {
      expect(uniqueName("X.md", new Set(["x.md"]))).toBe("X-2.md");
    });
  });

  describe("TRASH_DIR", () => {
    it("是约定的隐藏目录名", () => {
      expect(TRASH_DIR).toBe(".trash");
      expect(TRASH_DIR.startsWith(".")).toBe(true);
    });
  });
});

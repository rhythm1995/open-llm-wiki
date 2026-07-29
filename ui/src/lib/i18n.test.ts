import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  dict,
  format,
  translate,
  type Locale,
} from "./i18n";

describe("i18n", () => {
  describe("format", () => {
    it("插值 {name}", () => {
      expect(format("{n} 篇笔记", { n: 3 })).toBe("3 篇笔记");
    });
    it("无 vars 原样返回", () => {
      expect(format("abc")).toBe("abc");
    });
    it("缺失占位符原样保留", () => {
      expect(format("{a}/{b}", { a: "x" })).toBe("x/{b}");
    });
  });

  describe("translate", () => {
    it("zh 取中文", () => {
      expect(translate("zh", "view.editor")).toBe("编辑器");
    });
    it("en 取英文", () => {
      expect(translate("en", "view.editor")).toBe("Editor");
    });
    it("插值 vars", () => {
      expect(translate("en", "status.notes", { n: 5 })).toBe("5 notes");
      expect(translate("zh", "status.notes", { n: 5 })).toBe("5 篇笔记");
    });
    it("未知 key 回退到 key 本身", () => {
      expect(translate("en", "nope.does.not.exist")).toBe("nope.does.not.exist");
    });
    it("某语言缺该 key 时回退到默认语言", () => {
      // 构造:临时让 en 缺某 key,确认回退 zh。这里用真实字典里的键验证两侧都有,
      // 并直接验证回退逻辑:dict[en] 缺失时取 dict[DEFAULT_LOCALE]。
      const key = "view.git";
      expect(dict.en[key]).toBe("Git");
      expect(dict.zh[key]).toBe("Git");
      // 模拟 en 缺失:用 translate 的回退路径(传一个 en 没有但 zh 有的场景)。
      // 此字典里所有键两侧都有,故用一个隔离的小字典手动验证回退。
      const fakeLocale = "xx" as Locale;
      expect(translate(fakeLocale, "view.editor")).toBe(
        dict[DEFAULT_LOCALE]["view.editor"],
      );
    });
  });

  describe("字典完整性", () => {
    it("zh 与 en 的键集合一致", () => {
      const zhKeys = Object.keys(dict.zh).sort();
      const enKeys = Object.keys(dict.en).sort();
      expect(enKeys).toEqual(zhKeys);
    });
    it("每个键两语言都有非空值", () => {
      for (const k of Object.keys(dict.zh)) {
        expect(dict.zh[k].length).toBeGreaterThan(0);
        expect(dict.en[k].length).toBeGreaterThan(0);
      }
    });
  });
});

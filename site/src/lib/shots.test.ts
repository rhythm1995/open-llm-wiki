import { describe, it, expect } from "vitest";
import { localizeShotFile } from "./shots";

describe("localizeShotFile", () => {
  it("把截图名钉到当前语言", () => {
    expect(localizeShotFile("editor-zh.png", "en")).toBe("editor-en.png");
    expect(localizeShotFile("graph-en.png", "zh")).toBe("graph-zh.png");
    expect(localizeShotFile("health.png", "zh")).toBe("health-zh.png");
  });

  it("未知文件名原样返回", () => {
    expect(localizeShotFile("logo.png", "en")).toBe("logo.png");
    expect(localizeShotFile("images/other.jpg", "zh")).toBe("images/other.jpg");
  });
});

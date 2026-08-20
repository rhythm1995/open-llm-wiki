/**
 * useLocale —— 读盘 / toggle / t() 跟语言走。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOCALE_STORAGE_KEY } from "./i18n";
import { useLocale } from "./useLocale";

function Probe() {
  const { locale, toggle, setLocale, t } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="label">{t("view.editor")}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        en
      </button>
    </div>
  );
}

describe("useLocale", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("默认 zh,文案走中文", () => {
    render(<Probe />);
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(screen.getByTestId("label")).toHaveTextContent("编辑器");
  });

  it("读已存 en,toggle 回 zh 并落盘", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const user = userEvent.setup();
    render(<Probe />);
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("label")).toHaveTextContent("Editor");
    await user.click(screen.getByText("toggle"));
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh");
  });

  it("非法存档忽略,setLocale 写 en", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
    const user = userEvent.setup();
    render(<Probe />);
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    await user.click(screen.getByText("en"));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });
});

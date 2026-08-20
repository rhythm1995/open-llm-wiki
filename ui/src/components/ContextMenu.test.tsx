/**
 * ContextMenu —— 项点击 / 外部关闭 / Esc / 陈旧滚动忽略 / 视口夹紧。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextMenu, clampMenuPos, isFreshDismissEvent } from "./ContextMenu";

describe("isFreshDismissEvent", () => {
  it("早于打开时刻的事件忽略,同时刻及之后算新事件", () => {
    expect(isFreshDismissEvent(99, 100)).toBe(false);
    expect(isFreshDismissEvent(100, 100)).toBe(true);
    expect(isFreshDismissEvent(101, 100)).toBe(true);
  });
});

describe("clampMenuPos", () => {
  const viewport = { width: 200, height: 200 };

  it("不溢出时保持原坐标", () => {
    expect(
      clampMenuPos({ x: 10, y: 20 }, { width: 80, height: 40 }, viewport),
    ).toEqual({ x: 10, y: 20 });
  });

  it("右下溢出翻到内侧并留 pad", () => {
    expect(
      clampMenuPos({ x: 180, y: 180 }, { width: 80, height: 40 }, viewport),
    ).toEqual({ x: 116, y: 156 });
  });

  it("菜单比视口还大时贴 pad", () => {
    expect(
      clampMenuPos({ x: 10, y: 10 }, { width: 400, height: 400 }, viewport),
    ).toEqual({ x: 4, y: 4 });
  });
});

describe("ContextMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pos=null 不渲染", () => {
    const { container } = render(
      <ContextMenu items={[{ label: "Open" }]} pos={null} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("点菜单项先关再执行,分隔符不是 menuitem", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        pos={{ x: 8, y: 8 }}
        onClose={onClose}
        items={[
          { label: "Open", onClick },
          { separator: true },
          { label: "Copy" },
        ]}
      />,
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]!).toBeLessThan(
      onClick.mock.invocationCallOrder[0]!,
    );
  });

  it("disabled 项不触发 onClick 也不关", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        pos={{ x: 8, y: 8 }}
        onClose={onClose}
        items={[{ label: "Hidden", onClick, disabled: true }]}
      />,
    );
    await user.click(screen.getByRole("menuitem", { name: "Hidden" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("点遮罩关闭", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ContextMenu
        pos={{ x: 8, y: 8 }}
        onClose={onClose}
        items={[{ label: "Open" }]}
      />,
    );
    await user.click(screen.getByTestId("context-menu-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc 关闭", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        pos={{ x: 8, y: 8 }}
        onClose={onClose}
        items={[{ label: "Open" }]}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("窗口失焦关闭", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        pos={{ x: 8, y: 8 }}
        onClose={onClose}
        items={[{ label: "Open" }]}
      />,
    );
    window.dispatchEvent(new Event("blur"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("打开之后的滚动关闭", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        pos={{ x: 8, y: 8 }}
        onClose={onClose}
        items={[{ label: "Open" }]}
      />,
    );
    window.dispatchEvent(new Event("scroll"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("溢出视口时把 left/top 夹到内侧", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 200,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute("role") === "menu") {
          return {
            width: 80,
            height: 40,
            top: 0,
            left: 0,
            bottom: 40,
            right: 80,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }
        return {
          width: 0,
          height: 0,
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    );
    render(
      <ContextMenu
        pos={{ x: 180, y: 180 }}
        onClose={vi.fn()}
        items={[{ label: "Open" }]}
      />,
    );
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("116px");
    expect(menu.style.top).toBe("156px");
  });
});

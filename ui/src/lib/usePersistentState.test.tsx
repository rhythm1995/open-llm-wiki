/**
 * usePersistentState —— 读写 localStorage;坏 JSON / 不可写时退内存。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePersistentState } from "./usePersistentState";

function Probe({
  storageKey,
  initial,
}: {
  storageKey: string;
  initial: number;
}) {
  const [v, set] = usePersistentState(storageKey, initial);
  return (
    <div>
      <span data-testid="val">{v}</span>
      <button type="button" onClick={() => set(v + 1)}>
        inc
      </button>
      <button type="button" onClick={() => set((p) => p + 10)}>
        add10
      </button>
    </div>
  );
}

describe("usePersistentState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("无存档用 initial,变更即写盘", async () => {
    const user = userEvent.setup();
    render(<Probe storageKey="k" initial={3} />);
    expect(screen.getByTestId("val")).toHaveTextContent("3");
    await user.click(screen.getByText("inc"));
    expect(screen.getByTestId("val")).toHaveTextContent("4");
    expect(localStorage.getItem("k")).toBe("4");
  });

  it("挂载时读已有 JSON", () => {
    localStorage.setItem("k", "9");
    render(<Probe storageKey="k" initial={0} />);
    expect(screen.getByTestId("val")).toHaveTextContent("9");
  });

  it("坏 JSON 回退 initial", () => {
    localStorage.setItem("k", "{not-json");
    render(<Probe storageKey="k" initial={2} />);
    expect(screen.getByTestId("val")).toHaveTextContent("2");
  });

  it("函数式更新基于上一值", async () => {
    const user = userEvent.setup();
    render(<Probe storageKey="k" initial={1} />);
    await user.click(screen.getByText("add10"));
    expect(screen.getByTestId("val")).toHaveTextContent("11");
    expect(localStorage.getItem("k")).toBe("11");
  });
});

/**
 * Inspector 属性面板测试 —— 字段控件语义化(F-PROPERTIES):
 *   type 下拉、tags chip 增删、关系字段([[wikilink]])chip 增删 + 标题补全、新增属性。
 *
 * 断言经 actions.setContent 写回的 frontmatter 正确(用 frontmatter.ts 真实解析回读)。
 * 真实 radix tabs + frontmatter/wikilink 纯函数;mock 边界只在 store actions。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { NodeOut } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { TFunc } from "../lib/i18n";
import { parseFrontmatterEntries } from "../lib/frontmatter";

// jsdom 下 radix Tabs 用 pointer 事件驱动,fireEvent.click 不触发切换。
// mock 成受控简化版:Root 持 value,Trigger click→onValueChange,Content 按 value 显隐。
vi.mock("@radix-ui/react-tabs", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  const Ctx = react.createContext<{ value: string; setValue: (v: string) => void }>({
    value: "",
    setValue: () => {},
  });
  return {
    Root: ({ value, onValueChange, children }: any) => {
      const [v, setV] = react.useState(value);
      const setValue = (nv: string) => {
        setV(nv);
        onValueChange?.(nv);
      };
      return react.createElement(Ctx.Provider, { value: { value: v, setValue } }, children);
    },
    List: ({ children }: any) => react.createElement("div", { role: "tablist" }, children),
    Trigger: ({ value, children }: any) => {
      const ctx = react.useContext(Ctx);
      return react.createElement(
        "button",
        {
          role: "tab",
          "data-state": ctx.value === value ? "active" : "inactive",
          onClick: () => ctx.setValue(value),
        },
        children,
      );
    },
    Content: ({ value, children }: any) => {
      const ctx = react.useContext(Ctx);
      if (ctx.value !== value) return null;
      return react.createElement("div", { role: "tabpanel" }, children);
    },
  };
});

import { Inspector } from "./Inspector";

const t = ((k: string) => k) as unknown as TFunc;

function makeActions() {
  return { setContent: vi.fn(), selectNote: vi.fn(), copyAiContext: vi.fn() };
}

function renderInspector(content: string) {
  const actions = makeActions();
  const node: NodeOut = {
    id: 1,
    path: "n.md",
    title: "N",
    type: "Concept",
    tags: ["a"],
    status: "Active",
    created: "2026-01-01",
    modified: 0,
    preview: "",
  };
  render(
    <Inspector
      node={node}
      content={content}
      backlinks={[]}
      actions={actions as unknown as VaultActions}
      onJumpToLine={() => {}}
      noteTitles={["Foo", "Bar", "Baz"]}
      typeOptions={["Concept", "Source"]}
      t={t}
    />,
  );
  return { actions };
}

/** 切到 props tab,返回某 key 所在行(DT → 其父 row div)。 */
function propsRow(key: string): HTMLElement {
  fireEvent.click(screen.getByRole("tab", { name: /tab\.props/ }));
  const dt = screen.getByText(
    (_, el) => el?.tagName === "DT" && el.textContent === key,
  );
  return dt.parentElement as HTMLElement;
}

/** 最近一次 setContent 写回的 frontmatter entries。 */
function lastEntries(setContent: ReturnType<typeof vi.fn>) {
  const arg = setContent.mock.calls.at(-1)?.[0] as string;
  return parseFrontmatterEntries(arg);
}

const CONTENT =
  "---\ntype: Concept\nstatus: Active\ntags: [a]\nrelated_to: [[Foo]]\n---\n\n# N\n\nbody\n";

describe("Inspector 属性面板", () => {
  it("type 下拉改值,落 frontmatter", () => {
    const { actions } = renderInspector(CONTENT);
    const select = within(propsRow("type")).getByRole("combobox");
    fireEvent.change(select, { target: { value: "Source" } });
    expect(actions.setContent).toHaveBeenCalledTimes(1);
    expect(lastEntries(actions.setContent)).toContainEqual(["type", "Source"]);
  });

  it("tags chip 增:输入 + 回车写回数组", () => {
    const { actions } = renderInspector(CONTENT);
    const input = within(propsRow("tags")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(lastEntries(actions.setContent)).toContainEqual(["tags", ["a", "b"]]);
  });

  it("tags chip 删:点 × 去除", () => {
    const { actions } = renderInspector(CONTENT);
    // tags 行:1 chip(×) + 行末 trash;第一个 button 是 chip 的 ×。
    fireEvent.click(within(propsRow("tags")).getAllByRole("button")[0]);
    expect(lastEntries(actions.setContent)).toContainEqual(["tags", []]);
  });

  it("关系字段渲染为 chip + 标题补全,选中写回 [[wikilink]]", () => {
    const { actions } = renderInspector(CONTENT);
    const input = within(propsRow("related_to")).getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Ba" } });
    // 补全 filterByTitles([Foo,Bar,Baz], "Ba") = [Bar, Baz];点 Bar。
    fireEvent.mouseDown(screen.getByText("Bar"));
    expect(lastEntries(actions.setContent)).toContainEqual([
      "related_to",
      ["[[Foo]]", "[[Bar]]"],
    ]);
  });

  it("关系字段 chip 删:点 × 写回空数组", () => {
    const { actions } = renderInspector(CONTENT);
    fireEvent.click(within(propsRow("related_to")).getAllByRole("button")[0]);
    expect(lastEntries(actions.setContent)).toContainEqual(["related_to", []]);
  });

  it("新增属性:key + value 提交写回", () => {
    const { actions } = renderInspector("---\ntype: Concept\n---\n\nbody\n");
    fireEvent.click(screen.getByRole("tab", { name: /tab\.props/ }));
    fireEvent.click(screen.getByText("inspector.props.add"));
    const inputs = screen.getAllByRole("textbox");
    // add 行:key input + value input(末尾两个)。
    fireEvent.change(inputs[inputs.length - 2], { target: { value: "author" } });
    fireEvent.change(inputs[inputs.length - 1], { target: { value: "me" } });
    fireEvent.keyDown(inputs[inputs.length - 1], { key: "Enter" });
    expect(lastEntries(actions.setContent)).toContainEqual(["author", "me"]);
  });
});

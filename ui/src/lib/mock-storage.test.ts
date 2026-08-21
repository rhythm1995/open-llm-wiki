/**
 * mock 存储防护(doc 17):detect_storage 的 URL 覆写(?mock-storage=)与
 * scan_conflicts 的 mock 配对规则(与 core conflict_pairs 同形)。
 */
import { describe, it, expect, afterEach } from "vitest";
import { handle, mockStorageKind } from "./mock";

function setQuery(q: string) {
  window.history.replaceState(null, "", q);
}

describe("mock storage guard", () => {
  afterEach(() => setQuery(""));

  it("默认 local;URL 覆写 icloud / icloud-managed / cloud-other", () => {
    setQuery("");
    expect(mockStorageKind()).toBe("local");
    setQuery("?mock-storage=icloud");
    expect(mockStorageKind()).toBe("icloud");
    setQuery("?mock-storage=icloud-managed");
    expect(mockStorageKind()).toBe("icloud-managed");
    setQuery("?mock-storage=cloud-other");
    expect(mockStorageKind()).toBe("cloud-other");
    // 非法值回退 local。
    setQuery("?mock-storage=dropbox");
    expect(mockStorageKind()).toBe("local");
  });

  it("detect_storage:local 无 CloudDocs 根,icloud 有", async () => {
    setQuery("");
    const local = await handle<{ kind: string; cloud_docs_root: string | null }>(
      "detect_storage",
      { root: "/mock-vault" },
    );
    expect(local.kind).toBe("local");
    expect(local.cloud_docs_root).toBeNull();
    setQuery("?mock-storage=icloud");
    const cloud = await handle<{ kind: string; cloud_docs_root: string | null }>(
      "detect_storage",
      { root: "/mock-vault" },
    );
    expect(cloud.kind).toBe("icloud");
    expect(cloud.cloud_docs_root).toContain("CloudDocs");
  });

  it("scan_conflicts:X N.md 与 X.md 并存才配对", async () => {
    // 灌入冲突对与孤立命名(mock vault 是共享 Map,先清理再定向灌)。
    await handle<void>("delete_note", { root: "", path: "Note.md" }).catch(() => {});
    await handle<void>("write_note", {
      root: "",
      path: "CT Base.md",
      content: "# base",
    });
    await handle<void>("write_note", {
      root: "",
      path: "CT Base 2.md",
      content: "# copy",
    });
    await handle<void>("write_note", {
      root: "",
      path: "CT Lone 9.md",
      content: "# no sibling",
    });
    const pairs = await handle<{ base: string; copy: string }[]>("scan_conflicts", {
      root: "",
    });
    expect(pairs).toContainEqual({ base: "CT Base.md", copy: "CT Base 2.md" });
    expect(pairs.some((p) => p.copy === "CT Lone 9.md")).toBe(false);
    // 清理,避免污染其它用例。
    await handle<void>("delete_note", { root: "", path: "CT Base.md" });
    await handle<void>("delete_note", { root: "", path: "CT Base 2.md" });
    await handle<void>("delete_note", { root: "", path: "CT Lone 9.md" });
  });

  it("create_icloud_vault / set_git_automation 可用(mock 语义)", async () => {
    const root = await handle<string>("create_icloud_vault", { name: "demo" });
    expect(typeof root).toBe("string");
    expect(root.length).toBeGreaterThan(0);
    await expect(
      handle<void>("set_git_automation", { root: "/x", allowed: true }),
    ).resolves.toBeUndefined();
  });
});

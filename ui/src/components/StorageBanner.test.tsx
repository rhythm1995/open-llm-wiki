/**
 * StorageBanner —— 存储类别一次性横幅(doc 17)。
 * local 不渲染;各类别出对应文案;eviction 行;「知道了」按 root 持久化。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StorageBanner } from "./StorageBanner";
import type { StorageInfo } from "../lib/storage-notice";
import type { TFunc } from "../lib/i18n";

const t = ((key: string) => key) as TFunc;

function info(kind: StorageInfo["kind"], evicted = 0): StorageInfo {
  return {
    kind,
    cloud_docs_root: null,
    evicted_sampled: evicted > 0 ? 10 : 0,
    evicted_count: evicted,
  };
}

describe("StorageBanner", () => {
  beforeEach(() => localStorage.clear());

  it("local 零打扰:不渲染", () => {
    const { container } = render(
      <StorageBanner root="/v" info={info("local")} t={t} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("icloud:渲染标题/正文/git 提示", () => {
    render(<StorageBanner root="/v" info={info("icloud")} t={t} />);
    expect(screen.getByTestId("storage-banner")).toHaveAttribute("data-kind", "icloud");
    expect(screen.getByText("storage.banner.icloud.title")).toBeInTheDocument();
    expect(screen.getByText("storage.banner.icloud.body")).toBeInTheDocument();
    expect(screen.queryByTestId("storage-banner-evicted")).not.toBeInTheDocument();
  });

  it("icloud + eviction:出现未下载行", () => {
    render(<StorageBanner root="/v" info={info("icloud", 3)} t={t} />);
    expect(screen.getByTestId("storage-banner-evicted")).toHaveTextContent(
      "storage.banner.evicted",
    );
  });

  it("icloud-managed 与 cloud-other 各出对应文案", () => {
    const r1 = render(<StorageBanner root="/v" info={info("icloud-managed")} t={t} />);
    expect(screen.getByText("storage.banner.managed.title")).toBeInTheDocument();
    r1.unmount();
    render(<StorageBanner root="/v" info={info("cloud-other")} t={t} />);
    expect(screen.getByText("storage.banner.other.title")).toBeInTheDocument();
  });

  it("「知道了」持久化:同 root 不再出现,别的 root 不受影响", () => {
    const first = render(<StorageBanner root="/v" info={info("icloud")} t={t} />);
    fireEvent.click(screen.getByTestId("storage-banner-dismiss"));
    expect(first.queryByTestId("storage-banner")).not.toBeInTheDocument();
    first.unmount();
    // 重新挂载(模拟重开)仍不出现。
    const again = render(<StorageBanner root="/v" info={info("icloud")} t={t} />);
    expect(again.queryByTestId("storage-banner")).not.toBeInTheDocument();
    // 另一个 root 正常出现。
    const { container } = render(
      <StorageBanner root="/other" info={info("icloud")} t={t} />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  it("eviction 计数上涨超过已关闭值 → 横幅重新出现(doc 17 §7)", () => {
    // 首次 evicted=3 → 可见 → 关闭。
    const r1 = render(<StorageBanner root="/v" info={info("icloud", 3)} t={t} />);
    expect(r1.getByTestId("storage-banner-evicted")).toBeInTheDocument();
    fireEvent.click(r1.getByTestId("storage-banner-dismiss"));
    r1.unmount();
    // 同计数(3)重开:不再出现。
    const r2 = render(<StorageBanner root="/v" info={info("icloud", 3)} t={t} />);
    expect(r2.queryByTestId("storage-banner")).not.toBeInTheDocument();
    r2.unmount();
    // 恶化(5 > 3):重新出现并带 eviction 行。
    const r3 = render(<StorageBanner root="/v" info={info("icloud", 5)} t={t} />);
    expect(r3.getByTestId("storage-banner")).toBeInTheDocument();
    expect(r3.getByTestId("storage-banner-evicted")).toBeInTheDocument();
    fireEvent.click(r3.getByTestId("storage-banner-dismiss"));
    r3.unmount();
    // 再以 5 重开:不再出现(已按 5 关闭)。
    const r4 = render(<StorageBanner root="/v" info={info("icloud", 5)} t={t} />);
    expect(r4.queryByTestId("storage-banner")).not.toBeInTheDocument();
  });

  it("非 iCloud 类不因 eviction 复现(cloud-other 关闭后保持关闭)", () => {
    const r1 = render(<StorageBanner root="/v" info={info("cloud-other")} t={t} />);
    fireEvent.click(r1.getByTestId("storage-banner-dismiss"));
    r1.unmount();
    const r2 = render(<StorageBanner root="/v" info={info("cloud-other")} t={t} />);
    expect(r2.queryByTestId("storage-banner")).not.toBeInTheDocument();
  });
});

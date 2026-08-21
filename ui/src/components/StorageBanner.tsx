/**
 * StorageBanner —— 存储类别一次性提示横幅(doc 17 提示层)。
 *
 * - local 不渲染(零打扰铁律);
 * - icloud / icloud-managed / cloud-other 按类别出对应文案;
 * - iCloud 类且 eviction 采样 > 0 追加一行"未下载"提示;
 * - 「知道了」按 root 记入 localStorage(storage-notice),此后不再出现。
 */
import { useState } from "react";
import { Cloud, Warning } from "@phosphor-icons/react";
import type { StorageInfo } from "../lib/storage-notice";
import {
  isIcloudKind,
  readEvictionDismissedCount,
  readStorageNoticeDismissed,
  writeEvictionDismissedCount,
  writeStorageNoticeDismissed,
} from "../lib/storage-notice";
import type { TFunc } from "../lib/i18n";

export interface StorageBannerProps {
  root: string;
  info: StorageInfo;
  t: TFunc;
}

export function StorageBanner({ root, info, t }: StorageBannerProps) {
  const [mainDismissed, setMainDismissed] = useState(() =>
    readStorageNoticeDismissed((k) => window.localStorage.getItem(k), root),
  );
  const [evicDismissed, setEvicDismissed] = useState(() =>
    readEvictionDismissedCount((k) => window.localStorage.getItem(k), root),
  );
  // 主横幅一次性;eviction 计数超过"已关闭时的计数"→ 整体重新出现(doc 17 §7)。
  const evictionVisible =
    isIcloudKind(info.kind) && info.evicted_count > evicDismissed;
  if (info.kind === "local" || (mainDismissed && !evictionVisible)) return null;

  const isIcloud = info.kind === "icloud";
  const isManaged = info.kind === "icloud-managed";
  const title = isIcloud
    ? t("storage.banner.icloud.title")
    : isManaged
      ? t("storage.banner.managed.title")
      : t("storage.banner.other.title");
  const body = isIcloud
    ? t("storage.banner.icloud.body")
    : isManaged
      ? t("storage.banner.managed.body")
      : t("storage.banner.other.body");

  const dismiss = () => {
    writeStorageNoticeDismissed((k, v) => window.localStorage.setItem(k, v), root);
    writeEvictionDismissedCount(
      (k, v) => window.localStorage.setItem(k, v),
      root,
      info.evicted_count,
    );
    setMainDismissed(true);
    setEvicDismissed(info.evicted_count);
  };

  return (
    <div
      data-testid="storage-banner"
      data-kind={info.kind}
      className="flex items-start gap-2 border-b border-yellow/40 bg-yellow/10 px-3 py-1.5 text-[12px] text-text"
    >
      {isIcloudKind(info.kind) ? (
        <Cloud size={14} weight="bold" className="mt-0.5 shrink-0 text-blue" />
      ) : (
        <Warning size={14} weight="bold" className="mt-0.5 shrink-0 text-yellow" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-medium">{title}</span>
        <span className="ml-1 text-subtext">{body}</span>
        {evictionVisible && info.evicted_count > 0 && (
          <div data-testid="storage-banner-evicted" className="mt-0.5 text-yellow">
            {t("storage.banner.evicted", { n: info.evicted_count })}
          </div>
        )}
      </div>
      <button
        type="button"
        data-testid="storage-banner-dismiss"
        onClick={dismiss}
        className="shrink-0 rounded px-2 py-0.5 font-medium text-blue hover:bg-blue/10"
      >
        {t("storage.banner.dismiss")}
      </button>
    </div>
  );
}

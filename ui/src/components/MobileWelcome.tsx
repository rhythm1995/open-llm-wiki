/**
 * MobileWelcome —— 移动端首启欢迎(doc 18 §5 / M1)。
 *
 * 桌面欢迎台的移动剪裁版:不提供「打开任意文件夹」(iOS 安全域书签与裸路径模型
 * 不匹配)与 iCloud 入口(M2),只有「创建示例库」(落 app Documents,文件 app
 * 可见)+ 最近 vault 列表。
 */
import type { TFunc } from "../lib/i18n";

export function MobileWelcome({
  t,
  onCreateSample,
  recents,
  onOpenRoot,
  busy = false,
}: {
  t: TFunc;
  onCreateSample: () => void;
  recents: string[];
  onOpenRoot: (root: string) => void;
  busy?: boolean;
}) {
  return (
    <div
      data-testid="mobile-welcome"
      className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto p-6"
    >
      <img src="/olw-mark.png" alt="" width={56} height={56} draggable={false} />
      <div className="text-center">
        <p className="text-[16px] font-medium text-text">Open LLM Wiki</p>
        <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-subtext">
          {t("mobile.welcome.hint")}
        </p>
      </div>
      <button
        type="button"
        data-testid="mobile-create-sample"
        disabled={busy}
        onClick={onCreateSample}
        className="rounded-lg bg-blue px-5 py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
      >
        {t("mobile.welcome.createSample")}
      </button>
      {recents.length > 0 && (
        <div className="w-full max-w-xs">
          <p className="mb-1 px-2 text-[11px] text-subtext">
            {t("mobile.welcome.recent")}
          </p>
          {recents.map((root) => (
            <button
              key={root}
              type="button"
              onClick={() => onOpenRoot(root)}
              className="block w-full truncate rounded px-2 py-2 text-left text-[13px] text-text hover:bg-surface"
            >
              {root}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

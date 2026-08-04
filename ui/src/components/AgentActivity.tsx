/**
 * AgentActivity —— git 归因活动面板(B-AGENT-GIT-ATTR / doc 11 §4)。
 *
 * 列出当前 agent 在 `refs/agents/<id>` 上的 post-turn 提交(= 每轮 agent 的写入),
 * 点开看 diff,一键**撤销**(= 把该 turn 的 diff 逆向 apply 回工作树,不动 HEAD)。
 *
 * 安全前提(Rust 侧 git_attr 保证):提交落在命名空间 ref、绝不动 HEAD;撤销只
 * reverse-apply 工作树。非 git 仓库时后端返回空列表,本组件自然不显示。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCommit, ArrowCounterClockwise, CheckCircle, CaretDown } from "@phosphor-icons/react";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";

type Entry = {
  oid: string;
  phase: string;
  date: string;
  subject: string;
  stat: string;
  /** 该轮触及的文件路径(后端最多给 10 条)。 */
  files: string[];
  /** 已合入 HEAD(手动采纳或即时提交自动采纳)。 */
  adopted: boolean;
};

export function AgentActivity({
  root,
  agentId,
  refreshKey,
  t,
}: {
  root: string;
  agentId: string;
  /** 父组件在每轮 agent-done 时 +1,触发重载。 */
  refreshKey: number;
  t: TFunc;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [diffOid, setDiffOid] = useState<string | null>(null);
  const [diff, setDiff] = useState("");

  useEffect(() => {
    invoke<Entry[]>("agent_activity", { root, agentId })
      .then((rows) => setEntries(rows.filter((r) => r.phase === "post")))
      .catch(() => setEntries([]));
  }, [root, agentId, refreshKey]);

  const showDiff = (oid: string) => {
    if (diffOid === oid) {
      setDiffOid(null);
      return;
    }
    setDiffOid(oid);
    invoke<string>("agent_diff", { root, oid })
      .then(setDiff)
      .catch((e) => setDiff(`(${String(e)})`));
  };

  const revert = async (oid: string) => {
    if (!window.confirm(t("agent.revertConfirm"))) return;
    try {
      await invoke("agent_revert", { root, oid });
      setDiffOid(null);
      // 重载列表。
      const rows = await invoke<Entry[]>("agent_activity", { root, agentId });
      setEntries(rows.filter((r) => r.phase === "post"));
    } catch (e) {
      window.alert(`${t("agent.revertFailed")}:${String(e)}`);
    }
  };

  const adopt = async (oid: string) => {
    if (!window.confirm(t("agent.adoptConfirm"))) return;
    try {
      await invoke("agent_adopt", { root, oid });
      setDiffOid(null);
      // 先本地标「已合入」,再用后端数据校正(adopted 由 HEAD 上的 adopt 提交匹配得出)。
      setEntries((prev) => prev.map((r) => (r.oid === oid ? { ...r, adopted: true } : r)));
      invoke<Entry[]>("agent_activity", { root, agentId })
        .then((rows) => setEntries(rows.filter((r) => r.phase === "post")))
        .catch(() => undefined);
    } catch (e) {
      window.alert(`${t("agent.adoptFailed")}:${String(e)}`);
    }
  };

  if (entries.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-crust">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("agent.activityTip")}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-text hover:bg-mantle"
      >
        <GitCommit size={12} weight="fill" className="text-blue" />
        <span>{t("agent.activity")}</span>
        <span className="text-overlay">({entries.length})</span>
        <CaretDown
          size={11}
          className={cn("ml-auto transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {entries.map((e) => (
            <div key={e.oid} className="border-b border-crust/50 py-1 last:border-0">
              <div className="flex items-center gap-1.5 px-1.5 text-[11px]">
                <span className="shrink-0 tabular-nums text-overlay">{e.date}</span>
                <span className="flex-1 truncate text-text">{e.stat}</span>
                <button
                  onClick={() => showDiff(e.oid)}
                  className="rounded px-1 py-0.5 text-[10px] text-blue hover:bg-surface"
                >
                  diff
                </button>
                {e.adopted ? (
                  <span
                    title={t("agent.adoptedMark")}
                    className="flex items-center gap-0.5 px-1 py-0.5 text-[10px] text-green"
                  >
                    <CheckCircle size={10} weight="fill" />
                    {t("agent.adoptedMark")}
                  </span>
                ) : (
                  <button
                    onClick={() => void adopt(e.oid)}
                    title={t("agent.adopt")}
                    className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-green hover:bg-surface"
                  >
                    <CheckCircle size={10} />
                  </button>
                )}
                <button
                  onClick={() => void revert(e.oid)}
                  title={t("agent.revert")}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-red hover:bg-surface"
                >
                  <ArrowCounterClockwise size={10} />
                </button>
              </div>
              {e.files.length > 0 && (
                <div
                  className="truncate px-1.5 text-[10px] text-overlay"
                  title={e.files.join("\n")}
                >
                  {e.files.slice(0, 3).join(", ")}
                  {e.files.length > 3 ? ` +${e.files.length - 3}` : ""}
                </div>
              )}
              {diffOid === e.oid && (
                <pre className="m-1.5 max-h-40 overflow-auto rounded bg-crust/60 p-1.5 text-[10px] leading-tight text-overlay">
                  {diff || "…"}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

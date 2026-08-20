/**
 * ToolCard —— tool_call 折叠卡(B-AGENT-THREADVIEW 完整形态,doc 11 §5)。
 *
 * 渲染规则(§5「tool_call 默认折叠」):
 *  - 默认折叠成一行:标题 + 状态色点。
 *  - **失败自动展开**。
 *  - 带长输出的**二级折叠**:折叠态只露摘要(首行 / locations),展开看全输出。
 */
import { useEffect, useState } from "react";
import { Wrench, CheckCircle, XCircle, Spinner, CaretDown } from "@phosphor-icons/react";
import { cn } from "../lib/cn";
import type { ToolRecord, ToolStatus } from "../lib/agent-session";

const SUMMARY_MAX = 120;

function StatusDot({ status }: { status: ToolStatus }) {
  if (status === "completed")
    return <CheckCircle size={12} weight="fill" className="text-green" />;
  if (status === "failed")
    return <XCircle size={12} weight="fill" className="text-red" />;
  if (status === "in_progress")
    return <Spinner size={12} className="text-blue animate-spin" />;
  return <span className="h-2 w-2 rounded-full bg-overlay" />;
}

export function ToolCard({ rec }: { rec: ToolRecord }) {
  const failed = rec.status === "failed";
  // 失败自动展开;其余默认折叠。
  const [open, setOpen] = useState(failed);
  // 失败状态后到时,强制展开一次。
  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const longText = rec.text.length > SUMMARY_MAX;
  const [fullText, setFullText] = useState(false);

  return (
    <div
      data-testid="tool-card"
      data-status={rec.status}
      className={cn(
        "self-start rounded border bg-mantle text-[11px]",
        failed ? "border-red/50" : "border-crust",
      )}
    >
      <button
        type="button"
        data-testid="tool-card-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-text hover:bg-surface"
      >
        <Wrench size={11} className="shrink-0 text-blue" />
        <span className="flex-1 truncate">{rec.title || "(工具调用)"}</span>
        {rec.locations.length > 0 && (
          <span className="max-w-[40%] truncate text-overlay">
            {rec.locations.join(", ")}
          </span>
        )}
        <StatusDot status={rec.status} />
        <CaretDown
          size={10}
          className={cn("text-overlay transition-transform", open && "rotate-180")}
        />
      </button>
      {open && rec.text && (
        <div className="border-t border-crust/60 px-2 py-1">
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-tight text-overlay">
            {longText && !fullText
              ? rec.text.slice(0, SUMMARY_MAX) + "…"
              : rec.text}
          </pre>
          {longText && (
            <button
              type="button"
              data-testid="tool-card-more"
              onClick={() => setFullText((v) => !v)}
              className="mt-0.5 text-[10px] text-blue hover:underline"
            >
              {fullText ? "收起" : "展开全部"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

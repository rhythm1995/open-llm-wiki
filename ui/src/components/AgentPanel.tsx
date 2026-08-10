/**
 * AgentPanel —— 右栏「Agent」tab(doc 11 / Phase 7,完整 Tier 2)。
 *
 * 把 picker / ThreadView(含 tool_call 折叠)/ Composer(@-context + 单一动作槽)/
 * 权限卡(三档 + 高危门控 + 宽松琥珀点)/ Model C 移交 / git 活动面板 收在同一组件。
 *
 * 仅 Tauri 桌面端可用(浏览器 mock 模式无 agent 子进程)。
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Robot,
  PaperPlaneTilt,
  Check,
  X,
  StopCircle,
  PlugsConnected,
  ArrowsLeftRight,
  Stack,
  ClockCounterClockwise,
  Plus,
  Trash,
  CaretDown,
  At,
} from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";
import { cn } from "../lib/cn";
import { AgentIcon } from "../lib/agent-icons";
import { usePersistentState } from "../lib/usePersistentState";
import { ipc } from "../lib/ipc";
import {
  parseSessionUpdate,
  normalizeForHandoff,
  type ToolRecord,
  type ToolStatus,
} from "../lib/agent-session";
import type { ContextCandidate } from "../lib/ai-context";
import { ToolCard } from "./ToolCard";
import { AgentActivity } from "./AgentActivity";
import { HoverPop } from "./HoverPop";
import { log } from "../lib/logger";

/** 与后端 `acp::AgentInfo` 对齐。 */
type AgentInfo = {
  id: string;
  label: string;
  command: string;
  installed: boolean;
  /** §9.3 未安装时的安装指引(Node 缺失时含「先装 Node」)。 */
  installHint: string;
};

/** 与后端 `transcript::ThreadInfo` 对齐(历史会话列表)。 */
type ThreadInfo = {
  id: number;
  agent: string;
  created: number;
  msg_count: number;
  last_ts: number;
};

/** 对话流里的一条:文本气泡 或 tool_call 卡(交错保序)。 */
type Entry =
  | { kind: "msg"; role: "user" | "agent" | "error"; text: string }
  | { kind: "tool"; tool: ToolRecord }
  | {
      kind: "autoApprove";
      title: string;
      slug: string | null;
      via: "whitelist" | "permissive";
    };

type PermPayload = {
  id: string;
  tool_call: unknown;
  options: unknown[];
  /** terminal 创建等恒高危操作由后端直标 true,宽松模式也照常弹卡逐次问。 */
  highRisk?: boolean;
  /** 稳定工具分类(read/edit/search…),白名单键;高危为 null。 */
  kind?: string | null;
};

/** §2.3 agent 声明的会话模式 / 配置选项(来自 NewSessionResponse)。 */
type SessionModeInfo = {
  current: string;
  available: Array<{ id: string; name: string; description?: string | null }>;
};
type ConfigOption = {
  id: string;
  name: string;
  description?: string | null;
  type: "select" | "boolean";
  currentValue: string | boolean;
  /** ACP SessionConfigOptionCategory:"model" | "mode" | "thought_level" | …;
   *  category=model 的选项被提升为 composer 里的专用模型下拉(见 modelSel)。 */
  category?: string | null;
  // 注意:option 的值字段是 `value`(对齐 ACP SDK SessionConfigOptionValue),
  // 不是 id——之前用 id 导致 claude 的模型/effort 下拉值恒为 undefined、切换失效。
  options?: Array<{ value: string; name: string; description?: string | null }>;
};
/** cursor 私有 models(ACP 标准无此字段)。适配器 ≥0.7 实现了扩展方法 session/set_model,
 *  故此数据用于渲染可切换的模型下拉(见 SessionControls / agent_set_model)。 */
type SessionModels = {
  current: string;
  currentName?: string | null;
  available: Array<{ modelId: string; name: string }>;
};
type SessionInfo = {
  modes?: SessionModeInfo | null;
  configOptions?: ConfigOption[] | null;
  models?: SessionModels | null;
};

/** 高危操作启发式(§5):笔记删除 / 重命名移动 / 破坏性覆盖 恒门控,无论权限模式。 */
function isHighRisk(toolCall: unknown): boolean {
  const s = JSON.stringify(toolCall ?? "").toLowerCase();
  return /(delet|remov|rename|\bmove\b|overwrite|rmdir|trash|destructive|wipe)/.test(s);
}

/** 把 tool 消息文本("标题 · status")还原成 ToolRecord(回放用)。 */
function toolMsgToRecord(text: string, idx: number): ToolRecord {
  const m = text.match(/^(.*) · (pending|in_progress|completed|failed)$/);
  if (m) {
    return {
      id: `replay-${idx}`,
      title: m[1],
      status: m[2] as ToolStatus,
      text: "",
      locations: [],
    };
  }
  return {
    id: `replay-${idx}`,
    title: text,
    status: "completed",
    text: "",
    locations: [],
  };
}

/** Entry → 归一化用的 {role,text}(tool 压成「标题 · status」)。 */
function entriesToMsgs(entries: Entry[]): Array<{ role: string; text: string }> {
  return entries
    .filter((e) => e.kind !== "autoApprove") // 自动放行提示是即时的,不进移交归一化
    .map((e) =>
      e.kind === "tool"
        ? { role: "tool", text: `${e.tool.title} · ${e.tool.status}` }
        : { role: e.role, text: e.text },
    );
}

/** §31 把毫秒 ts 渲染成粗粒度相对时间(展示用;locale 无关的简写)。 */
function relTime(ms: number): string {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}时前`;
  return `${Math.floor(h / 24)}天前`;
}

/** 上下文环(SVG 圆环 r=6)周长:strokeDasharray/offset 算进度用。 */
const CTX_RING_C = 2 * Math.PI * 6;

/**
 * Cursor 式小选择器:文本按钮 + 向上弹层,弹层**不带 title**(省空间)。
 * mode / model / effort 共用。`boxed` = 带边框定宽(模型用);默认裸文本(Cursor
 * 的 mode 样式)。弹层开合 + 外点关闭自包含,免外部状态。
 */
function MiniSelect({
  cur,
  curName,
  options,
  onPick,
  boxed = false,
  className,
  align = "left",
  hoverText,
}: {
  cur: string;
  curName: string;
  options: Array<{ id: string; name: string }>;
  onPick: (id: string) => void;
  boxed?: boolean;
  className?: string;
  align?: "left" | "right";
  hoverText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const btn = (
    <button
      onClick={() => setOpen((v) => !v)}
      className={cn(
        // 宽度随当前选项内容自适应;超过 max-w 截断(省略号),不撑爆 composer。
        "flex max-w-36 items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
        boxed
          ? "border border-crust bg-mantle text-text hover:bg-surface"
          : "text-overlay hover:bg-surface hover:text-text",
      )}
    >
      <span className="min-w-0 truncate">{curName}</span>
      <CaretDown
        size={8}
        className={cn(
          "shrink-0 text-overlay transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
  );
  return (
    <div ref={ref} className={cn("relative", className)}>
      {hoverText ? (
        <HoverPop text={hoverText} hide={open}>
          {btn}
        </HoverPop>
      ) : (
        btn
      )}
      {open && (
        <div
          className={cn(
            // 弹层宽度随最长选项(w-max),封顶 max-w-64,超长项行内截断。
            "absolute bottom-full z-30 mb-1 max-h-56 w-max max-w-64 overflow-y-auto rounded border border-crust bg-mantle py-1 shadow-lg",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onPick(o.id);
                setOpen(false);
              }}
              title={o.id}
              className={cn(
                "flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] hover:bg-surface",
                o.id === cur ? "text-blue" : "text-text",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.id === cur && <Check size={10} weight="bold" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentPanel({
  root,
  t,
  getAiContext,
  getContextCandidates,
  onOpenMemoryOnboard,
}: {
  root: string;
  t: TFunc;
  /**
   * 取 vault 上下文 markdown(当前笔记恒附 + 勾选的邻居)。§25:可选传邻居 paths
   * 子集;不传则附全部邻居(旧语义)。Composer `@`-context 与 Model C 移交共用。
   */
  getAiContext?: (paths?: string[]) => Promise<string | null>;
  /** §25:@-context 选择器的候选列表(当前笔记 + 外向邻居),不预取正文。 */
  getContextCandidates?: () => Promise<ContextCandidate[]>;
  /** 打开「设置 → Agent 记忆接入」(外部 MCP)。 */
  onOpenMemoryOnboard?: () => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [active, setActive] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  /** 正在连接的 agent id(null = 空闲)。per-agent:只有被点的卡片显示「连接中」,
   *  其他卡片保持「就绪」(连接期间全部禁用,防并发起多个子进程)。 */
  const [connectingAgentId, setConnectingAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** § 取消中标志:stopAgent 发 session/cancel 后置 true,被取消那轮的 agent-done
   *  复位 busy 时清 false。据此判断兜底超时是否还需强制复位(防 agent 不理会 cancel)。
   *  注意:任何**其它**复位 busy 的路径(agent-error / 存活轮询 / 新 prompt / 关闭会话)
   *  都必须同时清它——否则兜底定时器会在 15s 后误复位**新一轮** prompt 的 busy。 */
  const stoppingRef = useRef(false);
  /** stopAgent 的兜底定时器句柄(发新消息 / 错误 / 关闭时清除,防误复位新 prompt)。 */
  const stopTimerRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  /** busy 时再按发送 → 排队(单一动作槽的 Queue 态)。ref 镜像供事件处理器读取
   *  (事件回调在 useEffect 闭包里拿不到最新 state;副作用也绝不放 setState updater——
   *  StrictMode 双调 updater 会把排队消息发两遍)。 */
  const [queued, _setQueued] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);
  const setQueued = (q: string | null) => {
    queuedRef.current = q;
    _setQueued(q);
  };
  const [perm, setPerm] = useState<PermPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityTick, setActivityTick] = useState(0);
  /** agent 推送的上下文用量(usage_update:已用 / 窗口大小),供 SessionControls 进度条。 */
  const [usage, setUsage] = useState<{ used: number; size: number } | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);

  /** 权限模式:normal(逐次问)/ permissive(宽松,非高危自动放行)。琥珀点提示后者。 */
  const [permMode, setPermMode] = usePersistentState<"normal" | "permissive">(
    "open-llm-wiki.agent.permMode",
    "normal",
  );
  /**
   * §5 第二档:按工具分类的持久白名单(read/edit/search…)。「始终允许此类」勾选后
   * 把该 kind 存入;之后同类(且非高危)请求自动放行,不再弹卡。delete/move/execute
   * 等高危类后端不发 kind,故永远进不来。
   */
  const [whitelist, setWhitelist] = usePersistentState<string[]>(
    "open-llm-wiki.agent.permWhitelist",
    [],
  );
  /**
   * §4 即时提交模式(默认 off=隔离):on 时每轮 agent 写完成后自动 adopt 进 HEAD,
   * per-agent ref 仍留作回滚镜像。用户在隔离 / 即时提交之间切换。
   */
  const [instantCommit, setInstantCommit] = usePersistentState<boolean>(
    "open-llm-wiki.agent.instantCommit",
    false,
  );
  /** §2.3 agent 声明的会话模式 / 配置(会话建立后由 agent-session-info 填充)。 */
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  /** Composer `@`-context:是否附上下文;选中邻居子集;候选列表;picker 开合。 */
  const [ctxActive, setCtxActive] = useState(false);
  const [ctxSelected, setCtxSelected] = useState<string[]>([]);
  const [ctxCandidates, setCtxCandidates] = useState<ContextCandidate[]>([]);
  const [ctxPickerOpen, setCtxPickerOpen] = useState(false);
  /** 上下文环(Cursor 式)弹层开合;ref 供外点关闭。 */
  const [ctxRingOpen, setCtxRingOpen] = useState(false);
  const ctxRingRef = useRef<HTMLDivElement | null>(null);
  /** §31 历史会话列表 + 切换浮层。 */
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [threadListOpen, setThreadListOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const agentTextRef = useRef(""); // 当前 agent 回合累积文本,done 时落库
  const toolsRef = useRef<Map<string, ToolRecord>>(new Map()); // id → 最新工具态(persist 用)
  // handler 闭包要在订阅期间读「最新」值,故用 ref 镜像(避免 stale closure)。
  const rootRef = useRef(root);
  const threadIdRef = useRef<number | null>(null);
  const permModeRef = useRef(permMode);
  const whitelistRef = useRef(whitelist);
  const instantCommitRef = useRef(instantCommit);
  /** 权限卡上的「始终允许此类」勾选态;高危时禁用并隐藏。 */
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  rootRef.current = root;
  permModeRef.current = permMode;
  whitelistRef.current = whitelist;
  instantCommitRef.current = instantCommit;

  useEffect(() => {
    invoke<AgentInfo[]>("agent_list")
      .then(setAgents)
      .catch(() => {});
  }, []);

  // 挂载 / 换 vault:拉历史列表 + 回放最近一条线程(顺带修切 tab 卸载丢对话)。
  useEffect(() => {
    if (!root) return;
    threadIdRef.current = null;
    setThreadListOpen(false);
    (async () => {
      const list = await refreshThreads();
      if (list.length === 0) return;
      const latest = list[0];
      await openThread(latest.id, latest.agent);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  // 滚到底。
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries, perm]);

  // 上下文环弹层:外点关闭(同 MiniSelect 的模式)。
  useEffect(() => {
    if (!ctxRingOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ctxRingRef.current && !ctxRingRef.current.contains(e.target as Node)) {
        setCtxRingOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [ctxRingOpen]);

  // 存活检测(B-AGENT-SHELL):活动时定时轮询 agent_alive,子进程意外退出即复位,
  // 不致「已连接」假活。(脏退出后端也会 emit agent-error,此为轮询兜底。)
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(async () => {
      try {
        const alive = await invoke<boolean>("agent_alive");
        if (!alive && active) {
          setError("agent 进程已结束");
          setActive(false);
          setActiveAgent(null);
          clearStopping();
          setBusy(false);
          setPerm(null);
          setQueued(null);
          resetCtx();
        }
      } catch {
        /* 忽略单次轮询失败 */
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [active]);

  const persist = (role: string, text: string) => {
    const tid = threadIdRef.current;
    const r = rootRef.current;
    if (tid == null || !r) return;
    void invoke("agent_thread_append", {
      root: r,
      threadId: tid,
      role,
      text,
      rawBlob: null,
    }).catch(() => {});
  };

  /** §31 拉取历史会话列表(新→旧);返回列表供调用方就地用(挂载回放)。 */
  async function refreshThreads(): Promise<ThreadInfo[]> {
    if (!root) return [];
    try {
      const list = await invoke<ThreadInfo[]>("agent_thread_list", { root });
      setThreads(list);
      return list;
    } catch {
      return [];
    }
  }

  /** §31 打开(回放)某条历史线程到对话视图。仅用于非活动态回顾 —— 活动会话期间
   *  历史按钮被禁用,以免把活动的 persist 目标(threadIdRef)改到别的线程上污染。 */
  async function openThread(tid: number, agent: string) {
    setThreadListOpen(false);
    try {
      const rows = await invoke<Array<{ role: string; text: string; ts: number }>>(
        "agent_thread_load",
        { root, threadId: tid },
      );
      threadIdRef.current = tid;
      setActiveAgent(agent);
      setSessionInfo(null);
      setPerm(null);
      resetCtx();
      agentTextRef.current = "";
      toolsRef.current = new Map();
      setEntries(
        rows.map((r, i) =>
          r.role === "tool"
            ? { kind: "tool", tool: toolMsgToRecord(r.text, i) }
            : { kind: "msg", role: r.role as "user" | "agent" | "error", text: r.text },
        ),
      );
    } catch {
      /* 静默 */
    }
  }

  /** §31 回到 picker 开新会话(清掉历史回放态)。 */
  function startNewConversation() {
    setEntries([]);
    setActiveAgent(null);
    setSessionInfo(null);
    setPerm(null);
    resetCtx();
    threadIdRef.current = null;
    setThreadListOpen(false);
  }

  /** §31 删除一条历史线程及其消息;删的若正是当前在看的那条,则回到 picker。 */
  async function deleteThread(tid: number) {
    if (!window.confirm(t("agent.deleteThreadConfirm"))) return;
    try {
      await invoke("agent_thread_delete", { root, threadId: tid });
      await refreshThreads();
      if (threadIdRef.current === tid) {
        setEntries([]);
        setActiveAgent(null);
        threadIdRef.current = null;
      }
    } catch {
      /* 静默 */
    }
  }

  // 活动时订阅事件。
  useEffect(() => {
    if (!active) return;
    const unlistens: UnlistenFn[] = [];
    let cancelled = false;
    (async () => {
      const subs: Array<[string, (e: { payload: unknown }) => void]> = [
        [
          "agent-update",
          (e) => {
            const p = parseSessionUpdate(e.payload);
            if (p.kind === "agent_text") {
              agentTextRef.current += p.text;
              setEntries((prev) => {
                if (prev.length && prev[prev.length - 1].kind === "msg" &&
                    (prev[prev.length - 1] as { role: string }).role === "agent") {
                  const cp = [...prev];
                  const last = cp[cp.length - 1] as Extract<Entry, { kind: "msg" }> & {
                    role: "agent";
                  };
                  cp[cp.length - 1] = { kind: "msg", role: "agent", text: last.text + p.text };
                  return cp;
                }
                return [...prev, { kind: "msg", role: "agent", text: p.text }];
              });
            } else if (p.kind === "tool_new") {
              toolsRef.current.set(p.rec.id, p.rec);
              setEntries((prev) => [...prev, { kind: "tool", tool: p.rec }]);
            } else if (p.kind === "tool_patch") {
              const ex = toolsRef.current.get(p.id);
              if (ex) {
                const merged = { ...ex, ...p.patch };
                toolsRef.current.set(p.id, merged);
                if (merged.status === "completed" || merged.status === "failed") {
                  persist("tool", `${merged.title} · ${merged.status}`);
                }
                setEntries((prev) =>
                  prev.map((en) =>
                    en.kind === "tool" && en.tool.id === p.id
                      ? { kind: "tool", tool: merged }
                      : en,
                  ),
                );
              }
            } else if (p.kind === "usage") {
              setUsage({ used: p.used, size: p.size });
            }
            // 其余(available_commands / plan …)静默丢弃。
          },
        ],
        [
          "agent-permission",
          (e) => {
            const pl = e.payload as PermPayload;
            // 非高危才考虑自动放行(高危恒逐次问)。
            const safe = !pl.highRisk && !isHighRisk(pl.tool_call);
            // §5 第二档:白名单命中同类 → 自动放行(不弹卡)。
            const wlHit =
              safe && !!pl.kind && whitelistRef.current.includes(pl.kind);
            // §5 第一档:permissive 模式下非高危也自动放行。
            if (wlHit || (permModeRef.current === "permissive" && safe)) {
              // 自动放行:在对话流插一条轻量提示行(hover 看为什么放行),再回复。
              const title =
                (pl.tool_call as { title?: string } | null)?.title ?? "";
              setEntries((prev) => [
                ...prev,
                {
                  kind: "autoApprove",
                  title,
                  slug: pl.kind ?? null,
                  via: wlHit ? "whitelist" : "permissive",
                },
              ]);
              void invoke("agent_permission_respond", { id: pl.id, approve: true });
              return;
            }
            setAlwaysAllow(false);
            setPerm(pl);
          },
        ],
        [
          "agent-file-write",
          (e) => {
            // §4 标注层:每次 fs 写即时刷新 git 活动面板(边写边现);
            // payload 含 {path,writer,added,removed,created} 供后续转录/工具卡细化。
            void e.payload;
            setActivityTick((n) => n + 1);
          },
        ],
        [
          "agent-session-info",
          (e) => {
            // §2.3:会话建立后 agent 声明的 modes / config_options(下拉数据源)。
            setSessionInfo(e.payload as SessionInfo);
          },
        ],
        [
          "agent-done",
          () => {
            // 取消那轮的 done 到达 → 清除取消中标志(兜底超时不再强制复位)。
            stoppingRef.current = false;
            persist("agent", agentTextRef.current);
            agentTextRef.current = "";
            setBusy(false);
            setActivityTick((n) => n + 1);
            // 排队消息:轮到就发。**副作用绝不能放进 setQueued 的 updater**——StrictMode
            // 会双调 updater,排队消息会发两遍。这里读 ref、先清再发(updater 之外)。
            // alreadyShown=false:排队时只存了 state,没入消息流——发出时才展示 + 落库,
            // 否则这轮 user 消息在对话里凭空消失、历史里也查不到。
            const q = queuedRef.current;
            if (q) {
              setQueued(null);
              void doSend(q);
            }
          },
        ],
        [
          "agent-error",
          (e) => {
            const msg = String(e.payload);
            setError(msg);
            setEntries((prev) => [...prev, { kind: "msg", role: "error", text: msg }]);
            persist("error", msg);
            agentTextRef.current = "";
            // 错误也终结「取消中」:不清的话兜底定时器会在 15s 后误复位新一轮的 busy。
            clearStopping();
            setBusy(false);
          },
        ],
      ];
      for (const [name, fn] of subs) {
        if (cancelled) break;
        unlistens.push(await listen(name, fn));
      }
      // 回捞会话信息:agent-session-info 事件在 agent_start 返回**前**发射,彼时
      // 订阅未就位 → 必丢(模型选择器/模式下拉没数据源的根因)。后端已缓存,补齐。
      if (!cancelled) {
        try {
          const info = await invoke<SessionInfo | null>("agent_session_info");
          if (info && !cancelled) setSessionInfo(info);
        } catch {
          /* 无活动会话或命令失败:忽略 */
        }
      }
    })();
    return () => {
      cancelled = true;
      unlistens.forEach((u) => u());
      // 会话切换 / 卸载:撤销未落地的取消兜底定时器(防 setState 泄漏到下一会话)。
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      stoppingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function startAgent(a: AgentInfo) {
    setError(null);
    setConnectingAgentId(a.id);
    try {
      // 骨干(§2.4):每个 agent 起一个新线程,线程与 agent 绑定。
      const tid = await invoke<number>("agent_thread_create", { root, agent: a.id });
      threadIdRef.current = tid;
      setActiveAgent(a.id);
      agentTextRef.current = "";
      toolsRef.current = new Map();
      setEntries([]);
      setSessionInfo(null);
      resetCtx();
      await invoke<string>("agent_start", {
        root,
        command: a.command,
        agentId: a.id,
      });
      // §4 把持久化的即时提交偏好同步到新线程(默认 off)。
      void invoke("agent_set_instant_commit", {
        on: instantCommitRef.current,
      }).catch(() => {});
      setActive(true);
      setThreadListOpen(false);
      void refreshThreads();
    } catch (e) {
      setError(String(e));
    } finally {
      setConnectingAgentId(null);
    }
  }

  /** § 取消当前生成(Stop 按钮):发 ACP session/cancel,会话**保持存活**——区别于
   *  closeAgent(终结会话、回 picker)。故这里不动 active / activeAgent,输入框保留,
   *  用户可立即再发。
   *
   *  不立即 setBusy(false):被取消的那轮 prompt 在 agent 应答后仍会 emit 一次 agent-done,
   *  由它复位 busy(并触发期间排队的下一条)。若这里抢先 setBusy(false),用户在 done 到达
   *  前重发,旧 done 会把 busy 错误复位 → 竞态。期间 busy 仍为 true,再点发送进队列(正确)。
   *  兜底:agent 若不理会 cancel(挂死),15s 后强制复位,避免永远转圈。 */
  async function stopAgent() {
    stoppingRef.current = true;
    setPerm(null);
    try {
      await invoke("agent_cancel");
    } catch {
      /* ignore:会话可能已结束;agent_alive 轮询会复位 active */
    }
    // 兜底定时器:agent 不理会 cancel 时 15s 强制复位。先清旧(连点 Stop 只留一个),
    // 句柄入 ref,供 doSend / agent-error / 存活轮询 / closeAgent 清除,防误复位新 prompt。
    if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      if (stoppingRef.current) {
        stoppingRef.current = false;
        setBusy(false);
      }
    }, 15000);
  }

  /** 结束「取消中」状态并撤销兜底定时器——凡走 stopAgent 之外的路径复位 busy 时调用。 */
  function clearStopping() {
    stoppingRef.current = false;
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  /** 复位 composer 的 @-context 附加态。附哪些笔记是用户针对「当前这场对话」的临时
   *  意图——换 agent / 开新会话 / 关会话 / 回放历史时必须清零,绝不能把给 A 勾选的
   *  上下文静默带给 B(用户实测反馈:切换 agent 后附的上下文被转移过去,不对)。 */
  function resetCtx() {
    setCtxActive(false);
    setCtxSelected([]);
    setCtxCandidates([]);
    setCtxPickerOpen(false);
    setCtxRingOpen(false);
  }

  /** §3 关闭当前会话(类比 Cursor 关 tab):停子进程 + 回到 picker(清空当前视图)。
   *  对话历史仍在转录库,经「历史会话」可再回看;这是「结束并收起」,不是删除。 */
  async function closeAgent() {
    try {
      await invoke("agent_stop");
    } catch {
      /* ignore */
    }
    setActive(false);
    setActiveAgent(null);
    clearStopping();
    setBusy(false);
    setPerm(null);
    setQueued(null);
    setSessionInfo(null);
    resetCtx();
    setEntries([]);
    agentTextRef.current = "";
    toolsRef.current = new Map();
    threadIdRef.current = null;
    setThreadListOpen(false);
  }

  /** 实际发送(内部)。`alreadyShown` = 文本已作为气泡展示/落库(移交 seed 场景)。 */
  async function doSend(text: string, alreadyShown = false) {
    if (!text || !threadIdRef.current) return;
    // 新一轮 prompt开始:上一轮的「取消中」状态作废,清掉兜底定时器,防其误复位本轮 busy。
    clearStopping();
    setBusy(true);
    setError(null);
    if (!alreadyShown) {
      setEntries((prev) => [...prev, { kind: "msg", role: "user", text }]);
      persist("user", text);
    }
    agentTextRef.current = "";
    // @-context:发送时附当前笔记 + 勾选的邻居正文(§25 选择器)。
    let full = text;
    if (ctxActive && getAiContext) {
      try {
        const ctx = await getAiContext(ctxSelected);
        if (ctx) full = `${ctx}\n\n---\n\n${text}`;
      } catch {
        /* 附不上就发原文 */
      }
    }
    try {
      await invoke("agent_prompt", { text: full });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  /** 用户点发送:idle → 发;busy → 排队(Queue 态)。 */
  function send() {
    const text = input.trim();
    if (!text) return;
    if (busy) {
      setQueued(text);
      setInput("");
      return;
    }
    setInput("");
    void doSend(text);
  }

  function respondPermission(approve: boolean) {
    if (!perm) return;
    const id = perm.id;
    // 勾「始终允许此类」+ 批准 + 有可白名单的 kind + 非高危 → 记入白名单。
    if (
      approve &&
      alwaysAllow &&
      perm.kind &&
      !perm.highRisk &&
      !isHighRisk(perm.tool_call) &&
      !whitelist.includes(perm.kind)
    ) {
      setWhitelist([...whitelist, perm.kind]);
    }
    setAlwaysAllow(false);
    setPerm(null);
    void invoke("agent_permission_respond", { id, approve });
  }

  /** Model C 显式移交(§2.4):把当前线程归一化为 seed,作为新 agent 新线程的首条 user 消息。 */
  async function handoffTo(target: AgentInfo) {
    setHandoffOpen(false);
    const fromAgent = activeAgent ?? "";
    const curMsgs = entriesToMsgs(entries);
    // vault 上下文只在用户**明确开了 @-附上下文**时才随 seed 带走,且只带勾选的子集。
    // 绝不在移交时静默附全量上下文(用户反馈:切换 agent 时附的上下文被转移过去,不对)。
    let vaultCtx = "";
    if (ctxActive && getAiContext) {
      try {
        vaultCtx = (await getAiContext(ctxSelected)) ?? "";
      } catch {
        /* ignore */
      }
    }
    const seed = normalizeForHandoff(curMsgs, fromAgent, vaultCtx);
    // @-context 是针对「这场对话 / 这个 agent」的临时意图,移交即换 agent → 清零。
    resetCtx();
    // 停当前 agent(线程内容已捕获)。
    try {
      await invoke("agent_stop");
    } catch {
      /* ignore */
    }
    clearStopping();
    setBusy(false);
    setPerm(null);
    setConnectingAgentId(target.id);
    try {
      const tid = await invoke<number>("agent_thread_create", { root, agent: target.id });
      threadIdRef.current = tid;
      setActiveAgent(target.id);
      agentTextRef.current = "";
      toolsRef.current = new Map();
      // seed = 新线程首条 user 消息(展示 + 落库)。
      setEntries([{ kind: "msg", role: "user", text: seed }]);
      persist("user", seed);
      await invoke<string>("agent_start", {
        root,
        command: target.command,
        agentId: target.id,
      });
      void invoke("agent_set_instant_commit", {
        on: instantCommitRef.current,
      }).catch(() => {});
      setActive(true);
      void refreshThreads();
      setConnectingAgentId(null);
      setBusy(true);
      // 把 seed 作为 prompt 发给目标 agent(让它承接上下文)。
      try {
        await invoke("agent_prompt", { text: seed });
      } catch (e) {
        setError(String(e));
        setBusy(false);
      }
    } catch (e) {
      setError(String(e));
      setConnectingAgentId(null);
    }
  }

  const installed = agents.filter((a) => a.installed);
  const handoffTargets = installed.filter((a) => a.id !== activeAgent);
  // 单一动作槽:Stop > Queue > Send。**busy 优先于 queued**——排队了消息也得能随时停
  // 当前生成(旧优先级 queued 在前,排了队 Stop 就被顶掉、够不着了)。busy && queued 时
  // 「取消排队」降级为输入区里的辅助小按钮,两个动作都可达。
  const slot: { label: string; icon: typeof PaperPlaneTilt; action: () => void; disabled: boolean } =
    busy
      ? { label: t("agent.stop"), icon: StopCircle, action: () => void stopAgent(), disabled: false }
      : queued
        ? { label: t("agent.queue"), icon: Stack, action: () => setQueued(null), disabled: false }
        : { label: t("agent.send"), icon: PaperPlaneTilt, action: send, disabled: !input.trim() };

  /**
   * 统一的「模型切换」派生(Cursor 式模型选择器,放在 @ pill 右侧):
   * - **优先** config_options 里 category=model 的下拉(ACP 标准路径,经
   *   agent_set_config_option 切换)——opencode / claude 都走这条;注意 opencode
   *   的 session/new **同时**带私有 models 字段,若不优先 configOption 会被误导
   *   set_model(cursor 私有扩展)路径而切换失败。
   * - 无 model configOption 时(cursor)回落 session/new 私有 models 字段 →
   *   agent_set_model(扩展 session/set_model)。
   * 切换后本地乐观更新当前值(adapter 不发变更通知)。
   */
  const modelSel = (() => {
    if (!sessionInfo) return null;
    const opt = (sessionInfo.configOptions ?? []).find(
      (c) =>
        c.type === "select" &&
        (c.category === "model" || c.id === "model") &&
        (c.options?.length ?? 0) > 0,
    );
    if (opt) return { kind: "config" as const, opt };
    const m = sessionInfo.models;
    if (m && m.available.length > 0) return { kind: "models" as const };
    return null;
  })();
  /** 模型列表 + 当前值/显示名(两种来源归一)。 */
  const modelList: Array<{ id: string; name: string }> =
    modelSel?.kind === "config"
      ? (modelSel.opt.options ?? []).map((o) => ({ id: o.value, name: o.name }))
      : modelSel?.kind === "models"
        ? (sessionInfo?.models?.available ?? []).map((m) => ({
            id: m.modelId,
            name: m.name,
          }))
        : [];
  const modelCur =
    modelSel?.kind === "models"
      ? sessionInfo?.models?.current ?? ""
      : modelSel?.kind === "config"
        ? String(modelSel.opt.currentValue ?? "")
        : "";
  const modelCurName =
    modelList.find((m) => m.id === modelCur)?.name ??
    (modelSel?.kind === "models"
      ? sessionInfo?.models?.currentName ?? modelCur
      : modelCur);
  /** 模式下拉(顶部 SessionControls 已删,统一到 composer):数据源归一同 modelSel——
   *  优先标准 configOption(category=mode),无则回落 modes 字段(agent_set_mode)。
   *  claude / opencode 两源并存时只渲染这一个,杜绝重复。 */
  const modeSel = (() => {
    if (!sessionInfo) return null;
    const opt = (sessionInfo.configOptions ?? []).find(
      (c) =>
        c.type === "select" &&
        (c.category === "mode" || c.id === "mode") &&
        (c.options?.length ?? 0) > 0,
    );
    if (opt) return { kind: "config" as const, opt };
    const m = sessionInfo.modes;
    if (m && m.available.length > 1) return { kind: "modes" as const, m };
    return null;
  })();
  const modeList: Array<{ id: string; name: string }> =
    modeSel?.kind === "config"
      ? (modeSel.opt.options ?? []).map((o) => ({ id: o.value, name: o.name }))
      : modeSel?.kind === "modes"
        ? modeSel.m.available.map((m) => ({ id: m.id, name: m.name }))
        : [];
  const modeCur =
    modeSel?.kind === "config"
      ? String(modeSel.opt.currentValue ?? "")
      : modeSel?.kind === "modes"
        ? modeSel.m.current
        : "";
  const modeCurName = modeList.find((m) => m.id === modeCur)?.name ?? modeCur;

  /** select 型 configOption 切换(model / mode 共用)+ 乐观回显。 */
  const setConfigOption = (cid: string, value: string) => {
    void (async () => {
      try {
        await invoke("agent_set_config_option", {
          configId: cid,
          kind: "select",
          valueStr: value,
          valueBool: null,
        });
        setSessionInfo((prev) =>
          prev
            ? {
                ...prev,
                configOptions: (prev.configOptions ?? []).map((c) =>
                  c.id === cid ? { ...c, currentValue: value } : c,
                ),
              }
            : prev,
        );
      } catch (e) {
        setError(String(e));
      }
    })();
  };

  const setMode = (modeId: string) => {
    if (!modeSel) return;
    if (modeSel.kind === "config") {
      setConfigOption(modeSel.opt.id, modeId);
      return;
    }
    void (async () => {
      try {
        await invoke("agent_set_mode", { modeId });
        setSessionInfo((prev) =>
          prev && prev.modes
            ? { ...prev, modes: { ...prev.modes, current: modeId } }
            : prev,
        );
      } catch (e) {
        setError(String(e));
      }
    })();
  };

  const setModel = (modelId: string) => {
    if (!modelSel) return;
    void (async () => {
      try {
        if (modelSel.kind === "models") {
          await invoke("agent_set_model", { modelId });
          setSessionInfo((prev) =>
            prev && prev.models
              ? {
                  ...prev,
                  models: {
                    ...prev.models,
                    current: modelId,
                    currentName:
                      prev.models.available.find((m) => m.modelId === modelId)
                        ?.name ?? prev.models.currentName,
                  },
                }
              : prev,
          );
        } else {
          setConfigOption(modelSel.opt.id, modelId);
        }
      } catch (e) {
        setError(String(e));
      }
    })();
  };

  /** 上下文用量百分比(供 composer 内的上下文环使用;顶部进度条已移除)。 */
  const ctxPct =
    usage && usage.size > 0
      ? Math.min(100, (usage.used / usage.size) * 100)
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      {/* 头部:右栏已提为全高,此表头与顶栏齐高,兼作透明标题栏拖拽区。 */}
      <div data-drag-region className="flex h-9 shrink-0 items-center gap-1.5 border-b border-crust px-2.5 text-[12px] font-medium text-text">
        <Robot size={14} weight="fill" className="text-blue" />
        <span>{t("agent.title")}</span>
        {active && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-green">
            <PlugsConnected size={11} weight="fill" />
            {t("agent.active")}
          </span>
        )}
        {/* §31 历史会话:仅非活动时可切,避免把活动 persist 目标(threadIdRef)改到别线程。 */}
        <div className={cn("relative", active ? "" : "ml-auto")}>
          <HoverPop
            align="right"
            hide={threadListOpen}
            text={active ? t("agent.historyDisabled") : t("agent.historyTip")}
          >
          <button
            onClick={async () => {
              await refreshThreads();
              setThreadListOpen((v) => !v);
            }}
            disabled={active}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-overlay hover:bg-surface",
              active && "cursor-not-allowed opacity-30",
            )}
          >
            <ClockCounterClockwise size={12} />
            {threads.length > 0 && (
              <span className="text-[10px]">{threads.length}</span>
            )}
          </button>
          </HoverPop>
          {threadListOpen && !active && (
            <div className="absolute right-0 top-7 z-40 max-h-72 w-64 overflow-auto rounded border border-crust bg-mantle py-0.5 shadow-lg">
              {threads.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-overlay">
                  {t("agent.noThreads")}
                </div>
              ) : (
                threads.map((th) => (
                  <div key={th.id} className="group flex items-center">
                    <button
                      onClick={() => void openThread(th.id, th.agent)}
                      className={cn(
                        "flex flex-1 flex-col items-start px-2 py-1 text-left hover:bg-surface",
                        th.id === threadIdRef.current && "bg-surface",
                      )}
                    >
                      <span className="flex w-full items-center gap-1.5">
                        <AgentIcon id={th.agent} size={14} />
                        <span className="truncate font-medium text-text">
                          {agents.find((a) => a.id === th.agent)?.label ?? th.agent}
                        </span>
                        <span className="ml-auto shrink-0 text-[9px] text-overlay">
                          {relTime(th.last_ts)}
                        </span>
                      </span>
                      <span className="text-[9px] text-overlay">
                        {t("agent.msgs", { n: th.msg_count })}
                      </span>
                    </button>
                    <button
                      onClick={() => void deleteThread(th.id)}
                      className="shrink-0 px-1.5 text-overlay opacity-0 hover:text-red group-hover:opacity-100"
                      title={t("agent.deleteThread")}
                    >
                      <Trash size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {error && <ErrorBanner text={error} t={t} />}

      {/* 主体 */}
      {!active && entries.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-[12px] leading-relaxed text-overlay">
            {t("agent.intro")}
          </p>
          {/* 外部 MCP 记忆接入入口(与右侧「应用内 Agent」并列引导,避免只藏在设置深处)。 */}
          {onOpenMemoryOnboard && !ipc.isMock() && (
            <div
              className="mb-3 rounded-lg border border-blue/30 bg-blue/5 px-2.5 py-2"
              data-testid="agent-memory-banner"
            >
              <p className="text-[11px] leading-snug text-subtext">
                {t("agent.memoryBanner")}
              </p>
              <button
                type="button"
                onClick={onOpenMemoryOnboard}
                className="mt-1.5 inline-flex items-center gap-1 rounded bg-blue px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
              >
                <PlugsConnected size={12} weight="bold" />
                {t("agent.memoryBannerBtn")}
              </button>
            </div>
          )}
          {/* 权限模式切换只在活动会话的 composer 里(§5);此处不再重复。 */}
          <div className="flex flex-col gap-1.5">
            {installed.length === 0 && (
              <div className="rounded border border-crust bg-mantle p-3 text-[12px] text-overlay">
                {t("agent.noAgent")}
              </div>
            )}
            {agents.map((a) => (
              <button
                key={a.id}
                disabled={!a.installed || connectingAgentId !== null}
                onClick={() => void startAgent(a)}
                title={a.installed ? undefined : a.installHint}
                className={cn(
                  "flex items-center gap-2.5 rounded border px-2.5 py-2 text-left text-[12px]",
                  a.installed
                    ? "border-crust bg-mantle text-text hover:bg-surface"
                    : "border-crust bg-mantle/50 text-overlay opacity-50",
                  "disabled:cursor-wait",
                )}
              >
                <AgentIcon id={a.id} size={22} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1">
                    <span className="font-medium">{a.label}</span>
                    {a.installed ? (
                      <span className="ml-auto text-[10px] text-green">
                        {connectingAgentId === a.id
                          ? t("agent.connecting")
                          : t("agent.ready")}
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] text-overlay">
                        {t("agent.notInstalled")}
                      </span>
                    )}
                  </span>
                  {/* §9.3:未安装时直接给安装指引(Node 缺失时含「先装 Node」),不只报未安装。 */}
                  {!a.installed && (
                    <span className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[10px] leading-tight text-overlay">
                      {a.installHint}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 当前 agent + 移交入口(移交仅在活动会话可用)+ 关闭(×)。 */}
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-crust px-2.5 text-[11px]">
            {activeAgent && <AgentIcon id={activeAgent} size={16} />}
            <span className="font-medium text-text">
              {agents.find((a) => a.id === activeAgent)?.label ?? activeAgent}
            </span>
            {!active && (
              <span className="text-[10px] text-overlay">
                · {t("agent.viewingHistory")}
              </span>
            )}
            {active && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setHandoffOpen((v) => !v)}
                  disabled={handoffTargets.length === 0}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-overlay hover:bg-surface disabled:opacity-30"
                >
                  <ArrowsLeftRight size={12} />
                  {t("agent.handoff")}
                </button>
                {handoffOpen && handoffTargets.length > 0 && (
                  <div className="absolute right-0 top-7 z-40 w-36 rounded border border-crust bg-mantle py-0.5 shadow-lg">
                    {handoffTargets.map((tg) => (
                      <button
                        key={tg.id}
                        onClick={() => void handoffTo(tg)}
                        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] text-text hover:bg-surface"
                      >
                        <AgentIcon id={tg.id} size={14} />
                        <span>
                          {t("agent.handoffTo")} {tg.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* §3 关闭会话(×):停子进程 + 回到 picker;历史仍留存可再开。 */}
            <button
              onClick={() => void closeAgent()}
              title={t("agent.close")}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-overlay hover:bg-surface hover:text-text",
                !active && "ml-auto",
              )}
            >
              <X size={12} weight="bold" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-2.5">
            <div className="flex flex-col gap-2">
              {entries.map((e, i) =>
                e.kind === "tool" ? (
                  <ToolCard key={`t-${e.tool.id}-${i}`} rec={e.tool} />
                ) : e.kind === "autoApprove" ? (
                  <AutoApproveChip
                    key={`a-${i}`}
                    title={e.title}
                    slug={e.slug}
                    via={e.via}
                    t={t}
                  />
                ) : (
                  <Bubble key={`m-${i}`} role={e.role} text={e.text} />
                ),
              )}
              {busy && (
                <WorkingBubble
                  t={t}
                  title={(() => {
                    // 最近一个 in_progress 工具即为「正在执行」;没有则处于纯思考(生成文本)。
                    for (let i = entries.length - 1; i >= 0; i--) {
                      const e = entries[i];
                      if (e.kind === "tool" && e.tool.status === "in_progress")
                        return e.tool.title;
                    }
                    return undefined;
                  })()}
                />
              )}
            </div>
          </div>

          {perm && (
            <div className="shrink-0 border-t border-crust bg-mantle p-2.5">
              <div className="mb-1.5 text-[11px] font-medium text-text">
                {(perm.highRisk || isHighRisk(perm.tool_call)) && (
                  <span className="mr-1 text-red">⚠ {t("agent.highRisk")} </span>
                )}
                {t("agent.permissionRequest")}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => respondPermission(true)}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-green/90 px-2 py-1.5 text-[11px] font-medium text-crust hover:opacity-90"
                >
                  <Check size={12} weight="bold" />
                  {t("agent.approve")}
                </button>
                <button
                  onClick={() => respondPermission(false)}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-surface px-2 py-1.5 text-[11px] font-medium text-text hover:bg-crust"
                >
                  <X size={12} weight="bold" />
                  {t("agent.deny")}
                </button>
              </div>
              {/* §5 第二档:非高危且有白名单 kind 时,可勾「始终允许此类」。 */}
              {perm.kind &&
                !perm.highRisk &&
                !isHighRisk(perm.tool_call) && (
                  <label className="mt-1.5 flex cursor-pointer items-center gap-1 text-[10px] text-overlay">
                    <input
                      type="checkbox"
                      checked={alwaysAllow}
                      onChange={(e) => setAlwaysAllow(e.target.checked)}
                      className="h-3 w-3 accent-green"
                    />
                    {t("agent.alwaysAllowKind", { kind: perm.kind })}
                  </label>
                )}
              {/* 白名单管理:已记住的同类,点 × 撤销(恢复逐次问)。 */}
              {whitelist.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-overlay">
                    {t("agent.whitelist")}:
                  </span>
                  {whitelist.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-0.5 rounded bg-mantle px-1 py-0.5 text-[10px] text-text"
                    >
                      {k}
                      <button
                        onClick={() =>
                          setWhitelist(whitelist.filter((x) => x !== k))
                        }
                        className="text-overlay hover:text-red"
                        title={t("agent.revokeKind", { kind: k })}
                      >
                        <X size={9} weight="bold" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* git 归因活动面板(§4):仅活动会话显示;历史回顾为只读对话,不挂活动面板。 */}
          {active && activeAgent && (
            <AgentActivity
              root={root}
              agentId={activeAgent}
              refreshKey={activityTick}
              t={t}
            />
          )}

          {/* Composer(仅活动会话);历史回顾时换成「开启新会话」入口。 */}
          {active ? (
          <div className="shrink-0 border-t border-crust p-2">
            {/* §2.3 模式/模型下移到 composer(Cursor 式 MiniSelect),顶部只留上下文
                用量条;左:@ → 模式 → 模型,右:上下文环 → 权限 → 提交。
                effort / thought_level 等剩余 select 配置不再渲染(用户:不常用)。 */}
            <div className="mb-1 flex items-center gap-1">
              {getAiContext && (
                <div className="relative flex items-center">
                  <HoverPop text={t("agent.atContextTip")} hide={ctxPickerOpen}>
                  <button
                    onClick={async () => {
                      // 每次开 picker 都重取候选(应对切换笔记后的陈旧);
                      // 已激活则保留既有勾选与候选的交集,未激活则默认全选邻居。
                      if (getContextCandidates) {
                        try {
                          const cands = await getContextCandidates();
                          setCtxCandidates(cands);
                          const paths = new Set(cands.map((c) => c.path));
                          setCtxSelected((prev) => {
                            if (!ctxActive) {
                              return cands
                                .filter((c) => !c.isCurrent)
                                .map((c) => c.path);
                            }
                            return prev.filter((p) => paths.has(p));
                          });
                        } catch {
                          /* 取不到候选就空列表,picker 仍可开 */
                        }
                      }
                      setCtxActive(true);
                      setCtxPickerOpen((v) => !v);
                    }}
                    className={cn(
                      "flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]",
                      ctxActive
                        ? "bg-blue/20 text-blue"
                        : "bg-mantle text-overlay hover:bg-surface",
                    )}
                  >
                    <At size={12} weight="bold" />
                    {ctxActive && (
                      <span className="text-[9px] opacity-80">
                        {1 + ctxSelected.length}
                      </span>
                    )}
                  </button>
                  </HoverPop>
                  {/* 取消附上下文(修「没法取消」):点药丸本身只是开/关 picker 且恒保持
                      激活,唯一取消途径曾藏在 picker 底部。现激活时药丸旁给一个显式 ×,
                      一键取消激活并清空勾选。 */}
                  {ctxActive && (
                    <button
                      onClick={() => {
                        setCtxActive(false);
                        setCtxSelected([]);
                        setCtxPickerOpen(false);
                      }}
                      title={t("agent.atContextCancel")}
                      className="flex h-[18px] w-4 items-center justify-center rounded text-overlay hover:bg-surface hover:text-red"
                    >
                      <X size={9} weight="bold" />
                    </button>
                  )}
                  {ctxPickerOpen && (
                    <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-60 overflow-auto rounded border border-crust bg-mantle p-1.5 shadow-lg">
                      <div className="mb-1 text-[10px] font-medium text-overlay">
                        {t("agent.atContextPickerTitle")}
                      </div>
                      {ctxCandidates.length === 0 && (
                        <div className="px-1 py-1 text-[10px] text-overlay">
                          {t("agent.atContextEmpty")}
                        </div>
                      )}
                      {ctxCandidates.map((c) => {
                        const checked = c.isCurrent || ctxSelected.includes(c.path);
                        return (
                          <label
                            key={c.path}
                            className={cn(
                              "flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[11px] text-text hover:bg-surface",
                              c.isCurrent && "opacity-60",
                            )}
                            title={c.path}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={c.isCurrent}
                              onChange={(e) => {
                                setCtxSelected((prev) =>
                                  e.target.checked
                                    ? Array.from(new Set([...prev, c.path]))
                                    : prev.filter((p) => p !== c.path),
                                );
                              }}
                              className="h-3 w-3 accent-blue"
                            />
                            <span className="truncate">{c.title}</span>
                            {c.isCurrent && (
                              <span className="ml-auto text-[9px] text-overlay">
                                {t("agent.atContextCurrent")}
                              </span>
                            )}
                          </label>
                        );
                      })}
                      <div className="mt-1 flex justify-between border-t border-crust pt-1">
                        <button
                          onClick={() => {
                            setCtxActive(false);
                            setCtxPickerOpen(false);
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] text-overlay hover:text-red"
                        >
                          {t("agent.atContextOff")}
                        </button>
                        <button
                          onClick={() => setCtxPickerOpen(false)}
                          className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text hover:bg-crust"
                        >
                          {t("agent.done")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* 模式(Cursor 式裸文本按钮):@ 与模型之间。claude / opencode 的
                  mode 双源(modes 字段 + category=mode configOption)归一为这一个。 */}
              {modeSel && modeList.length > 0 && (
                <MiniSelect
                  cur={modeCur}
                  curName={modeCurName}
                  options={modeList}
                  onPick={setMode}
                />
              )}
              {/* 模型(带边框定宽):configOption 优先,无则 cursor 私有 models。 */}
              {modelSel && modelList.length > 0 && (
                <MiniSelect
                  boxed
                  cur={modelCur}
                  curName={modelCurName}
                  options={modelList}
                  onPick={setModel}
                  hoverText={t("agent.modelTip")}
                />
              )}
              <div className="ml-auto flex items-center gap-1">
              {/* 上下文环(仿 Cursor):进度环显示上下文窗口占用(>85% 转琥珀),
                  点击弹层给用量明细 + 「开启新对话」(= Cursor 的 Start new chat)。 */}
              <div ref={ctxRingRef} className="relative">
                <button
                  onClick={() => setCtxRingOpen((v) => !v)}
                  title={t("agent.ctxRing")}
                  className="flex items-center justify-center rounded p-0.5 text-overlay hover:bg-surface hover:text-text"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      fill="none"
                      strokeWidth="2"
                      className="stroke-crust"
                    />
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      fill="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={CTX_RING_C}
                      strokeDashoffset={CTX_RING_C * (1 - ctxPct / 100)}
                      transform="rotate(-90 8 8)"
                      className={
                        ctxPct > 85 ? "stroke-amber-500" : "stroke-blue"
                      }
                    />
                  </svg>
                </button>
                {ctxRingOpen && (
                  <div className="absolute bottom-full right-0 z-30 mb-1 w-52 rounded border border-crust bg-mantle p-2 shadow-lg">
                    <div className="mb-1 text-[10px] font-medium text-text">
                      {t("agent.ctxRing")}
                    </div>
                    {usage && usage.size > 0 ? (
                      <>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-crust">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              ctxPct > 85 ? "bg-amber-500" : "bg-blue",
                            )}
                            style={{ width: `${ctxPct}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[10px] tabular-nums text-overlay">
                          {t("agent.contextTokens", {
                            used: usage.used,
                            size: usage.size,
                          })}{" "}
                          · {Math.round(ctxPct)}%
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-overlay">
                        {t("agent.ctxRingEmpty")}
                      </div>
                    )}
                    {/* Cursor 环菜单的对应动作是 Start new chat:结束当前会话回 picker
                        (历史仍留存),即等效「开新对话清空上下文」。 */}
                    <button
                      onClick={() => {
                        setCtxRingOpen(false);
                        void closeAgent();
                      }}
                      className="mt-1.5 flex w-full items-center justify-center gap-1 rounded bg-surface px-1.5 py-1 text-[10px] text-text hover:bg-crust"
                    >
                      <Plus size={10} weight="bold" />
                      {t("agent.newConversation")}
                    </button>
                  </div>
                )}
              </div>
              <HoverPop
                align="right"
                lead={
                  permMode === "permissive"
                    ? t("agent.permissiveOn")
                    : t("agent.normalMode")
                }
                text={
                  permMode === "permissive"
                    ? t("agent.permissiveTip")
                    : t("agent.normalTip")
                }
              >
                <button
                  onClick={() =>
                    setPermMode(permMode === "normal" ? "permissive" : "normal")
                  }
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    permMode === "permissive"
                      ? "bg-blue/15 text-blue"
                      : "bg-mantle text-overlay hover:bg-surface",
                  )}
                >
                  {permMode === "permissive"
                    ? t("agent.permissiveOn")
                    : t("agent.normalMode")}
                </button>
              </HoverPop>
              {/* §4 即时提交模式开关(默认 off=隔离):on 时每轮写自动入 HEAD。 */}
              <HoverPop
                align="right"
                lead={
                  instantCommit
                    ? t("agent.instantCommitOn")
                    : t("agent.quarantine")
                }
                text={
                  instantCommit
                    ? t("agent.instantCommitTip")
                    : t("agent.quarantineTip")
                }
              >
                <button
                  onClick={() => {
                    const next = !instantCommit;
                    setInstantCommit(next);
                    void invoke("agent_set_instant_commit", { on: next }).catch(
                      () => {},
                    );
                  }}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    instantCommit
                      ? "bg-green/20 text-green"
                      : "bg-mantle text-overlay hover:bg-surface",
                  )}
                >
                  {instantCommit
                    ? t("agent.instantCommitOn")
                    : t("agent.quarantine")}
                </button>
              </HoverPop>
              </div>
            </div>
            <div className="flex items-end gap-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={t("agent.placeholder")}
                rows={2}
                className="min-h-[40px] flex-1 resize-none rounded border border-crust bg-mantle px-2 py-1.5 text-[12px] text-text outline-none placeholder:text-overlay focus:border-blue"
              />
              {/* busy && queued:Stop 是主动作,排队那条另给一个琥珀小按钮可撤。 */}
              {busy && queued && (
                <button
                  onClick={() => setQueued(null)}
                  title={t("agent.queue")}
                  className="flex h-[40px] w-9 shrink-0 items-center justify-center rounded bg-amber-500 text-crust hover:opacity-90"
                >
                  <Stack size={14} weight="fill" />
                </button>
              )}
              <button
                onClick={slot.action}
                disabled={slot.disabled}
                title={slot.label}
                className={cn(
                  "flex h-[40px] w-9 shrink-0 items-center justify-center rounded text-crust disabled:opacity-40 hover:opacity-90",
                  busy ? "bg-surface text-text hover:bg-crust" : queued ? "bg-amber-500" : "bg-blue",
                )}
              >
                <slot.icon size={14} weight="fill" />
              </button>
            </div>
          </div>
          ) : (
            <div className="shrink-0 border-t border-crust p-2">
              <button
                onClick={startNewConversation}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-blue px-2 py-1.5 text-[11px] font-medium text-crust hover:opacity-90"
              >
                <Plus size={12} weight="bold" />
                {t("agent.newConversation")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "agent" | "error"; text: string }) {
  if (role === "user") {
    return (
      <div className="self-end rounded-lg rounded-br-sm bg-blue/90 px-2.5 py-1.5 text-[12px] text-crust">
        <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
      </div>
    );
  }
  if (role === "error") {
    return (
      <div className="self-start rounded-lg border border-red/40 bg-red/10 px-2.5 py-1.5 text-[12px] text-red">
        <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
      </div>
    );
  }
  return (
    <div className="self-start rounded-lg rounded-bl-sm bg-mantle px-2.5 py-1.5 text-[12px] text-text">
      <pre className="whitespace-pre-wrap break-words font-sans">{text || "…"}</pre>
    </div>
  );
}

/** 连接/会话失败的富错误条:页面只显示「一句人话原因 + 可操作命令」。
 *  adapter 的原始输出(完整堆栈 / Cannot find module 等)**绝不渲染到页面**——
 *  切出来经 logger 收敛进日志文件(LogBus,见 diag-log / docs/12),页面只在需要时
 *  提供「复制详情」(复制到剪贴板,不显示)。这是 F-AGENT-ERR-QUIET 的落点。 */
function ErrorBanner({ text, t }: { text: string; t: TFunc }) {
  const cmdMatch = text.match(/^»\s*(.+)$/m);
  const cmd = cmdMatch?.[1].trim();
  // 分离「人话原因」与「adapter 原始日志」:后端以 `--- adapter 日志/log ---` 段分隔。
  // 中英两种标题都认。切出来的 rawLog 只落日志、不渲染。
  const SEP_RE = /\n*---\s*adapter\s+(?:日志|log)\s*---\s*\n?/i;
  const sepIdx = text.search(SEP_RE);
  let rawLog = "";
  let body = text;
  if (sepIdx >= 0) {
    body = text.slice(0, sepIdx);
    rawLog = text.slice(sepIdx).replace(SEP_RE, "").trim();
  }
  // 剥掉命令行(单独成行渲染 + 复制),并收紧多余空行。
  body = body.replace(/^»\s*.+$/m, "").replace(/\n{3,}/g, "\n\n").trim();
  // 原始详情落日志(副作用,仅 rawLog 变化时执行一次)。
  useEffect(() => {
    if (rawLog) log.error("agent", `adapter 连接失败详情:\n${rawLog}`);
  }, [rawLog]);
  const [copied, setCopied] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState(false);
  return (
    <div className="shrink-0 border-b border-red/40 bg-red/10 px-2.5 py-2 text-[11px] text-red">
      <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{body}</pre>
      {rawLog && (
        <p className="mt-1 text-[10px] text-red/70">{t("agent.detailInLog")}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {cmd && (
          <>
            <code className="min-w-0 flex-1 truncate rounded bg-base/50 px-1.5 py-0.5 font-mono text-[10px] text-text">
              » {cmd}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(cmd);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded bg-red/20 px-1.5 py-0.5 text-[10px] font-medium text-red hover:bg-red/30"
            >
              {copied ? t("agent.copied") : t("agent.copy")}
            </button>
          </>
        )}
        {rawLog && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(rawLog);
              setCopiedDetail(true);
              window.setTimeout(() => setCopiedDetail(false), 1500);
            }}
            className="shrink-0 rounded bg-red/20 px-1.5 py-0.5 text-[10px] font-medium text-red hover:bg-red/30"
          >
            {copiedDetail ? t("agent.copied") : t("agent.copyDetail")}
          </button>
        )}
      </div>
    </div>
  );
}

/** 自动放行的轻量提示行(插在对话流里):hover 显示为什么放行,缓解「静默执行」的不安。
 *  高危类永不被自动放行(后端不发 kind + 前端 isHighRisk 双保险)。 */
/** §4b WorkingBubble:busy 期间显示在消息流底部,模拟 Cursor 侧边栏的 thinking/working
 *  反馈——三个错峰跳动的点 + 当前阶段(纯思考生成文本 / 正在执行某工具)。 */
function WorkingBubble({ t, title }: { t: TFunc; title?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-overlay">
      <span className="flex gap-0.5" aria-hidden>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue [animation-delay:-0.32s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue [animation-delay:-0.16s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue" />
      </span>
      <span className="truncate">
        {title ? `${t("agent.working")} · ${title}` : t("agent.thinking")}
      </span>
    </div>
  );
}

function AutoApproveChip({
  title,
  slug,
  via,
  t,
}: {
  title: string;
  slug: string | null;
  via: "whitelist" | "permissive";
  t: TFunc;
}) {
  const tip =
    via === "whitelist"
      ? t("agent.autoApprovedWhitelist")
      : t("agent.autoApprovedPermissive");
  return (
    <div
      title={tip}
      className="flex items-center gap-1 self-start rounded bg-green/10 px-1.5 py-0.5 text-[10px] text-green"
    >
      <Check size={10} weight="bold" />
      <span>{t("agent.autoApproved")}</span>
      {title && (
        <span className="max-w-[180px] truncate text-overlay">· {title}</span>
      )}
      {slug && <span className="text-overlay">({slug})</span>}
    </div>
  );
}


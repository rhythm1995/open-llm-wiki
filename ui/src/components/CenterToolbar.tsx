/**
 * CenterToolbar —— 全宽顶栏,但对齐到下方四列(「每列各有表头」)。
 *
 * 不再是一条浮在顶上的统一工具条,而是按 nav/list/editor/props 四列切成表头单元,
 * 每个单元宽度与下方内容列一致、边界同为 border-r,故**分隔线从内容区一路贯穿到顶**。
 * 单元按列可见性条件渲染;编辑列(flex-1)常驻,其余随面板显隐。
 *
 * 各列表头内容:
 *   导航列: 仅 macOS 交通灯拖拽区(vault 名/新建/打开已移走)。
 *   列表列: vault 名(左)+ 新建笔记/画布/打开(右)——从原 Nav 头部迁来。
 *   编辑列: 视图图标 + ⌘K(左)/ 当前选择标签(中)/ 面板切换簇 + 后退前进(右)。
 *   属性列: 空拖拽区(Inspector 自带表头)。
 *
 * 交通灯(窗口左上角)始终属于「最左侧可见列」的表头:nav 在则归 nav,否则归 list,
 * 再否则归 editor。无 vault 时,编辑列表头展示「打开仓库」入口,保证可达。
 */
import {
  PencilSimple,
  Graph,
  GitBranch,
  SidebarSimple,
  TextAlignLeft,
  SquareHalf,
  ArrowLeft,
  ArrowRight,
  Plus,
  Rectangle,
  FolderPlus,
  FolderOpen,
  Robot,
} from "@phosphor-icons/react";
import type { MainView } from "./CommandPalette";
import type { TFunc } from "../lib/i18n";
import { cn } from "../lib/cn";
import { HoverPop } from "./HoverPop";

interface Props {
  view: MainView;
  onNavigate: (v: MainView) => void;
  onOpenPalette: () => void;
  t: TFunc;
  /** 编辑列居中标签:editor 视图取当前 Nav 选择;其余视图取视图名。App 端算好传入。 */
  contextLabel: string;
  /** 后退/前进可操作性(导航历史栈非空)。 */
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  /** 三面板可见性(Xcode 式切换簇的数据源)。 */
  navOpen: boolean;
  listOpen: boolean;
  propsOpen: boolean;
  /** 右栏当前是否停在 Agent tab(决定 Agent toggle 高亮)。 */
  agentOpen: boolean;
  onToggleNav: () => void;
  onToggleList: () => void;
  onToggleProps: () => void;
  onToggleAgent: () => void;
  /** 列表列是否随当前视图渲染(随 view + canvas 变)。 */
  showList: boolean;
  /** 两列宽度(B-COL-RESIZE):表头宽度须与下方内容列一致,分隔线贯穿。
      右栏已提为全高(App.tsx),其宽度由 App 自管,不在此对齐表头。 */
  navWidth: number;
  listWidth: number;
  /** 第二栏(列表表头)内容:vault 名 + 新建/打开。无 vault 时 vaultName=null。 */
  vaultName: string | null;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onOpenVault: () => void;
}

const VIEWS: {
  id: MainView;
  key: string;
  /** hover 解释泡文案键(比 key 更完整的功能说明)。 */
  tip: string;
  icon: typeof PencilSimple;
}[] = [
  { id: "editor", key: "view.editor", tip: "view.editorTip", icon: PencilSimple },
  { id: "graph", key: "view.graph", tip: "view.graphTip", icon: Graph },
  // 搜索/查询视图已移除:文档内查找用 ⌘F;快速打开笔记用 ⌘P;查询留待 agent(见 docs/04 F-QUERY)。
  { id: "git", key: "view.git", tip: "view.gitTip", icon: GitBranch },
];

/** macOS 交通灯拖拽区:挂在最左侧可见列表头的起点。 */
function TrafficLights() {
  return <div data-drag-region className="h-full w-[72px] shrink-0" />;
}

export function CenterToolbar({
  view,
  onNavigate,
  onOpenPalette,
  t,
  contextLabel,
  canBack,
  canForward,
  onBack,
  onForward,
  navOpen,
  listOpen,
  propsOpen,
  agentOpen,
  onToggleNav,
  onToggleList,
  onToggleProps,
  onToggleAgent,
  showList,
  navWidth,
  listWidth,
  vaultName,
  onNewNote,
  onNewCanvas,
  onOpenVault,
}: Props) {
  const hasVault = vaultName !== null;
  // 最左侧可见列:决定交通灯拖拽区挂在哪个表头。
  const navLeading = navOpen;
  const listLeading = !navOpen && showList;
  const editorLeading = !navOpen && !showList;

  // 面板显隐切换簇:图标本身已自解释(高亮=开),不加 hover 解释泡(用户反馈:多余)。
  const toggles = [
    {
      key: "toolbar.toggle.nav",
      icon: SidebarSimple,
      on: navOpen,
      onToggle: onToggleNav,
      testid: "toggle-nav",
    },
    {
      key: "toolbar.toggle.list",
      icon: TextAlignLeft,
      on: listOpen,
      onToggle: onToggleList,
      testid: "toggle-list",
    },
    {
      key: "toolbar.toggle.props",
      icon: SquareHalf,
      on: propsOpen,
      onToggle: onToggleProps,
      testid: "toggle-props",
    },
    {
      key: "toolbar.toggle.agent",
      icon: Robot,
      on: agentOpen,
      onToggle: onToggleAgent,
      testid: "toggle-agent",
    },
  ];

  return (
    <div data-testid="center-toolbar" className="flex h-9 shrink-0 items-stretch bg-mantle">
      {/* 导航列表头:vault 名/新建/打开已迁出,仅留交通灯拖拽区(若它最左)。 */}
      {navOpen && (
        <div
          className="flex shrink-0 items-center border-r border-crust"
          style={{ width: navWidth }}
        >
          {navLeading && <TrafficLights />}
          <div data-drag-region className="h-full flex-1" />
          {/* 后退/前进置于第一栏(导航列)右端(任务1:从编辑列右端迁来)。
              nav 列关闭时本表头不渲染 → 按钮暂随之隐藏(用 ⌘K 命令面板可达)。 */}
          <div className="flex items-center gap-0.5 pr-1">
            <HoverPop side="down" text={t("toolbar.backTip")}>
              <button
                onClick={onBack}
                disabled={!canBack}
                aria-label={t("toolbar.back")}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded text-overlay hover:bg-surface hover:text-text",
                  "disabled:pointer-events-none disabled:opacity-30",
                )}
              >
                <ArrowLeft size={15} />
              </button>
            </HoverPop>
            <HoverPop side="down" text={t("toolbar.forwardTip")}>
              <button
                onClick={onForward}
                disabled={!canForward}
                aria-label={t("toolbar.forward")}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded text-overlay hover:bg-surface hover:text-text",
                  "disabled:pointer-events-none disabled:opacity-30",
                )}
              >
                <ArrowRight size={15} />
              </button>
            </HoverPop>
          </div>
        </div>
      )}

      {/* 列表列表头:vault 名(左)+ 新建笔记/画布/打开 vault(右)。从 Nav 头部迁来。
          showList 已含 hasVault,故此处 vaultName 必非 null。 */}
      {showList && (
        <div
          data-drag-region
          className="flex shrink-0 items-center gap-1 border-r border-crust px-2"
          style={{ width: listWidth }}
        >
          {listLeading && <TrafficLights />}
          <FolderOpen size={14} weight="fill" className="shrink-0 text-blue" />
          <span
            className="min-w-0 flex-1 truncate text-[12px] font-medium text-text"
            title={vaultName ?? undefined}
          >
            {vaultName}
          </span>
          <HoverPop side="down" align="right" text={t("sidebar.newNoteTip")}>
            <button
              onClick={onNewNote}
              className="shrink-0 rounded p-1 text-subtext hover:bg-surface hover:text-text"
            >
              <Plus size={15} weight="bold" />
            </button>
          </HoverPop>
          <HoverPop side="down" align="right" text={t("sidebar.newCanvasTip")}>
            <button
              onClick={onNewCanvas}
              className="shrink-0 rounded p-1 text-subtext hover:bg-surface hover:text-text"
            >
              <Rectangle size={15} weight="bold" />
            </button>
          </HoverPop>
          <HoverPop side="down" align="right" text={t("sidebar.openVaultTip")}>
            <button
              onClick={onOpenVault}
              className="shrink-0 rounded p-1 text-subtext hover:bg-surface hover:text-text"
            >
              <FolderPlus size={15} />
            </button>
          </HoverPop>
        </div>
      )}

      {/* 编辑列表头(常驻):视图图标 + ⌘K(左)/ 标签(中)/ 面板切换 + 后退前进(右)。 */}
      <div data-drag-region className="relative flex min-w-0 flex-1 items-center gap-0.5 px-2">
        {editorLeading && <TrafficLights />}
        {hasVault ? (
          <>
            {/* 左簇:视图图标(ghost)+ ⌘K。 */}
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <HoverPop key={v.id} side="down" text={t(v.tip as Parameters<TFunc>[0])}>
                  <button
                    onClick={() => onNavigate(v.id)}
                    aria-label={t(v.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded",
                      active
                        ? "bg-surface text-blue"
                        : "text-overlay hover:bg-surface hover:text-text",
                    )}
                  >
                    <Icon size={14} weight={active ? "fill" : "regular"} />
                  </button>
                </HoverPop>
              );
            })}
            <HoverPop side="down" text={t("toolbar.paletteTip")}>
              <button
                onClick={onOpenPalette}
                className="ml-0.5 rounded px-2 py-1 text-[12px] text-subtext hover:bg-surface hover:text-text"
              >
                ⌘K
              </button>
            </HoverPop>

            {/* 居中标签:绝对居中于编辑列,穿透拖拽。 */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="max-w-[40%] truncate px-2 text-[12px] font-medium text-subtext">
                {contextLabel}
              </span>
            </div>

            {/* 右簇:Xcode 式面板切换 + 后退/前进(最右)。 */}
            <div className="ml-auto flex items-center gap-0.5">
              {toggles.map((tg) => {
                const Icon = tg.icon;
                return (
                  <button
                    key={tg.key}
                    data-testid={tg.testid}
                    onClick={tg.onToggle}
                    aria-label={t(tg.key)}
                    aria-pressed={tg.on}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded",
                      tg.on
                        ? "bg-surface text-blue"
                        : "text-overlay hover:bg-surface hover:text-text",
                    )}
                  >
                    <Icon size={14} weight={tg.on ? "fill" : "regular"} />
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <button
            onClick={onOpenVault}
            className="ml-auto flex items-center gap-1.5 rounded bg-blue px-3 py-1 text-[12px] font-medium text-crust hover:opacity-90"
          >
            <FolderOpen size={14} weight="bold" />
            {t("sidebar.openVault")}
          </button>
        )}
      </div>

      {/* 右栏已提为全高(App.tsx,与顶栏齐高):不再在此压一条空占位条,顶部不留白。
          分隔线由右栏自身的 border-l 提供,高度天然对齐。 */}
    </div>
  );
}

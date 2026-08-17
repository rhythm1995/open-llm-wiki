/**
 * nav-icons —— 左导航 TYPES 行的「按类型名挑图标 + 配色」纯函数。
 *
 * 思路:type id 是用户在 frontmatter `type:` 里随手写的字符串(如 book / person /
 * project / task / idea / meeting …),不可枚举。这里用「关键词包含匹配」挑一个语义贴
 * 切的 phosphor 图标 + 一个稳定配色,让每种 type 在导航里一眼可辨;未命中任何关键词时
 * 回退到通用书签图标。
 *
 * 纯函数、无 IO、可单测。Nav.tsx 只消费 typeIcon / typeColor 两个导出。
 */
import {
  BookOpen,
  BookmarkSimple,
  Brain,
  Calendar,
  ChartLine,
  CheckSquare,
  ClipboardText,
  Code,
  Cube,
  Database,
  Flask,
  FolderOpen,
  Gear,
  IdentificationCard,
  Lightbulb,
  MagnifyingGlass,
  MapPin,
  Note,
  PenNib,
  ShootingStar,
  Sparkle,
  Stack,
  User,
  type Icon,
} from "@phosphor-icons/react";

/**
 * 软类型固定词表(精确匹配,优先于关键词规则):
 * - Source   原料库     → Database            蓝
 * - Summary  提炼摘要   → Sparkle             紫
 * - Entity   具名东西   → IdentificationCard  青
 * - Concept  主张       → Brain               黄
 * - Note     普通页     → Note                灰
 * - Query    查询       → MagnifyingGlass     薰衣草
 * - Type     类型契约   → Stack               淡
 * - TypeDoc  类型文档   → BookOpen            薰衣草
 */
const CAIRN_TYPES: { key: string; icon: Icon; color: string }[] = [
  { key: "source", icon: Database, color: "text-blue" },
  { key: "summary", icon: Sparkle, color: "text-mauve" },
  { key: "entity", icon: IdentificationCard, color: "text-teal" },
  { key: "concept", icon: Brain, color: "text-yellow" },
  { key: "note", icon: Note, color: "text-subtext" },
  { key: "query", icon: MagnifyingGlass, color: "text-lavender" },
  { key: "type", icon: Stack, color: "text-overlay" },
  { key: "typedoc", icon: BookOpen, color: "text-lavender" },
];

/** 关键词 → phosphor 图标组件。数组顺序即优先级(长的 / 特异的放前面)。 */
const RULES: { keys: string[]; icon: Icon; color: string }[] = [
  // 人物 / 角色
  { keys: ["person", "people", "contact", "user", "author"], icon: User, color: "text-teal" },
  // 书 / 文档 / 知识
  { keys: ["book", "doc", "knowledge", "wiki", "ref"], icon: BookOpen, color: "text-lavender" },
  // 项目 / 目录
  { keys: ["project", "area", "folder", "workspace"], icon: FolderOpen, color: "text-blue" },
  // 任务 / 待办
  { keys: ["task", "todo", "action", "checklist"], icon: CheckSquare, color: "text-green" },
  // 想法 / 灵感 / 速记
  { keys: ["idea", "thought", "insight", "brainstorm", "memo"], icon: Lightbulb, color: "text-yellow" },
  // 会议 / 日程
  { keys: ["meeting", "event", "calendar", "schedule", "date"], icon: Calendar, color: "text-mauve" },
  // 代码 / 技术笔记
  { keys: ["code", "snippet", "api", "tech", "dev", "bug"], icon: Code, color: "text-blue" },
  // 实验 / 研究
  { keys: ["research", "experiment", "study", "lab"], icon: Flask, color: "text-green" },
  // 数据 / 指标
  { keys: ["data", "metric", "stat", "chart", "report"], icon: ChartLine, color: "text-teal" },
  // 日志 / 清单 / 剪藏
  { keys: ["log", "journal", "diary", "clip", "quote"], icon: ClipboardText, color: "text-subtext" },
  // 写作 / 草稿
  { keys: ["draft", "writing", "essay", "post", "blog"], icon: PenNib, color: "text-mauve" },
  // 地点 / 旅行
  { keys: ["place", "location", "travel", "map", "spot"], icon: MapPin, color: "text-green" },
  // 模板 / 配置
  { keys: ["template", "config", "setting", "system"], icon: Gear, color: "text-overlay" },
  // 卡片 / 杂项对象(wiki 固定类型已由 CAIRN_TYPES 精确接管)
  { keys: ["card", "object", "item"], icon: Cube, color: "text-lavender" },
  // 收藏 / 精品 / 重点
  { keys: ["star", "favorite", "highlight", "best"], icon: ShootingStar, color: "text-yellow" },
];

const FALLBACK = { icon: BookmarkSimple, color: "text-subtext" };

/** 把 type id 归一为小写(关键词匹配用)。空串 / null / undefined → ""。 */
function norm(typeId: string | null | undefined): string {
  return (typeId ?? "").trim().toLowerCase();
}

/**
 * 按 type id 匹配返回 phosphor 图标组件;未命中回退 `BookmarkSimple`。
 * 优先级:① cairn 核心类型精确匹配 → ② 关键词包含匹配(RULES)。
 */
export function typeIcon(typeId: string): Icon {
  const id = norm(typeId);
  const cairn = CAIRN_TYPES.find((r) => r.key === id);
  if (cairn) return cairn.icon;
  for (const r of RULES) {
    if (r.keys.some((k) => id.includes(k))) return r.icon;
  }
  return FALLBACK.icon;
}

/**
 * 按 type id 匹配返回 Tailwind 文字色类(如 "text-lavender");未命中回退
 * "text-subtext"。配色与 typeIcon 同源,保证同一 type 图标与颜色一致。
 */
export function typeColor(typeId: string): string {
  const id = norm(typeId);
  const cairn = CAIRN_TYPES.find((r) => r.key === id);
  if (cairn) return cairn.color;
  for (const r of RULES) {
    if (r.keys.some((k) => id.includes(k))) return r.color;
  }
  return FALLBACK.color;
}

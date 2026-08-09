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
  Calendar,
  ChartLine,
  CheckSquare,
  ClipboardText,
  Code,
  Cube,
  Flask,
  FolderOpen,
  Gear,
  Lightbulb,
  MapPin,
  PenNib,
  ShootingStar,
  User,
  type Icon,
} from "@phosphor-icons/react";

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
  { keys: ["idea", "thought", "insight", "brainstorm", "note", "memo"], icon: Lightbulb, color: "text-yellow" },
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
  // 实体 / 概念 / 卡片
  { keys: ["card", "entity", "concept", "object", "item"], icon: Cube, color: "text-lavender" },
  // 收藏 / 精品 / 重点
  { keys: ["star", "favorite", "highlight", "best"], icon: ShootingStar, color: "text-yellow" },
];

const FALLBACK = { icon: BookmarkSimple, color: "text-subtext" };

/** 把 type id 归一为小写(关键词匹配用)。空串 / null / undefined → ""。 */
function norm(typeId: string | null | undefined): string {
  return (typeId ?? "").trim().toLowerCase();
}

/**
 * 按 type id 关键词匹配返回 phosphor 图标组件;未命中回退 `BookmarkSimple`。
 * 遍历 RULES,首个包含命中的胜出(RULES 顺序即优先级)。
 */
export function typeIcon(typeId: string): Icon {
  const id = norm(typeId);
  for (const r of RULES) {
    if (r.keys.some((k) => id.includes(k))) return r.icon;
  }
  return FALLBACK.icon;
}

/**
 * 按 type id 关键词匹配返回 Tailwind 文字色类(如 "text-lavender");未命中回退
 * "text-subtext"。配色与 typeIcon 同源,保证同一 type 图标与颜色一致。
 */
export function typeColor(typeId: string): string {
  const id = norm(typeId);
  for (const r of RULES) {
    if (r.keys.some((k) => id.includes(k))) return r.color;
  }
  return FALLBACK.color;
}

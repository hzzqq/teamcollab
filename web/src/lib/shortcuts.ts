/** 全局快捷键与命令面板的纯逻辑（无 DOM/React 依赖，可直接单测）。 */

import type { SearchResult } from "./api-types";

/** 看板页监听此事件打开第一列的新建任务输入框 */
export const QUICK_ADD_EVENT = "collab:quick-add";

export type ShortcutAction = "palette" | "help" | "quick-add";

export interface ShortcutKeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface ShortcutDoc {
  action: ShortcutAction;
  label: string;
  keys: string;
}

/** 帮助面板与实现共用同一份真值表，避免文档与行为漂移 */
export const SHORTCUTS: ShortcutDoc[] = [
  { action: "palette", label: "打开 / 关闭全局搜索", keys: "⌘K / Ctrl+K" },
  { action: "help", label: "显示快捷键帮助", keys: "?" },
  { action: "quick-add", label: "在看板第一列新建任务", keys: "C" },
];

/**
 * 输入框聚焦时单键快捷键必须让位，否则用户输入 "c" 就会弹出新建任务。
 * 用鸭子类型而非 HTMLElement，便于 Node 环境跑纯函数单测。
 */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = (el.tagName || "").toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    Boolean(el.isContentEditable)
  );
}

/** 返回本次按键应触发的动作；组合键优先级最高，覆盖层打开时禁用单键。 */
export function resolveShortcut(
  e: ShortcutKeyLike,
  opts: { typing: boolean; overlayOpen: boolean },
): ShortcutAction | null {
  const key = e.key.toLowerCase();
  const mod = Boolean(e.metaKey || e.ctrlKey);
  if (mod && key === "k" && !e.altKey) return "palette";
  if (opts.overlayOpen || opts.typing || mod || e.altKey) return null;
  if (key === "?") return "help";
  if (key === "c" && !e.shiftKey) return "quick-add";
  return null;
}

/** 任务深链：看板页用 ?task= 自动打开 TaskDrawer */
export function buildTaskDeepLink(boardId: string, taskId: string): string {
  return `/boards/${encodeURIComponent(boardId)}?task=${encodeURIComponent(taskId)}`;
}

export function buildBoardDeepLink(boardId: string): string {
  return `/boards/${encodeURIComponent(boardId)}`;
}

export interface PaletteItem {
  kind: "task" | "board";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** 搜索结果摊平成键盘可导航的一维列表（任务在前、看板在后，与 UI 分组一致）。 */
export function flattenHits(result: SearchResult | null | undefined): PaletteItem[] {
  if (!result) return [];
  return [
    ...result.tasks.map(
      (t): PaletteItem => ({
        kind: "task",
        id: t.id,
        title: t.title,
        subtitle: `${t.team_name} / ${t.board_name} / ${t.column_name}`,
        href: buildTaskDeepLink(t.board_id, t.id),
      }),
    ),
    ...result.boards.map(
      (b): PaletteItem => ({
        kind: "board",
        id: b.id,
        title: b.name,
        subtitle: `${b.team_name} · 看板`,
        href: buildBoardDeepLink(b.id),
      }),
    ),
  ];
}

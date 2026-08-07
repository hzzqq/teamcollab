/* ============================================================
   format.ts — 日期/相对时间/截止状态工具（Intl 原生，无额外依赖）
   ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD → Date（本地时区零点，避免 UTC 偏移） */
export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

/** Date → YYYY-MM-DD（本地时区） */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(parseDate(d));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** 相对时间（通知列表用） */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return formatDateTime(iso);
}

export type DueState = "overdue" | "soon" | "normal" | "none";

/** 截止状态：逾期 / 24h 内（未完成）/ 正常 / 无截止 */
export function dueState(dueDate: string | null, status?: TaskStatusLike): DueState {
  if (!dueDate) return "none";
  const due = parseDate(dueDate).getTime();
  const now = Date.now();
  if (status === "done") return "normal";
  if (due < now) return "overdue";
  if (due - now <= DAY_MS) return "soon";
  return "normal";
}

type TaskStatusLike = "todo" | "in_progress" | "done" | undefined;

/** 今天是否已过截止日（我的任务置顶判定） */
export function isOverdue(dueDate: string | null, status?: TaskStatusLike): boolean {
  return dueState(dueDate, status) === "overdue";
}

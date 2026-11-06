/* ============================================================
   task-table.ts — 列表/表格视图纯逻辑（可单测，不碰 React / API）
   ============================================================ */
import type {
  BatchAction,
  BatchTaskRequest,
  BoardColumnWithTasks,
  Task,
} from "./api-types";
// 显式 .ts：node --experimental-strip-types 原生单测不走 bundler，值导入必须带扩展名
import { filterTasks, type BoardFilter } from "./board-filter.ts";

export type SortKey = "title" | "status" | "priority" | "assignee" | "due_date" | "column";
export type SortDir = "asc" | "desc";

export interface TableRow {
  task: Task;
  columnName: string;
}

const STATUS_ORDER: Record<string, number> = { todo: 0, in_progress: 1, done: 2 };
const PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

/** 把看板的列 + 任务摊平为表格行，附带列名供展示/排序 */
export function flattenBoardTasks(columns: BoardColumnWithTasks[]): TableRow[] {
  return columns.flatMap((column) =>
    (column.tasks || []).map((task) => ({ task, columnName: column.name })),
  );
}

function sortValue(row: TableRow, key: SortKey): string | number {
  const t = row.task;
  switch (key) {
    case "title":
      return t.title.toLocaleLowerCase("zh-CN");
    case "status":
      return STATUS_ORDER[t.status] ?? 99;
    case "priority":
      return PRIORITY_ORDER[t.priority] ?? 99;
    case "assignee":
      return (t.assignee?.display_name || "\uffff").toLocaleLowerCase("zh-CN");
    case "due_date":
      return t.due_date || "\uffff";
    case "column":
      return row.columnName.toLocaleLowerCase("zh-CN");
  }
}

export function sortTableRows(rows: TableRow[], key: SortKey, dir: SortDir): TableRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === bv) return a.task.id.localeCompare(b.task.id);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv), "zh-CN") * factor;
  });
}

/** 筛选 + 排序的组合入口（视图直接消费） */
export function tableRows(
  columns: BoardColumnWithTasks[],
  filter: BoardFilter,
  key: SortKey,
  dir: SortDir,
): TableRow[] {
  const rows = flattenBoardTasks(columns);
  const filteredIds = new Set(filterTasks(rows.map((r) => r.task), filter).map((t) => t.id));
  return sortTableRows(rows.filter((r) => filteredIds.has(r.task.id)), key, dir);
}

export function buildBatchRequest(
  taskIds: string[],
  action: BatchAction,
  value?: string | null,
): BatchTaskRequest {
  const req: BatchTaskRequest = { task_ids: taskIds, action };
  if (value !== undefined && value !== null) req.value = value;
  return req;
}

export function nextSort(current: SortKey, clicked: SortKey, dir: SortDir): { key: SortKey; dir: SortDir } {
  if (current !== clicked) return { key: clicked, dir: "asc" };
  return { key: clicked, dir: dir === "asc" ? "desc" : "asc" };
}

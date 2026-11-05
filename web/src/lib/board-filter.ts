import type { Task } from "@/lib/api-types";

/** 看板视图的客户侧筛选（标签 + 优先级），不影响已加载的看板数据。 */
export interface BoardFilter {
  labelId: string | null;
  priority: Task["priority"] | null;
}

export const EMPTY_FILTER: BoardFilter = { labelId: null, priority: null };

export function isFilterActive(f: BoardFilter): boolean {
  return f.labelId !== null || f.priority !== null;
}

/** 按筛选条件过滤某列任务（纯函数，便于测试）。 */
export function filterTasks(tasks: Task[], f: BoardFilter): Task[] {
  return tasks.filter((t) => {
    if (f.priority && t.priority !== f.priority) return false;
    if (f.labelId && !t.labels.some((l) => l.id === f.labelId)) return false;
    return true;
  });
}

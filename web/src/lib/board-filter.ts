import type { Task, ViewFilter } from "@/lib/api-types";

/** 看板视图的客户侧筛选（标签 + 优先级 + 负责人），不影响已加载的看板数据。 */
export interface BoardFilter {
  labelId: string | null;
  priority: Task["priority"] | null;
  assigneeId: string | null;
}

export const EMPTY_FILTER: BoardFilter = { labelId: null, priority: null, assigneeId: null };

export function isFilterActive(f: BoardFilter): boolean {
  return f.labelId !== null || f.priority !== null || f.assigneeId !== null;
}

/** 客户侧筛选 -> 后端命名视图筛选（仅包含被设置的键，省存储） */
export function toViewFilter(f: BoardFilter): ViewFilter {
  return {
    label_id: f.labelId,
    priority: f.priority,
    assignee_id: f.assigneeId,
  };
}

/** 后端命名视图筛选 -> 客户侧筛选（缺省键补 null） */
export function fromViewFilter(v: ViewFilter): BoardFilter {
  return {
    labelId: v.label_id ?? null,
    priority: v.priority ?? null,
    assigneeId: v.assignee_id ?? null,
  };
}

/** 按筛选条件过滤某列任务（纯函数，便于测试）。 */
export function filterTasks(tasks: Task[], f: BoardFilter): Task[] {
  return tasks.filter((t) => {
    if (f.priority && t.priority !== f.priority) return false;
    if (f.labelId && !t.labels.some((l) => l.id === f.labelId)) return false;
    if (f.assigneeId && t.assignee_id !== f.assigneeId) return false;
    return true;
  });
}

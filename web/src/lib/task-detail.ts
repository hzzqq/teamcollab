/** 任务详情增强的纯逻辑（无 React 依赖，可直接 node --test）。 */

import type { ChecklistItem, CreateTaskRequest, Task } from "./api-types";

/** 稳定短编号：取 UUID 去掉连字符后的前 8 位，不编造自增序号。 */
export function shortTaskId(taskId: string): string {
  return taskId.replace(/-/g, "").slice(0, 8);
}

export function checklistProgress(
  items: ChecklistItem[] | null | undefined,
): { done: number; total: number } {
  const list = items || [];
  return { done: list.filter((i) => i.done).length, total: list.length };
}

export function newChecklistItem(text: string): ChecklistItem {
  return {
    id: `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    done: false,
  };
}

/**
 * 复制任务：保留可编辑字段，标题加「(副本)」且不超过后端 200 字限制。
 * 清单项重新生成 id，避免副本与源任务共用 id 导致后续勾选串台。
 */
export function buildDuplicateRequest(task: Task): CreateTaskRequest {
  const suffix = " (副本)";
  const title = `${task.title.slice(0, 200 - suffix.length)}${suffix}`;
  return {
    title,
    description: task.description,
    column_id: task.column_id,
    assignee_id: task.assignee_id,
    priority: task.priority,
    status: task.status,
    due_date: task.due_date,
    start_date: task.start_date,
    label_ids: (task.labels || []).map((l) => l.id),
    checklist: (task.checklist || []).map((item) => ({
      ...item,
      id: newChecklistItem(item.text).id,
    })),
  };
}

"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBatchTasks } from "@/hooks/use-board";
import { useMembers } from "@/hooks/use-members";
import { dueState, formatDate } from "@/lib/format";
import {
  buildBatchRequest,
  nextSort,
  tableRows,
  type SortDir,
  type SortKey,
} from "@/lib/task-table";
import type { BatchAction, BoardColumnWithTasks, Priority, TaskStatus } from "@/lib/api-types";
import type { BoardFilter } from "@/lib/board-filter";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export function TaskTable({
  boardId,
  teamId,
  columns,
  filter,
  writable,
  onOpenTask,
}: {
  boardId: string;
  teamId: string;
  columns: BoardColumnWithTasks[];
  filter: BoardFilter;
  writable: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const batch = useBatchTasks(boardId);
  const { data: members } = useMembers(teamId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [batchNonce, setBatchNonce] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(
    () => tableRows(columns, filter, sortKey, sortDir),
    [columns, filter, sortKey, sortDir],
  );
  const allIds = rows.map((r) => r.task.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBatch(action: BatchAction, value?: string | null) {
    if (selected.size === 0) return;
    batch.mutate(buildBatchRequest([...selected], action, value), {
      onSuccess: (data) => {
        toast.success(`已更新 ${data.updated} 项任务`);
        setSelected(new Set());
        setConfirmDelete(false);
        setBatchNonce((n) => n + 1);
      },
      onError: () => toast.error("批量操作失败，请重试"),
    });
  }

  // 注意：这里必须是「返回 JSX 的函数」而不是内联组件——
  // 内联组件每次渲染都是新类型，React 会重挂整个表头，点击排序时容易触发元素 detach。
  function sortHeader(label: string, k: SortKey) {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => {
          const next = nextSort(sortKey, k, sortDir);
          setSortKey(next.key);
          setSortDir(next.dir);
        }}
        aria-label={`按${label}排序`}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1 py-1 font-medium transition-colors hover:text-fg",
          active ? "text-primary-600" : "text-meta",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp size={12} strokeWidth={1.75} /> : <ArrowDown size={12} strokeWidth={1.75} />
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="card-surface overflow-hidden">
        {selected.size > 0 && writable ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-50 px-4 py-2" aria-label="批量操作">
            <span className="mr-1 text-xs font-medium text-fg">已选 {selected.size} 项</span>

            <Select key={`status-${batchNonce}`} onValueChange={(v) => runBatch("set_status", v)}>
              <SelectTrigger className="h-8 w-28 text-xs" aria-label="批量改状态">
                <SelectValue placeholder="改状态" />
              </SelectTrigger>
              <SelectContent>
                {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select key={`priority-${batchNonce}`} onValueChange={(v) => runBatch("set_priority", v)}>
              <SelectTrigger className="h-8 w-28 text-xs" aria-label="批量改优先级">
                <SelectValue placeholder="改优先级" />
              </SelectTrigger>
              <SelectContent>
                {(["low", "medium", "high", "urgent"] as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              key={`assignee-${batchNonce}`}
              onValueChange={(v) => runBatch("set_assignee", v === "none" ? null : v)}
            >
              <SelectTrigger className="h-8 w-32 text-xs" aria-label="批量改负责人">
                <SelectValue placeholder="改负责人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未分配</SelectItem>
                {(members || []).map((m) => (
                  <SelectItem key={m.user.id} value={m.user.id}>{m.user.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              className={cn("text-danger hover:bg-danger/10", confirmDelete && "bg-danger/10")}
              aria-label="批量删除"
              onClick={() => (confirmDelete ? runBatch("delete") : setConfirmDelete(true))}
              disabled={batch.isPending}
            >
              <Trash2 size={14} strokeWidth={1.5} />
              {confirmDelete ? `确认删除 ${selected.size} 项` : "删除"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Set());
                setConfirmDelete(false);
              }}
            >
              取消
            </Button>
          </div>
        ) : null}

        <table className="w-full border-collapse text-sm" data-testid="task-table">
          <thead className="bg-surface-warm text-left text-xs">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  aria-label="全选任务"
                  checked={allSelected}
                  disabled={!writable || allIds.length === 0}
                  onCheckedChange={(checked) =>
                    setSelected(checked === true ? new Set(allIds) : new Set())
                  }
                />
              </th>
              <th className="px-3 py-2.5">{sortHeader("任务", "title")}</th>
              <th className="px-3 py-2.5">{sortHeader("状态", "status")}</th>
              <th className="px-3 py-2.5">{sortHeader("优先级", "priority")}</th>
              <th className="px-3 py-2.5">{sortHeader("负责人", "assignee")}</th>
              <th className="px-3 py-2.5">{sortHeader("截止日期", "due_date")}</th>
              <th className="px-3 py-2.5">{sortHeader("所在列", "column")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ task, columnName }) => (
              <tr
                key={task.id}
                data-testid="task-row"
                className={cn(
                  "border-t border-border transition-colors hover:bg-surface-warm",
                  selected.has(task.id) && "bg-primary-50",
                )}
              >
                <td className="px-3 py-2.5">
                  <Checkbox
                    aria-label={`选择 ${task.title}`}
                    checked={selected.has(task.id)}
                    disabled={!writable}
                    onCheckedChange={() => toggle(task.id)}
                  />
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="block w-full truncate text-left font-medium text-fg hover:text-primary-600 hover:underline"
                  >
                    {task.title}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-xs text-fg-2" data-cell="status">{STATUS_LABEL[task.status]}</td>
                <td className="px-3 py-2.5 text-xs text-fg-2" data-cell="priority">{PRIORITY_LABEL[task.priority]}</td>
                <td className="px-3 py-2.5 text-xs text-fg-2">{task.assignee?.display_name || "未分配"}</td>
                <td className={cn("px-3 py-2.5 text-xs", dueState(task.due_date, task.status) === "overdue" ? "text-danger" : "text-fg-2")}>
                  {task.due_date ? formatDate(task.due_date) : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-meta">{columnName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-meta">没有符合条件的任务，换个筛选试试。</p>
        ) : null}
      </div>
      <p className="mt-2 px-1 text-xs text-meta">共 {rows.length} 项 · 点击表头排序 · 勾选后可批量修改</p>
    </div>
  );
}

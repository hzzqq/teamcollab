"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, CalendarClock, Check, X, Pencil, Trash2 } from "lucide-react";
import { useBoard, useMoveTask, useCreateTask, useCreateColumn, useUpdateColumn, useDeleteColumn } from "@/hooks/use-board";
import { useMe, canWrite, canAdmin } from "@/hooks/use-me";
import { computeMoveTarget } from "@/lib/drag-position";
import { dueState, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { LabelChip } from "@/components/kanban/label-chip";
import { filterTasks, isFilterActive, type BoardFilter } from "@/lib/board-filter";
import type { BoardColumnWithTasks, Task } from "@/lib/api-types";

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-tag-blue",
  medium: "bg-tag-green",
  high: "bg-tag-amber",
  urgent: "bg-tag-rose",
};

export function KanbanBoard({
  boardId,
  onOpenTask,
  filter,
}: {
  boardId: string;
  onOpenTask: (taskId: string) => void;
  filter?: BoardFilter;
}) {
  const { data: board, isLoading } = useBoard(boardId);
  const { data: me } = useMe();
  const writable = canWrite(me?.role);
  const admin = canAdmin(me?.role);
  const moveTask = useMoveTask(boardId);
  const createTask = useCreateTask(boardId);
  const createColumn = useCreateColumn(boardId);
  const updateColumn = useUpdateColumn(boardId);
  const deleteColumn = useDeleteColumn(boardId);

  // 筛选激活时关闭拖拽：避免 SortableContext 项与全量列错位导致落位计算错误（保护拖拽契约）
  const filtering = filter ? isFilterActive(filter) : false;

  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !board) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // 落位参数由纯函数统一计算（前后端契约的唯一真相源，见 lib/drag-position.ts）
    const target = computeMoveTarget(board.columns, activeId, overId);
    if (!target) return;

    // 契约：路径 columnId 必须是【目标列】（openapi-v2 position 接口：columnId=目标列，
    // body.target_column_id 与路径一致做冗余校验）。传源列会被后端 400 拒绝。
    moveTask.mutate({
      columnId: target.columnId,
      taskId: activeId,
      req: { target_column_id: target.columnId, position: target.position },
    });
  }

  if (isLoading) {
    return <div className="flex gap-4 p-4"><div className="h-64 w-[272px] animate-pulse rounded-lg bg-surface-warm" /></div>;
  }
  if (!board) return <p className="p-4 text-sm text-muted">看板不存在或无权访问</p>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto p-4 scrollbar-none">
        {board.columns.map((col) => (
          <Column
            key={col.id}
            column={filter ? { ...col, tasks: filterTasks(col.tasks, filter) } : col}
            writable={writable}
            admin={admin}
            dragDisabled={filtering}
            onOpenTask={onOpenTask}
            onAddTask={(title) => createTask.mutate({ column_id: col.id, title, priority: "medium" })}
            isPending={createTask.isPending}
            onRenameColumn={(columnId, name) => updateColumn.mutate({ columnId, req: { name } })}
            onDeleteColumn={(columnId) => deleteColumn.mutate(columnId)}
            renamePending={updateColumn.isPending}
            deletePending={deleteColumn.isPending}
          />
        ))}

        {/* 新建列 */}
        <div className="w-[272px] shrink-0">
          {addingCol ? (
            <div className="rounded-lg border border-border bg-surface p-2">
              <Input
                autoFocus
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="列名称"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newColName.trim()) {
                    createColumn.mutate(newColName.trim());
                    setNewColName("");
                    setAddingCol(false);
                  }
                }}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (newColName.trim()) {
                      createColumn.mutate(newColName.trim());
                      setNewColName("");
                      setAddingCol(false);
                    }
                  }}
                >
                  添加
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAddingCol(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => writable && setAddingCol(true)}
              disabled={!writable}
              className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-meta transition-colors duration-fast hover:border-primary-500 hover:text-fg-2 disabled:cursor-not-allowed"
            >
              <Plus size={16} strokeWidth={1.5} /> 新建列
            </button>
          )}
        </div>
      </div>
    </DndContext>
  );
}

function Column({
  column,
  writable,
  admin,
  dragDisabled,
  onOpenTask,
  onAddTask,
  isPending,
  onRenameColumn,
  onDeleteColumn,
  renamePending,
  deletePending,
}: {
  column: BoardColumnWithTasks;
  writable: boolean;
  admin: boolean;
  dragDisabled: boolean;
  onOpenTask: (taskId: string) => void;
  onAddTask: (title: string) => void;
  isPending: boolean;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  renamePending: boolean;
  deletePending: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(column.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function startEdit() {
    setDraftName(column.name);
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== column.name) onRenameColumn(column.id, trimmed);
    setEditing(false);
  }

  return (
    <div className="flex w-[272px] shrink-0 flex-col rounded-lg bg-surface-warm dark:bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          {editing ? (
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-7 w-32 text-sm"
            />
          ) : (
            <span className="text-sm font-medium text-fg">{column.name}</span>
          )}
          <span className="text-xs text-meta">{column.tasks.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {editing ? (
            <>
              <Button variant="ghost" size="iconSm" onClick={saveEdit} disabled={renamePending || !draftName.trim()} aria-label="保存列名">
                <Check size={15} strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="iconSm" onClick={() => setEditing(false)} aria-label="取消编辑">
                <X size={15} strokeWidth={1.5} />
              </Button>
            </>
          ) : (
            <>
              {writable ? (
                <Button variant="ghost" size="iconSm" onClick={() => setAdding((v) => !v)} aria-label="新建任务">
                  <Plus size={16} strokeWidth={1.5} />
                </Button>
              ) : null}
              {writable ? (
                <Button variant="ghost" size="iconSm" onClick={startEdit} aria-label="重命名列">
                  <Pencil size={14} strokeWidth={1.5} />
                </Button>
              ) : null}
              {admin ? (
                confirmingDelete ? (
                  <span className="flex items-center gap-1">
                    <Button variant="ghost" size="iconSm" className="text-danger hover:bg-danger/10" onClick={() => onDeleteColumn(column.id)} disabled={deletePending} aria-label="确认删除列">
                      <Check size={14} strokeWidth={1.5} />
                    </Button>
                    <Button variant="ghost" size="iconSm" onClick={() => setConfirmingDelete(false)} aria-label="取消删除列">
                      <X size={14} strokeWidth={1.5} />
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost" size="iconSm" className="text-danger hover:bg-danger/10" onClick={() => setConfirmingDelete(true)} aria-label="删除列">
                    <Trash2 size={14} strokeWidth={1.5} />
                  </Button>
                )
              ) : null}
            </>
          )}
        </div>
      </div>

      <div ref={setNodeRef} className="flex min-h-20 flex-1 flex-col gap-2 px-2 pb-2">
        {adding ? (
          <div className="rounded-md border border-border bg-surface p-2">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任务标题"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) {
                  onAddTask(title.trim());
                  setTitle("");
                  setAdding(false);
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { if (title.trim()) { onAddTask(title.trim()); setTitle(""); setAdding(false); } }} disabled={isPending}>
                添加
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : null}

        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} writable={writable} dragDisabled={dragDisabled} onOpen={() => onOpenTask(task.id)} />
          ))}
        </SortableContext>

        {column.tasks.length === 0 && !adding ? (
          <p className="px-2 py-4 text-center text-xs text-meta">暂无任务，点击 + 创建</p>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  writable,
  dragDisabled,
  onOpen,
}: {
  task: Task;
  writable: boolean;
  dragDisabled: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: dragDisabled });
  const due = dueState(task.due_date, task.status);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5 transition-colors duration-fast hover:border-primary-500",
        isDragging && "opacity-30",
      )}
    >
      <div className="flex items-start gap-1.5">
        {writable && !dragDisabled ? (
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab text-meta opacity-0 transition-opacity duration-fast group-hover:opacity-100 touch-none"
            aria-label="拖拽任务"
          >
            <GripVertical size={14} strokeWidth={1.5} />
          </button>
        ) : null}
        <button onClick={onOpen} className="min-w-0 flex-1 text-left text-sm text-fg">
          <span className="line-clamp-2">{task.title}</span>
        </button>
      </div>
      {task.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1 pl-5">
          {task.labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between pl-5">
        <span className={cn("size-2 rounded-full", PRIORITY_DOT[task.priority])} aria-label={`优先级 ${task.priority}`} />
        <div className="flex items-center gap-2">
          {task.due_date ? (
            <span className={cn("flex items-center gap-0.5 text-xs", due === "overdue" ? "text-danger" : due === "soon" ? "text-warn" : "text-meta")}>
              <CalendarClock size={12} strokeWidth={1.5} />
              {formatDate(task.due_date)}
            </span>
          ) : null}
          {task.assignee ? (
            <Avatar className="size-5">
              <AvatarFallback>{initials(task.assignee.display_name)}</AvatarFallback>
            </Avatar>
          ) : (
            <span className="size-5 rounded-full border border-dashed border-border" />
          )}
        </div>
      </div>
    </div>
  );
}

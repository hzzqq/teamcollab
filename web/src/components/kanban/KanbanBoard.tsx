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
import { GripVertical, Plus, CalendarClock } from "lucide-react";
import { useBoard, useMoveTask, useCreateTask, useCreateColumn } from "@/hooks/use-board";
import { useMe, canWrite } from "@/hooks/use-me";
import { dueState, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
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
}: {
  boardId: string;
  onOpenTask: (taskId: string) => void;
}) {
  const { data: board, isLoading } = useBoard(boardId);
  const { data: me } = useMe();
  const writable = canWrite(me?.role);
  const moveTask = useMoveTask(boardId);
  const createTask = useCreateTask(boardId);
  const createColumn = useCreateColumn(boardId);

  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findColumnOfTask(taskId: string, columns: BoardColumnWithTasks[]): BoardColumnWithTasks | undefined {
    return columns.find((c) => c.tasks.some((t) => t.id === taskId));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !board) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourceCol = findColumnOfTask(activeId, board.columns);
    if (!sourceCol) return;

    const targetCol =
      board.columns.find((c) => c.id === overId) || findColumnOfTask(overId, board.columns);
    if (!targetCol) return;

    const overIndex = targetCol.tasks.findIndex((t) => t.id === overId);
    const position = overIndex >= 0 ? overIndex : targetCol.tasks.length;

    moveTask.mutate({
      columnId: sourceCol.id,
      taskId: activeId,
      req: { target_column_id: targetCol.id, position },
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
            column={col}
            writable={writable}
            onOpenTask={onOpenTask}
            onAddTask={(title) => createTask.mutate({ column_id: col.id, title, priority: "medium" })}
            isPending={createTask.isPending}
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
  onOpenTask,
  onAddTask,
  isPending,
}: {
  column: BoardColumnWithTasks;
  writable: boolean;
  onOpenTask: (taskId: string) => void;
  onAddTask: (title: string) => void;
  isPending: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  return (
    <div className="flex w-[272px] shrink-0 flex-col rounded-lg bg-surface-warm dark:bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{column.name}</span>
          <span className="text-xs text-meta">{column.tasks.length}</span>
        </div>
        {writable ? (
          <Button variant="ghost" size="iconSm" onClick={() => setAdding((v) => !v)} aria-label="新建任务">
            <Plus size={16} strokeWidth={1.5} />
          </Button>
        ) : null}
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
            <TaskCard key={task.id} task={task} writable={writable} onOpen={() => onOpenTask(task.id)} />
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
  onOpen,
}: {
  task: Task;
  writable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
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
        {writable ? (
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

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, LayoutGrid, List, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDrawer } from "@/components/kanban/TaskDrawer";
import { BoardFilters } from "@/components/kanban/board-filters";
import { TaskTable } from "@/components/kanban/task-table";
import type { BoardFilter } from "@/lib/board-filter";
import { useMe, canWrite, canAdmin } from "@/hooks/use-me";
import { useBoard, useUpdateBoard, useDeleteBoard } from "@/hooks/use-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");
  const { data: me } = useMe();
  const { data: board } = useBoard(boardId);
  const teamId = me?.team?.id || "";
  const writable = canWrite(me?.role);
  const admin = canAdmin(me?.role);
  const updateBoard = useUpdateBoard(teamId);
  const deleteBoard = useDeleteBoard(teamId);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 视图与筛选条件都写进 URL：刷新 / 分享链接能恢复同一视角
  const view = searchParams.get("view") === "list" ? "list" : "board";
  const filter: BoardFilter = {
    labelId: searchParams.get("label"),
    priority: (searchParams.get("priority") as BoardFilter["priority"] | null) ?? null,
    assigneeId: searchParams.get("assignee"),
  };

  function setParams(patch: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(patch)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    router.replace(`${url.pathname}${url.search}`);
  }

  function openTask(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("task", id);
    router.push(`${url.pathname}${url.search}`);
  }

  function closeTask() {
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    router.replace(`${url.pathname}${url.search}`);
  }

  function startEdit() {
    setDraftName(board?.name || "");
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== board?.name) {
      updateBoard.mutate({ boardId, name: trimmed });
    }
    setEditing(false);
  }

  async function handleDelete() {
    try {
      await deleteBoard.mutateAsync(boardId);
      setConfirmingDelete(false);
      toast.success("看板已删除");
      router.push("/boards");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-8 w-56"
            />
            <Button size="sm" onClick={saveEdit} disabled={updateBoard.isPending || !draftName.trim()}>
              <Check size={15} strokeWidth={1.5} />
              保存
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              <X size={15} strokeWidth={1.5} />
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-base font-semibold text-fg">{board?.name}</h1>
            {writable ? (
              <Button variant="ghost" size="iconSm" onClick={startEdit} aria-label="重命名看板">
                <Pencil size={15} strokeWidth={1.5} />
              </Button>
            ) : null}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-[var(--radius-input)] border border-border p-0.5" aria-label="视图切换">
            <button
              type="button"
              aria-label="看板视图"
              onClick={() => setParams({ view: null })}
              className={cn(
                "flex size-7 items-center justify-center rounded-sm transition-colors",
                view === "board" ? "bg-primary-50 text-primary-600" : "text-meta hover:text-fg",
              )}
            >
              <LayoutGrid size={15} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="列表视图"
              onClick={() => setParams({ view: "list" })}
              className={cn(
                "flex size-7 items-center justify-center rounded-sm transition-colors",
                view === "list" ? "bg-primary-50 text-primary-600" : "text-meta hover:text-fg",
              )}
            >
              <List size={15} strokeWidth={1.5} />
            </button>
          </div>
          {admin ? (
            confirmingDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-danger">确认删除该看板及其所有列与任务？</span>
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteBoard.isPending}>
                  删除
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  取消
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="iconSm" className="text-danger hover:bg-danger/10" onClick={() => setConfirmingDelete(true)} aria-label="删除看板">
                <Trash2 size={16} strokeWidth={1.5} />
              </Button>
            )
          ) : null}
        </div>
      </div>

      <BoardFilters
        teamId={me?.team?.id || ""}
        filter={filter}
        onChange={(next) =>
          setParams({
            label: next.labelId,
            priority: next.priority,
            assignee: next.assigneeId,
          })
        }
      />
      {view === "list" ? (
        <TaskTable
          boardId={boardId}
          teamId={me?.team?.id || ""}
          columns={board?.columns ?? []}
          filter={filter}
          writable={writable}
          onOpenTask={openTask}
        />
      ) : (
        <KanbanBoard boardId={boardId} onOpenTask={openTask} filter={filter} />
      )}
      <TaskDrawer taskId={taskId} boardId={boardId} onClose={closeTask} />
    </div>
  );
}

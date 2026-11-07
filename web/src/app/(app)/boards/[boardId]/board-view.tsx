"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, LayoutGrid, List, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDrawer } from "@/components/kanban/TaskDrawer";
import { BoardFilters } from "@/components/kanban/board-filters";
import { TaskTable } from "@/components/kanban/task-table";
import { ViewSwitcher } from "@/components/kanban/view-switcher";
import type { BoardFilter } from "@/lib/board-filter";
import { useMe, canWrite, canAdmin } from "@/hooks/use-me";
import { useBoard, useUpdateBoard, useDeleteBoard } from "@/hooks/use-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SavedView } from "@/lib/api-types";
import type { SortDir, SortKey } from "@/lib/task-table";

export default function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");
  const { data: me } = useMe();
  const { data: rawBoard } = useBoard(boardId);
  // 首屏确定性闸门（局部 mounted，非全局 useHydrated）：useMe 内部已用局部 mounted 闸门
  // data；这里再用一个组件局部 mounted 约束角色派生 UI，保证 SSR 与 CSR 首帧都「未就绪」
  // （meReady=false → 不渲染角色相关按钮），挂载后再渲染真实身份 UI，消除 #418。
  // board 直接消费 rawBoard，不额外加闸门：useBoard 自身的 mounted 闸门已强制首帧
  // isLoading=true（看板区走骨架屏），角色派生按钮则靠下方 meReady 闸门对齐 SSR。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const board = rawBoard;
  const meReady = Boolean(me) && mounted;
  const role = meReady ? me!.role : undefined;
  const teamId = meReady ? (me!.team?.id || "") : "";
  const currentUserId = meReady ? (me!.user?.id || "") : "";
  const writable = canWrite(role);
  const admin = canAdmin(role);
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
  // 列表视图排序也写进 URL，供保存视图捕获
  const sortKey: SortKey = (searchParams.get("sort") as SortKey) || "title";
  const sortDir: SortDir = (searchParams.get("dir") as SortDir) || "asc";

  function setParams(patch: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(patch)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    router.replace(`${url.pathname}${url.search}`);
  }

  /** 应用一个已保存的命名视图：把其视图类型 / 筛选 / 排序写回 URL */
  function applyView(v: SavedView) {
    const url = new URL(window.location.href);
    const f = v.filters || {};
    if (v.view === "list") url.searchParams.set("view", "list");
    else url.searchParams.delete("view");
    if (f.label_id) url.searchParams.set("label", f.label_id);
    else url.searchParams.delete("label");
    if (f.priority) url.searchParams.set("priority", f.priority);
    else url.searchParams.delete("priority");
    if (f.assignee_id) url.searchParams.set("assignee", f.assignee_id);
    else url.searchParams.delete("assignee");
    if (v.view === "list") {
      url.searchParams.set("sort", v.sort_key || "title");
      url.searchParams.set("dir", v.sort_dir || "asc");
    } else {
      url.searchParams.delete("sort");
      url.searchParams.delete("dir");
    }
    router.replace(`${url.pathname}${url.search}`);
  }

  function onSortChange(key: SortKey, dir: SortDir) {
    setParams({ sort: key, dir });
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
          <ViewSwitcher
            teamId={teamId}
            currentView={view}
            filter={filter}
            sortKey={sortKey}
            sortDir={sortDir}
            role={role}
            currentUserId={currentUserId}
            onApplyView={applyView}
          />
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
        teamId={teamId}
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
          teamId={teamId}
          columns={board?.columns ?? []}
          filter={filter}
          writable={writable}
          onOpenTask={openTask}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      ) : (
        <KanbanBoard boardId={boardId} onOpenTask={openTask} filter={filter} />
      )}
      <TaskDrawer taskId={taskId} boardId={boardId} onClose={closeTask} onOpenTask={openTask} />
    </div>
  );
}

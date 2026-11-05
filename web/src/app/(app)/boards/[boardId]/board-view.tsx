"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDrawer } from "@/components/kanban/TaskDrawer";
import { BoardFilters } from "@/components/kanban/board-filters";
import { EMPTY_FILTER, type BoardFilter } from "@/lib/board-filter";
import { useMe } from "@/hooks/use-me";

export default function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");
  const { data: me } = useMe();
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);

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

  return (
    <div className="flex h-full flex-col">
      <BoardFilters teamId={me?.team?.id || ""} filter={filter} onChange={setFilter} />
      <KanbanBoard boardId={boardId} onOpenTask={openTask} filter={filter} />
      <TaskDrawer taskId={taskId} boardId={boardId} onClose={closeTask} />
    </div>
  );
}

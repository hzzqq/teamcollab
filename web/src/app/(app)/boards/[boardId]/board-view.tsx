"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDrawer } from "@/components/kanban/TaskDrawer";

export default function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");

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
      <KanbanBoard boardId={boardId} onOpenTask={openTask} />
      <TaskDrawer taskId={taskId} boardId={boardId} onClose={closeTask} />
    </div>
  );
}

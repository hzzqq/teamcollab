import { Suspense } from "react";
import BoardView from "./board-view";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted">加载看板…</div>}>
      <BoardView boardId={boardId} />
    </Suspense>
  );
}

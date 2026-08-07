"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { useBoards, useCreateBoard } from "@/hooks/use-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, StateSwitch, SkeletonRows } from "@/components/common/states";
import { cn } from "@/lib/utils";

export default function BoardsPage() {
  const { data: me } = useMe();
  const teamId = me?.team?.id;
  const { data: boards, isLoading, isError, refetch } = useBoards(teamId || "");
  const createBoard = useCreateBoard(teamId || "");

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createBoard.mutateAsync(trimmed);
    setName("");
    setOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fg">看板</h2>
          <p className="text-sm text-muted">管理团队的任务看板</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!teamId}>
          <Plus size={16} strokeWidth={1.5} />
          新建看板
        </Button>
      </div>

      <StateSwitch
        isLoading={isLoading}
        isError={isError}
        errorMessage="看板加载失败"
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && boards?.length === 0}
        skeleton={<SkeletonRows rows={3} />}
        empty={
          <EmptyState
            icon={FolderKanban}
            title="还没有看板"
            description="创建第一个看板，把任务拆成卡片拖到不同状态列。"
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} strokeWidth={1.5} />
                新建看板
              </Button>
            }
          />
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards?.map((b) => (
            <Link
              key={b.id}
              href={`/boards/${b.id}`}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border border-border bg-surface p-4 text-left transition-colors duration-fast hover:border-primary-500",
              )}
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary-600 dark:bg-surface-warm">
                <FolderKanban size={18} strokeWidth={1.5} />
              </span>
              <span className="mt-1 text-sm font-medium text-fg">{b.name}</span>
              <span className="text-xs text-meta">点击进入看板</span>
            </Link>
          ))}
        </div>
      </StateSwitch>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建看板</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：产品迭代 Q3"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createBoard.isPending || !name.trim()}>
              {createBoard.isPending ? "创建中" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

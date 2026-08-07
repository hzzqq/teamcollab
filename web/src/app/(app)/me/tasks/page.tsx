"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Search } from "lucide-react";
import { useMyTasks } from "@/hooks/use-tasks";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, StateSwitch, SkeletonRows } from "@/components/common/states";
import { dueState, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Priority, TaskStatus } from "@/lib/api-types";

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
const PRIORITY_CLASS: Record<Priority, string> = {
  low: "bg-tag-blue/10 text-tag-blue",
  medium: "bg-tag-green/10 text-tag-green",
  high: "bg-tag-amber/10 text-tag-amber",
  urgent: "bg-tag-rose/10 text-tag-rose",
};

const FILTERS: { label: string; value: TaskStatus | "" }[] = [
  { label: "全部", value: "" },
  { label: "待办", value: "todo" },
  { label: "进行中", value: "in_progress" },
  { label: "已完成", value: "done" },
];

export default function MyTasksPage() {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const { data, isLoading, isError, refetch } = useMyTasks({
    status: status || undefined,
    q: debouncedQ || undefined,
    page: 1,
    limit: 50,
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-fg">我的任务</h2>
        <p className="text-sm text-muted">只看分配给你的任务，逾期自动置顶</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={16} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-meta" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索任务标题或描述"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={status === f.value ? "default" : "secondary"}
              size="sm"
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <StateSwitch
        isLoading={isLoading}
        isError={isError}
        errorMessage="任务加载失败"
        onRetry={() => refetch()}
        isEmpty={!isLoading && !isError && items.length === 0}
        skeleton={<SkeletonRows rows={6} />}
        empty={
          <EmptyState
            icon={ListChecks}
            title="暂无任务"
            description="当同事把任务分配给你时，它们会显示在这里。"
          />
        }
      >
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-meta">
                <th className="px-3 py-2 text-left font-medium">任务</th>
                <th className="px-3 py-2 text-left font-medium">看板</th>
                <th className="px-3 py-2 text-left font-medium">优先级</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-left font-medium">截止</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {items.map((t) => {
                const due = dueState(t.due_date, t.status);
                return (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/boards/${t.board_id}?task=${t.id}`)}
                    className="cursor-pointer transition-colors duration-fast hover:bg-surface-warm"
                  >
                    <td className="px-3 py-2.5 text-fg">{t.title}</td>
                    <td className="px-3 py-2.5 text-meta">{t.board_name || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", PRIORITY_CLASS[t.priority])}>
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">{STATUS_LABEL[t.status]}</td>
                    <td className={cn("px-3 py-2.5", due === "overdue" && "font-medium text-danger", due === "soon" && "text-warn")}>
                      {t.due_date ? formatDate(t.due_date) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </StateSwitch>
    </div>
  );
}

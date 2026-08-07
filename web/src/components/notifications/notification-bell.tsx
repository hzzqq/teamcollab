"use client";

import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsQueryKey } from "@/hooks/use-notifications";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NotificationItem, NotificationType } from "@/lib/api-types";

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  task_assigned: UserPlus,
  task_moved: ArrowRightLeft,
  comment_added: MessageSquare,
  task_due_soon: CalendarClock,
};

function notificationText(n: NotificationItem): string {
  const title = String(n.payload?.task_title || "任务");
  switch (n.type) {
    case "task_assigned":
      return `你被分配了任务「${title}」`;
    case "task_moved":
      return `任务「${title}」状态已更新`;
    case "comment_added":
      return `任务「${title}」有新评论@了你`;
    case "task_due_soon":
      return `任务「${title}」即将到期`;
    default:
      return title;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotifications();
  const unread = data?.items.filter((n) => !n.is_read).length ?? 0;

  function handleOpen(n: NotificationItem) {
    const boardId = String(n.payload?.board_id || "");
    const taskId = String(n.payload?.task_id || "");
    if (boardId) {
      router.push(taskId ? `/boards/${boardId}?task=${taskId}` : `/boards/${boardId}`);
    }
  }

  function markAllRead() {
    const previous = data;
    // 乐观更新：先改缓存，后端落库失败再回滚
    qc.setQueryData(notificationsQueryKey(), (old: typeof data) => {
      if (!old) return old;
      return { ...old, items: old.items.map((n) => ({ ...n, is_read: true })) };
    });
    api.markAllRead().catch(() => {
      if (previous) {
        qc.setQueryData(notificationsQueryKey(), previous);
      }
      qc.invalidateQueries({ queryKey: notificationsQueryKey() });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`通知（${unread} 条未读）`}>
          <Bell size={20} strokeWidth={1.5} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium text-fg">通知</p>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead}>
              <CheckCheck size={14} strokeWidth={1.5} />
              全部已读
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <BellOff size={24} strokeWidth={1.5} className="text-muted" />
            <p className="text-sm text-fg">通知加载失败</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              重试
            </Button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <BellOff size={24} strokeWidth={1.5} className="text-muted" />
            <p className="text-sm text-fg">暂无通知</p>
            <p className="text-xs text-muted">被分配、被@或任务到期时会在这里提醒你</p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="divide-y divide-border-soft">
              {data.items.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleOpen(n)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-warm",
                      !n.is_read && "bg-primary-50 dark:bg-surface-warm",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        !n.is_read ? "bg-primary-100 text-primary-700 dark:bg-surface-warm" : "bg-surface-warm text-muted",
                      )}
                    >
                      <Icon size={14} strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-fg">{notificationText(n)}</span>
                      <span className="block text-xs text-meta">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.is_read ? <span className="mt-2 size-2 shrink-0 rounded-full bg-danger" /> : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/boards/")) return "看板";
  if (pathname.startsWith("/me/tasks")) return "我的任务";
  if (pathname.includes("/members")) return "团队成员";
  if (pathname === "/login" || pathname === "/register") return "";
  return "任务协作";
}

/** 顶部视图栏 56px（DESIGN.md §4.7）：面包屑 + 通知铃 + 用户菜单 */
export function TopBar() {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-base font-medium text-fg">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle className="hidden md:inline-flex" />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

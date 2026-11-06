"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/boards/")) return "看板";
  if (pathname === "/boards") return "团队看板";
  if (pathname.startsWith("/me/tasks")) return "我的任务";
  if (pathname === "/projects") return "项目";
  if (pathname.startsWith("/admin")) return "管理后台";
  if (pathname.includes("/settings")) return "团队设置";
  if (pathname.includes("/members")) return "团队成员";
  if (pathname === "/login" || pathname === "/register") return "";
  return "任务协作";
}

/** 顶部视图栏 64px（成熟 SaaS 布局规范）：面包屑 + 通知铃 + 用户菜单 */
export function TopBar() {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
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

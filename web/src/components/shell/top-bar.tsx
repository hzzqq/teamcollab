"use client";

import { usePathname } from "next/navigation";
import { Keyboard, Search } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
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

/** 顶部视图栏 64px（成熟 SaaS 布局规范）：面包屑 + 搜索 + 通知铃 + 用户菜单 */
export function TopBar({
  onOpenSearch,
  onOpenHelp,
}: {
  onOpenSearch: () => void;
  onOpenHelp: () => void;
}) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-base font-medium text-fg">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="打开全局搜索"
          className="hidden h-8 items-center gap-2 rounded-[var(--radius-input)] border border-border bg-surface-warm px-2.5 text-xs text-muted transition-colors duration-fast hover:border-primary-500 hover:text-fg md:flex"
        >
          <Search size={14} strokeWidth={1.5} />
          <span>搜索任务…</span>
          <kbd className="rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-meta">
            ⌘K
          </kbd>
        </button>
        <Button variant="ghost" size="iconSm" onClick={onOpenSearch} aria-label="打开全局搜索" className="md:hidden">
          <Search size={16} strokeWidth={1.5} />
        </Button>
        <Button variant="ghost" size="iconSm" onClick={onOpenHelp} aria-label="快捷键帮助" className="hidden md:inline-flex">
          <Keyboard size={16} strokeWidth={1.5} />
        </Button>
        <ThemeToggle className="hidden md:inline-flex" />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

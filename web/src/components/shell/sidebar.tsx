"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChevronsLeftRight,
  FolderKanban,
  ListChecks,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/use-me";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TeamSwitcher } from "./team-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * 导航项（对齐 DESIGN.md §4.7 的 6 项）。
 *
 * - 我的任务 / 看板 / 成员：Spec §7 页面表中的真实页面
 * - 项目：Spec §2 验收主线里的「项目」即团队实体 —— 本轮补齐为团队列表页
 *   （此前是死链，点击 404）
 *
 * 「收件箱 / 设置」仍不渲染：Spec §7 把通知中心定义为「铃铛 + 下拉面板」全局组件
 * （已实现在 NotificationBell），无独立页面；「设置」无对应页面与后端端点，
 * 按 PROJECT_BOUNDARY.md「扩展位 ≠ 现在就做」不建占位页。
 */
const NAV_ITEMS: NavItem[] = [
  { label: "我的任务", href: "/me/tasks", icon: ListChecks },
  { label: "项目", href: "/projects", icon: FolderKanban },
  { label: "看板", href: "/boards", icon: SquareKanban },
  { label: "成员", href: "/members", icon: Users },
];

/** 把导航项映射到真实路由：
 * - 看板 → /boards（当前团队的看板列表页）
 * - 成员 → /teams/{teamId}/members（成员管理在团队上下文下）
 */
function hrefFor(item: NavItem, teamId?: string) {
  if (item.href === "/boards") return "/boards";
  if (item.href === "/members") return teamId ? `/teams/${teamId}/members` : "/boards";
  return item.href;
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  const teamId = me?.team?.id;

  const visibleItems = NAV_ITEMS;

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-surface transition-[width] duration-base ease-standard shrink-0",
        collapsed ? "w-16" : "w-60",
      )}
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* 顶部：logo + 团队名（可切换）+ 折叠按钮 */}
      <div className={cn("flex h-14 items-center gap-2 border-b border-border px-3", collapsed && "justify-center px-2")}>
        {!collapsed ? (
          <TeamSwitcher collapsed={false} />
        ) : (
          <TeamSwitcher collapsed />
        )}
        {!collapsed ? (
          <Button variant="ghost" size="iconSm" onClick={onToggle} aria-label="折叠侧边栏">
            <ChevronsLeftRight size={16} strokeWidth={1.5} />
          </Button>
        ) : null}
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
          : visibleItems.map((item) => {
              const href = hrefFor(item, teamId);
              const active =
                pathname === href || (href !== "/" && pathname.startsWith(href)) || pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 transition-colors duration-fast",
                    active
                      ? "bg-primary-50 font-medium text-primary-700 dark:bg-surface-warm dark:text-primary-500"
                      : "hover:bg-surface-warm hover:text-fg",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={20} strokeWidth={1.5} className="shrink-0" />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
      </nav>

      {/* 底部：用户 + 主题切换 */}
      <div className={cn("border-t border-border p-2", collapsed && "flex flex-col items-center gap-2")}>
        {!collapsed ? (
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Avatar className="size-7">
              <AvatarFallback>{me ? initials(me.user.display_name) : "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-fg">{me?.user.display_name}</p>
              <p className="truncate text-xs text-meta">{me?.role}</p>
            </div>
            <ThemeToggle />
          </div>
        ) : (
          <ThemeToggle />
        )}
      </div>
    </aside>
  );
}

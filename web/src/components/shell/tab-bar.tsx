"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ListChecks, SquareKanban, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/use-me";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * 已实现的底部导航项（与 Sidebar 的 NAV_ITEMS 保持一致）。
 * DESIGN.md §4.7 的「收件箱 / 项目 / 设置」当前无对应路由，按边界宪法不建占位页面。
 */
const TABS: TabItem[] = [
  { label: "我的任务", href: "/me/tasks", icon: ListChecks },
  { label: "看板", href: "/boards", icon: SquareKanban },
  { label: "成员", href: "/members", icon: Users },
];

/** 映射到真实路由：看板 → /boards 列表页；成员 → /teams/{teamId}/members */
function hrefFor(tab: TabItem, teamId?: string) {
  if (tab.href === "/boards") return "/boards";
  if (tab.href === "/members") return teamId ? `/teams/${teamId}/members` : "/boards";
  return tab.href;
}

/** 移动端底部 TabBar（<768px，≤5 项，DESIGN.md §4.7） */
export function TabBar() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const teamId = me?.team?.id;
  const tabs = TABS.slice(0, 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex h-14 items-stretch border-t border-border bg-surface md:hidden"
      aria-label="底部导航"
    >
      {tabs.map((tab) => {
        const href = hrefFor(tab, teamId);
        // 看板详情页（/boards/{id}）也应点亮「看板」tab
        const active =
          tab.href === "/boards"
            ? pathname.startsWith("/boards")
            : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-fast",
              active ? "text-primary-600" : "text-muted hover:text-fg-2",
            )}
          >
            <Icon size={20} strokeWidth={1.5} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

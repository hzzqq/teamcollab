"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Inbox, ListChecks, Settings, SquareKanban, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe, canAdmin } from "@/hooks/use-me";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const TABS: TabItem[] = [
  { label: "收件箱", href: "/inbox", icon: Inbox },
  { label: "我的任务", href: "/me/tasks", icon: ListChecks },
  { label: "看板", href: "/boards", icon: SquareKanban },
  { label: "成员", href: "/members", icon: Users },
  { label: "设置", href: "/settings", icon: Settings, adminOnly: true },
];

function hrefFor(tab: TabItem, teamId?: string) {
  if (tab.href === "/boards") return teamId ? `/boards/${teamId}` : "/boards";
  if (tab.href === "/members") return teamId ? `/teams/${teamId}/members` : "/members";
  return tab.href;
}

/** 移动端底部 TabBar（<768px，≤5 项，DESIGN.md §4.7） */
export function TabBar() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const teamId = me?.team?.id;
  const isAdmin = canAdmin(me?.role);
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin).slice(0, 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex h-14 items-stretch border-t border-border bg-surface md:hidden"
      aria-label="底部导航"
    >
      {tabs.map((tab) => {
        const href = hrefFor(tab, teamId);
        const active = pathname.startsWith(tab.href);
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

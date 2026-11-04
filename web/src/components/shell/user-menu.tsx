"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { clearTokens } from "@/lib/auth";
import { useMe } from "@/hooks/use-me";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();

  function handleLogout() {
    // 必须先清 React Query 缓存再清 token：queryKey 不含用户维度，
    // 不清缓存会让下一位登录者看到上一位用户的 /me、通知、我的任务数据。
    qc.clear();
    clearTokens();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="用户菜单">
          <Avatar className="size-8">
            <AvatarFallback>{me ? initials(me.user.display_name) : "?"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-medium text-fg">{me?.user.display_name}</p>
          <p className="truncate text-xs font-normal text-meta">{me?.user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut size={16} strokeWidth={1.5} />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

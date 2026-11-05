"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { setActiveTeamId, useMyTeams } from "@/hooks/use-teams";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
  viewer: "只读",
};

/**
 * 团队切换器（侧栏顶部）。
 *
 * Spec §7 的应用外壳含「顶部 logo + 团队名」；多团队时需要能切换当前团队，
 * 否则 /me、看板列表、成员页都锁死在「加入最早的团队」上。
 */
export function TeamSwitcher({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: teams } = useMyTeams();

  if (collapsed) {
    return (
      <div className="flex size-7 items-center justify-center rounded-md bg-primary-600 text-xs font-semibold text-white">
        T
      </div>
    );
  }

  const list = teams ?? [];
  const hasMultiple = list.length > 1;

  function handleSelect(teamId: string) {
    setActiveTeamId(teamId);
    // 切换团队后当前页面（看板/成员等）可能不属于新团队 → 回到看板列表
    router.push("/boards");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1.5"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-600 text-xs font-semibold text-white">
            T
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
            <span className="w-full truncate text-sm font-medium text-fg">
              {me?.team?.name ?? "团队"}
            </span>
            {hasMultiple ? (
              <span className="w-full truncate text-xs text-meta">
                {list.length} 个团队 · 可切换
              </span>
            ) : null}
          </span>
          {hasMultiple ? (
            <ChevronsUpDown size={14} strokeWidth={1.5} className="shrink-0 text-meta" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-meta">切换团队</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-meta">尚未加入任何团队</div>
        ) : (
          list.map(({ team, role }) => (
            <DropdownMenuItem
              key={team.id}
              onClick={() => handleSelect(team.id)}
              className="gap-2"
            >
              <Users size={14} strokeWidth={1.5} className="shrink-0 text-meta" />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              <span className="shrink-0 text-xs text-meta">{ROLE_LABEL[role] ?? role}</span>
              {team.id === me?.team?.id ? (
                <Check size={14} strokeWidth={1.5} className="shrink-0 text-primary-600" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

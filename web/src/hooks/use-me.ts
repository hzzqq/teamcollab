"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { resolveActiveTeam, useMyTeams } from "@/hooks/use-teams";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Role, Team, User } from "@/lib/api-types";

export interface MeData {
  user: User;
  team: Team;
  role: Role;
}

/**
 * 当前用户 + 当前生效团队 + 角色。
 *
 * 用户身份来自 /me；团队与角色来自 /me/teams（支持多团队切换：
 * 手动选中的团队存 localStorage，若已不在成员列表中自动回落第一个团队）。
 *
 * 注意：/me 的 team 字段固定取「加入最早的团队」，无法表达用户当前选择，
 * 因此这里的 team/role 一律以 /me/teams 的解析结果为准。
 */
export function useMe() {
  const qc = useQueryClient();
  // 首屏确定性闸门（替换组件局部 mounted，改用全局 useHydrated）：useMe 是异步数据，
  // SSR 永远没有 me；但同一会话内前序页面若已拉过 /me，React Query 缓存会在 CSR 首帧
  // 同步返回 me，导致由角色 / 团队派生的 UI（侧栏管理员入口、重命名 / 删除看板按钮、
  // 成员页邀请表单、团队设置管理区、用户菜单姓名等）在首屏与 SSR HTML 结构不一致，
  // 触发 React #418（hydration mismatch）。
  // 用 useHydrated 闸门让 SSR 与 CSR 首帧统一为「未就绪」，挂载后再渲染真实身份 UI；
  // 全局标志位还能避免客户端路由跳转时反复闪一下未就绪态（见 use-hydrated.ts）。
  const hydrated = useHydrated();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<{ user: User }> => {
      const res = await api.me();
      return { user: res.user };
    },
    staleTime: 5 * 60_000,
  });
  const teamsQuery = useMyTeams();

  const active = resolveActiveTeam(teamsQuery.data);
  const team: Team | undefined = active
    ? teamsQuery.data?.find((t) => t.team.id === active.teamId)?.team
    : undefined;

  // 切换团队后旧团队的缓存（看板/成员/任务）不再适用 → 清理，
  // 避免切回旧团队时读到陈旧数据。
  const activeTeamId = team?.id;
  const prevTeamIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevTeamIdRef.current;
    prevTeamIdRef.current = activeTeamId;
    if (!prev || !activeTeamId || prev === activeTeamId) return;
    qc.removeQueries({ queryKey: ["boards", prev] });
    qc.removeQueries({ queryKey: ["members", prev] });
    qc.removeQueries({ queryKey: ["board"] });
  }, [activeTeamId, qc]);

  return {
    ...meQuery,
    // useHydrated 闸门：SSR 与 CSR 首帧统一为 undefined，挂载后才有真实身份
    data: hydrated && meQuery.data && team ? { user: meQuery.data.user, team, role: active!.role } : undefined,
    // 平台级超级管理员标记直接取自 /me 的 user，刻意不依赖 team：
    // 无团队用户（如后台新建账号）data 会是 undefined，但不该因此丢失管理员身份判定。
    // 同样受 useHydrated 闸门约束，避免首帧多出一个后台入口造成 hydration 不一致。
    isSuperuser: hydrated ? Boolean(meQuery.data?.user?.is_superuser) : false,
    // 首屏确定性核心：isLoading 也必须闸门。否则缓存命中时 CSR 首帧 isLoading=false
    // （直接渲染内容）而 SSR 恒为 true（骨架屏），StateSwitch 分支不一致触发 #418。
    isLoading: hydrated ? (meQuery.isLoading || teamsQuery.isLoading) : true,
    isError: meQuery.isError || teamsQuery.isError,
    refetch: async () => {
      await Promise.all([meQuery.refetch(), teamsQuery.refetch()]);
    },
  };
}

/** 当前角色是否可写（member+ 可编辑；viewer 只读） */
export function canWrite(role?: Role | null): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

/** 当前角色是否为 admin+（邀请/角色管理/删除看板） */
export function canAdmin(role?: Role | null): boolean {
  return role === "owner" || role === "admin";
}

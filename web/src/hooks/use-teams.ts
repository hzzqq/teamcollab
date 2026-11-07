"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHydrated } from "@/hooks/use-hydrated";

/** 当前用户所属的全部团队及角色 */
export function useMyTeams() {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: ["my-teams"],
    queryFn: () => api.meTeams(),
    staleTime: 5 * 60_000,
  });
  // 首屏闸门：缓存命中时 CSR 首帧 isLoading 会直接变 false 而 SSR 恒为 true，
  // StateSwitch 会因此渲染内容 vs 骨架屏不一致（React #418）。挂载前强制 isLoading=true。
  return { ...query, isLoading: hydrated ? query.isLoading : true };
}

export { resolveActiveTeam, setActiveTeamId, readActiveTeamId } from "@/lib/active-team";

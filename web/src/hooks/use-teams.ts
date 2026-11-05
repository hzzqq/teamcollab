"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** 当前用户所属的全部团队及角色 */
export function useMyTeams() {
  return useQuery({
    queryKey: ["my-teams"],
    queryFn: () => api.meTeams(),
    staleTime: 5 * 60_000,
  });
}

export { resolveActiveTeam, setActiveTeamId, readActiveTeamId } from "@/lib/active-team";

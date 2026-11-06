"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function adminTeamsQueryKey() {
  return ["admin", "teams"];
}

export function useAdminTeams(enabled = true) {
  return useQuery({
    queryKey: adminTeamsQueryKey(),
    queryFn: () => api.adminTeams(),
    enabled,
  });
}

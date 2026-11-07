"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Role } from "@/lib/api-types";

export function membersQueryKey(teamId: string) {
  return ["members", teamId];
}

export function useMembers(teamId: string) {
  // 局部 mounted 闸门：缓存命中时 CSR 首帧 isLoading 直接变 false 而 SSR 恒为 true，
  // StateSwitch 内容 vs 骨架屏不一致（React #418）。挂载前强制 isLoading=true。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const query = useQuery({
    queryKey: membersQueryKey(teamId),
    queryFn: () => api.members(teamId),
    enabled: Boolean(teamId),
  });
  return { ...query, isLoading: mounted ? query.isLoading : true };
}

export function useInviteMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { email: string; role: Role }) => api.inviteMember(teamId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersQueryKey(teamId) }),
  });
}

export function useUpdateMemberRole(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.updateMemberRole(teamId, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersQueryKey(teamId) }),
  });
}

export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(teamId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersQueryKey(teamId) }),
  });
}

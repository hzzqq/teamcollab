"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Role } from "@/lib/api-types";

export function membersQueryKey(teamId: string) {
  return ["members", teamId];
}

export function useMembers(teamId: string) {
  return useQuery({
    queryKey: membersQueryKey(teamId),
    queryFn: () => api.members(teamId),
    enabled: Boolean(teamId),
  });
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

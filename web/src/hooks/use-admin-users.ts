"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminCreateUserRequest, AdminUpdateUserRequest } from "@/lib/api-types";

export function adminUsersQueryKey() {
  return ["admin", "users"];
}

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: adminUsersQueryKey(),
    queryFn: () => api.adminUsers(),
    enabled,
  });
}

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AdminCreateUserRequest) => api.adminCreateUser(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminUsersQueryKey() }),
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, req }: { userId: string; req: AdminUpdateUserRequest }) =>
      api.adminUpdateUser(userId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminUsersQueryKey() }),
  });
}

export function useAdminResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      api.adminResetPassword(userId, newPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminUsersQueryKey() }),
  });
}

export function useAdminDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.adminDeleteUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminUsersQueryKey() }),
  });
}

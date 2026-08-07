"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Role, Team, User } from "@/lib/api-types";

export interface MeData {
  user: User;
  team: Team;
  role: Role;
}

/** 当前用户 + 团队 + 角色（应用外壳/权限判断共用） */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeData> => api.me(),
    staleTime: 5 * 60_000,
  });
}

/** 当前角色是否可写（member+ 可编辑；viewer 只读） */
export function canWrite(role?: Role | null): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

/** 当前角色是否为 admin+（邀请/角色管理/删除看板） */
export function canAdmin(role?: Role | null): boolean {
  return role === "owner" || role === "admin";
}

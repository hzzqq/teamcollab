"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Task } from "@/lib/api-types";
import { isOverdue } from "@/lib/format";

export interface MyTasksParams {
  status?: string;
  q?: string;
  page: number;
  limit: number;
}

/** 我的任务（跨项目聚合，逾期置顶 AC-06） */
export function useMyTasks(params: MyTasksParams) {
  return useQuery({
    queryKey: ["me-tasks", params],
    queryFn: async () => {
      const res = await api.meTasks({
        status: params.status || undefined,
        q: params.q || undefined,
        page: params.page,
        limit: params.limit,
      });
      // 逾期置顶（AC-06）：前端按 due_date 处理
      const sorted = [...res.items].sort((a, b) => {
        const aOver = isOverdue(a.due_date, a.status) ? 0 : 1;
        const bOver = isOverdue(b.due_date, b.status) ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        return 0;
      });
      return { ...res, items: sorted };
    },
  });
}

export function useMyTasksAll(): Task[] | undefined {
  const { data } = useMyTasks({ page: 1, limit: 100 });
  return data?.items;
}

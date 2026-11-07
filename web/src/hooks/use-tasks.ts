"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isOverdue } from "@/lib/format";

export interface MyTasksParams {
  status?: string;
  q?: string;
  page: number;
  limit: number;
}

/** 我的任务（跨项目聚合，逾期置顶 AC-06） */
export function useMyTasks(params: MyTasksParams) {
  // 局部 mounted 闸门：缓存命中时 CSR 首帧 isLoading 直接变 false 而 SSR 恒为 true，
  // StateSwitch 内容 vs 骨架屏不一致（React #418）。挂载前强制 isLoading=true。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const query = useQuery({
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
  return { ...query, isLoading: mounted ? query.isLoading : true };
}

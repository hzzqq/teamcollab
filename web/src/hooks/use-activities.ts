"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function activitiesQueryKey(taskId: string) {
  return ["task-activities", taskId];
}

/** 任务活动流时间线（Drawer 用，viewer+ 可读） */
export function useActivities(taskId: string | null) {
  return useQuery({
    queryKey: ["task-activities", taskId],
    queryFn: () => api.activities(taskId as string),
    enabled: Boolean(taskId),
  });
}

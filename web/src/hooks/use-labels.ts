"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Label } from "@/lib/api-types";

export function labelsQueryKey(teamId: string) {
  return ["labels", teamId];
}

/** 团队标签列表（viewer+） */
export function useLabels(teamId: string) {
  return useQuery({
    queryKey: labelsQueryKey(teamId),
    queryFn: () => api.labels(teamId),
    enabled: Boolean(teamId),
  });
}

/** 整体覆盖任务标签（member+） */
export function useAssignTaskLabels(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, labelIds }: { taskId: string; labelIds: string[] }) =>
      api.assignTaskLabels(taskId, labelIds),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      qc.invalidateQueries({ queryKey: ["task", vars.taskId] });
      qc.invalidateQueries({ queryKey: ["me-tasks"] });
    },
  });
}

export type { Label };

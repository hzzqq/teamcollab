"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Label, LabelColor, UpdateLabelRequest } from "@/lib/api-types";

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

/** 新建标签（admin+） */
export function useCreateLabel(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { name: string; color?: LabelColor }) => api.createLabel(teamId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelsQueryKey(teamId) }),
  });
}

/** 更新标签（admin+，重命名 / 改色） */
export function useUpdateLabel(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, req }: { labelId: string; req: UpdateLabelRequest }) =>
      api.updateLabel(teamId, labelId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelsQueryKey(teamId) }),
  });
}

/** 删除标签（admin+） */
export function useDeleteLabel(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => api.deleteLabel(teamId, labelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelsQueryKey(teamId) }),
  });
}

export type { Label };

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Label, LabelColor, UpdateLabelRequest } from "@/lib/api-types";

export function labelsQueryKey(teamId: string) {
  return ["labels", teamId];
}

/** 团队标签列表（viewer+） */
export function useLabels(teamId: string) {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: labelsQueryKey(teamId),
    queryFn: () => api.labels(teamId),
    enabled: Boolean(teamId),
  });
  // 首屏闸门：缓存命中时 CSR 首帧 isLoading 直接变 false 而 SSR 恒为 true，
  // StateSwitch 内容 vs 骨架屏不一致（React #418）。挂载前强制 isLoading=true。
  return { ...query, isLoading: hydrated ? query.isLoading : true };
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
      qc.invalidateQueries({ queryKey: ["task-activities", vars.taskId] });
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

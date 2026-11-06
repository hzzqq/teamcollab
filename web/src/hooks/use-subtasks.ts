"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { boardQueryKey } from "@/hooks/use-board";
import type { SubtaskCreateRequest, UpdateTaskRequest } from "@/lib/api-types";

export function subtasksQueryKey(taskId: string) {
  return ["subtasks", taskId];
}

/** 某任务的直接子任务列表（按创建时间升序） */
export function useSubtasks(taskId: string | null) {
  return useQuery({
    queryKey: subtasksQueryKey(taskId as string),
    queryFn: () => api.listSubtasks(taskId as string),
    enabled: Boolean(taskId),
  });
}

/** 创建子任务（member+）：刷新子任务列表与看板详情（更新父任务子任务数） */
export function useCreateSubtask(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SubtaskCreateRequest) => api.createSubtask(taskId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subtasksQueryKey(taskId) });
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}

/** 切换子任务完成态（member+）：用 updateTask 改 status */
export function useToggleSubtask(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateTaskRequest["status"] }) =>
      api.updateTask(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subtasksQueryKey(taskId) });
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}

/** 删除子任务（member+） */
export function useDeleteSubtask(taskId: string, boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subtasksQueryKey(taskId) });
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}

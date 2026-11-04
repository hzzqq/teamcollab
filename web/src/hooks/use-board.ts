"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { applyOptimisticMove } from "@/lib/drag-position";
import type { BoardDetail, CreateTaskRequest, MoveTaskRequest } from "@/lib/api-types";

export function boardQueryKey(boardId: string) {
  return ["board", boardId];
}

export function boardsQueryKey(teamId: string) {
  return ["boards", teamId];
}

/** 团队的看板列表 */
export function useBoards(teamId: string) {
  return useQuery({
    queryKey: boardsQueryKey(teamId),
    queryFn: () => api.teamsBoards(teamId),
    enabled: Boolean(teamId),
  });
}

export function useCreateBoard(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createBoard(teamId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardsQueryKey(teamId) }),
  });
}

/** 看板详情（列 + 任务） */
export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardQueryKey(boardId),
    queryFn: () => api.boardDetail(boardId),
    enabled: Boolean(boardId),
  });
}

export function useCreateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createColumn(boardId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}

export function useCreateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTaskRequest) => api.createTask(boardId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: ["me-tasks"] });
    },
  });
}

export function useUpdateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, req }: { taskId: string; req: Parameters<typeof api.updateTask>[1] }) =>
      api.updateTask(taskId, req),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: ["task", updated.id] });
      qc.invalidateQueries({ queryKey: ["me-tasks"] });
    },
  });
}

export function useDeleteTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
      qc.invalidateQueries({ queryKey: ["me-tasks"] });
    },
  });
}

/** 拖拽落位（乐观更新 + 失败回滚，AC-14） */
export function useMoveTask(boardId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ columnId, taskId, req }: { columnId: string; taskId: string; req: MoveTaskRequest }) =>
      api.moveTask(boardId, columnId, taskId, req),
    onMutate: async ({ taskId, req }) => {
      await qc.cancelQueries({ queryKey: boardQueryKey(boardId) });
      const previous = qc.getQueryData<BoardDetail>(boardQueryKey(boardId));
      if (previous) {
        qc.setQueryData<BoardDetail>(boardQueryKey(boardId), (old) => {
          if (!old) return old;
          // 乐观更新走纯函数（与后端落位口径一致，同列/跨列统一处理）
          const columns = applyOptimisticMove(
            old.columns,
            taskId,
            req.target_column_id,
            req.position,
          );
          return { ...old, columns };
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(boardQueryKey(boardId), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardQueryKey(boardId) });
    },
  });
}

/** 任务详情（Drawer 用） */
export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.taskDetail(taskId as string),
    enabled: Boolean(taskId),
  });
}

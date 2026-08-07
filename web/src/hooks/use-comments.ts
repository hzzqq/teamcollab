"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateCommentRequest } from "@/lib/api-types";

export function commentsQueryKey(taskId: string) {
  return ["comments", taskId];
}

/** 任务评论列表 */
export function useComments(taskId: string) {
  return useQuery({
    queryKey: commentsQueryKey(taskId),
    queryFn: () => api.comments(taskId),
    enabled: Boolean(taskId),
  });
}

/** 发评论（@提及检测在服务端完成，前端仅提交内容） */
export function useCreateComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateCommentRequest) => api.createComment(taskId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commentsQueryKey(taskId) });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

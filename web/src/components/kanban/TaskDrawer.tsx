"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Trash2, X } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { useMembers } from "@/hooks/use-members";
import { useTaskDetail, useUpdateTask, useDeleteTask } from "@/hooks/use-board";
import { useComments, useCreateComment } from "@/hooks/use-comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CommentComposer } from "@/components/kanban/comment-composer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HighlightMentions } from "@/components/common/highlight-mentions";
import { timeAgo } from "@/lib/format";
import { initials } from "@/lib/utils";
import type { Priority, TaskStatus } from "@/lib/api-types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export function TaskDrawer({
  taskId,
  boardId,
  onClose,
}: {
  taskId: string | null;
  boardId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: members } = useMembers(me?.team?.id || "");

  const { data: task, isLoading } = useTaskDetail(taskId);
  const updateTask = useUpdateTask(boardId);
  const deleteTask = useDeleteTask(boardId);
  const { data: comments, isLoading: commentsLoading } = useComments(taskId || "");
  const createComment = useCreateComment(taskId || "");

  const [title, setTitle] = useState("");
  const knownNames = new Set((members ?? []).map((m) => m.user.display_name));

  useEffect(() => {
    setTitle(task?.title ?? "");
  }, [task?.id, task?.title]);

  function handleDelete() {
    if (!task) return;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        onClose();
        router.replace(`/boards/${boardId}`);
      },
    });
  }

  const open = Boolean(taskId);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[1200] flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="任务详情"
        >
          <div
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
            aria-hidden
          />
          <div className="relative flex h-full w-full max-w-[480px] flex-col border-l border-border bg-surface shadow-raised animate-in slide-in-from-right">
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-xs text-meta">任务详情</span>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
                <X size={18} strokeWidth={1.5} />
              </Button>
            </div>

            {isLoading || !task ? (
              <div className="flex-1 p-6 text-sm text-muted">加载中…</div>
            ) : (
              <div className="flex-1 overflow-auto">
                {/* 标题 */}
                <div className="border-b border-border px-4 py-3">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => title.trim() && title !== task.title && updateTask.mutate({ taskId: task.id, req: { title: title.trim() } })}
                    className="border-0 px-0 text-base font-medium focus-visible:ring-0"
                  />
                </div>

                {/* 字段 */}
                <div className="grid grid-cols-2 gap-3 px-4 py-3">
                  <Field label="状态">
                    <Select
                      value={task.status}
                      onValueChange={(v) => updateTask.mutate({ taskId: task.id, req: { status: v as TaskStatus } })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="优先级">
                    <Select
                      value={task.priority}
                      onValueChange={(v) => updateTask.mutate({ taskId: task.id, req: { priority: v as Priority } })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["low", "medium", "high", "urgent"] as Priority[]).map((p) => (
                          <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="负责人">
                    <Select
                      value={task.assignee_id || "none"}
                      onValueChange={(v) => updateTask.mutate({ taskId: task.id, req: { assignee_id: v === "none" ? null : v } })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">未分配</SelectItem>
                        {members?.map((m) => (
                          <SelectItem key={m.user.id} value={m.user.id}>{m.user.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="截止日期">
                    <Input
                      type="date"
                      value={task.due_date || ""}
                      onChange={(e) => updateTask.mutate({ taskId: task.id, req: { due_date: e.target.value || null } })}
                    />
                  </Field>
                </div>

                {/* 描述 */}
                <div className="px-4 py-3">
                  <Field label="描述">
                    <Textarea
                      defaultValue={task.description || ""}
                      placeholder="补充任务背景、验收标准…"
                      onBlur={(e) => e.target.value !== (task.description || "") && updateTask.mutate({ taskId: task.id, req: { description: e.target.value || null } })}
                      rows={3}
                    />
                  </Field>
                </div>

                {/* 评论 */}
                <div className="border-t border-border px-4 py-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-meta">
                    <Flag size={14} strokeWidth={1.5} /> 评论
                  </p>
                  <div className="mb-2 max-h-64 space-y-3 overflow-auto">
                    {commentsLoading ? (
                      <p className="text-xs text-meta">加载中…</p>
                    ) : comments && comments.items.length > 0 ? (
                      comments.items.map((c) => (
                        <div key={c.id} className="flex gap-2">
                          <Avatar className="size-6"><AvatarFallback>{initials(c.author.display_name)}</AvatarFallback></Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-fg">
                              <span className="font-medium">{c.author.display_name}</span>{" "}
                              <span className="text-meta">{timeAgo(c.created_at)}</span>
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm text-fg-2">
                              <HighlightMentions content={c.content} knownNames={knownNames} />
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-meta">还没有评论，@同事 提及他们。</p>
                    )}
                  </div>
                  <CommentComposer
                    members={members}
                    onSend={async (content) => {
                      await createComment.mutateAsync({ content });
                    }}
                    pending={createComment.isPending}
                  />
                </div>
              </div>
            )}

            {/* 底部删除（member+ 显示） */}
            {task && me && (me.role === "owner" || me.role === "admin" || me.role === "member") ? (
              <div className="border-t border-border px-4 py-3">
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger/10"
                  onClick={handleDelete}
                  disabled={deleteTask.isPending}
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                  删除任务
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-meta">{label}</span>
      {children}
    </label>
  );
}

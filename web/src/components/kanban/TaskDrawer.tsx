"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Circle,
  Copy,
  Flag,
  History,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMe, canWrite } from "@/hooks/use-me";
import { useMembers } from "@/hooks/use-members";
import {
  useTaskDetail,
  useUpdateTask,
  useDeleteTask,
  useCreateTask,
  useBoards,
  useMoveTaskToBoard,
} from "@/hooks/use-board";
import { api } from "@/lib/api";
import { useLabels, useAssignTaskLabels } from "@/hooks/use-labels";
import { useComments, useCreateComment } from "@/hooks/use-comments";
import { useActivities } from "@/hooks/use-activities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildDuplicateRequest, checklistProgress, newChecklistItem, shortTaskId } from "@/lib/task-detail";
import { activityIcon, formatActivity, type ActivityIcon } from "@/lib/activity-format";
import { CommentComposer } from "@/components/kanban/comment-composer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { HighlightMentions } from "@/components/common/highlight-mentions";
import { timeAgo } from "@/lib/format";
import { cn, initials } from "@/lib/utils";
import type { ChecklistItem, Priority, TaskStatus } from "@/lib/api-types";

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
  const createTask = useCreateTask(boardId);
  const { data: comments, isLoading: commentsLoading } = useComments(taskId || "");
  const createComment = useCreateComment(taskId || "");
  const { data: activityData, isLoading: activitiesLoading } = useActivities(taskId);
  const { data: teamBoards } = useBoards(me?.team?.id || "");
  const moveToBoard = useMoveTaskToBoard();

  const writable = canWrite(me?.role);
  const teamId = me?.team?.id || "";
  const { data: teamLabels } = useLabels(teamId);
  const assignLabels = useAssignTaskLabels(boardId);

  const [title, setTitle] = useState("");
  const [newItem, setNewItem] = useState("");
  const [showAllActivities, setShowAllActivities] = useState(false);
  const knownNames = new Set((members ?? []).map((m) => m.user.display_name));
  const progress = checklistProgress(task?.checklist);
  const activities = activityData?.items ?? [];
  const visibleActivities = showAllActivities ? activities : activities.slice(0, 5);

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

  async function handleMoveToBoard(targetBoardId: string) {
    if (!task || targetBoardId === task.board_id) return;
    try {
      const detail = await api.boardDetail(targetBoardId);
      const firstColumn = detail.columns[0];
      if (!firstColumn) {
        toast.error("目标看板还没有列，请先创建");
        return;
      }
      await moveToBoard.mutateAsync({
        taskId: task.id,
        req: { board_id: targetBoardId, column_id: firstColumn.id, position: 0 },
      });
      toast.success(`已移动到「${detail.name}」`);
      router.push(`/boards/${targetBoardId}?task=${task.id}`);
    } catch {
      toast.error("移动失败，请重试");
    }
  }

  async function handleDuplicate() {
    if (!task) return;
    try {
      const dup = await createTask.mutateAsync(buildDuplicateRequest(task));
      toast.success("已复制任务");
      router.push(`/boards/${boardId}?task=${dup.id}`);
    } catch {
      toast.error("复制失败，请重试");
    }
  }

  const open = Boolean(taskId);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="side" aria-label="任务详情">
        {/* 头部 */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xs font-medium text-meta">任务详情</DialogTitle>
            {task ? <span className="font-mono text-xs text-meta">#{shortTaskId(task.id)}</span> : null}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={!task || createTask.isPending} aria-label="复制任务">
              <Copy size={14} strokeWidth={1.5} /> 复制
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
              <X size={18} strokeWidth={1.5} />
            </Button>
          </div>
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
                  <Field label="任务编号">
                    <div className="flex h-10 items-center gap-1 rounded-[var(--radius-input)] border border-border bg-surface-warm px-3">
                      <span className="font-mono text-sm text-fg-2">#{shortTaskId(task.id)}</span>
                      <button
                        type="button"
                        aria-label="复制任务编号"
                        onClick={() => {
                          const text = `#${shortTaskId(task.id)}`;
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(text)
                              .then(() => toast.success("任务编号已复制"))
                              .catch(() => toast.error("复制失败"));
                          }
                        }}
                        className="ml-auto rounded-sm p-1 text-meta transition-colors hover:text-fg"
                      >
                        <Copy size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  </Field>
                  <Field label="开始日期">
                    <Input
                      type="date"
                      aria-label="开始日期"
                      value={task.start_date || ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        if (v && task.due_date && v > task.due_date) {
                          toast.error("开始日期不能晚于截止日期");
                          return;
                        }
                        updateTask.mutate({ taskId: task.id, req: { start_date: v } });
                      }}
                    />
                  </Field>
                  <Field label="截止日期">
                    <Input
                      type="date"
                      aria-label="截止日期"
                      value={task.due_date || ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        if (v && task.start_date && v < task.start_date) {
                          toast.error("截止日期不能早于开始日期");
                          return;
                        }
                        updateTask.mutate({ taskId: task.id, req: { due_date: v } });
                      }}
                    />
                  </Field>
                </div>

                {/* 跨看板移动（同团队，自动落到目标看板第一列） */}
                <div className="px-4 pb-1">
                  <Field label="所属看板">
                    <Select
                      value=""
                      onValueChange={handleMoveToBoard}
                      disabled={!writable || moveToBoard.isPending}
                    >
                      <SelectTrigger aria-label="移动到看板">
                        <SelectValue placeholder={task.board_name || "选择其他看板…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(teamBoards || [])
                          .filter((b) => b.id !== task.board_id)
                          .map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        {(teamBoards || []).filter((b) => b.id !== task.board_id).length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-meta">暂无其他看板</div>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* 标签（整体覆盖式赋值，member+） */}
                <div className="px-4 pb-1">
                  <Field label="标签">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(teamLabels || []).map((l) => {
                        const active = (task.labels || []).some((x) => x.id === l.id);
                        const c = `var(--color-tag-${l.color})`;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              const next = new Set((task.labels || []).map((x) => x.id));
                              if (active) next.delete(l.id);
                              else next.add(l.id);
                              assignLabels.mutate({ taskId: task.id, labelIds: [...next] });
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-medium transition-colors duration-fast",
                              active ? "border-transparent" : "border-border hover:border-primary-500",
                            )}
                            style={active ? { backgroundColor: `color-mix(in oklab, ${c} 18%, var(--surface))`, color: c } : undefined}
                          >
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
                            {l.name}
                          </button>
                        );
                      })}
                      {(teamLabels || []).length === 0 ? (
                        <span className="text-xs text-meta">暂无可用的团队标签</span>
                      ) : null}
                    </div>
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

                {/* 子任务清单 */}
                <div className="border-t border-border px-4 py-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-meta">
                    <ListChecks size={14} strokeWidth={1.5} /> 子任务
                    {progress.total > 0 ? (
                      <span className="ml-auto font-normal">{progress.done}/{progress.total} 已完成</span>
                    ) : null}
                  </p>
                  <div className="mb-2 space-y-1.5">
                    {(task.checklist || []).map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={item.done}
                          aria-label={`勾选 ${item.text}`}
                          onCheckedChange={(checked) => {
                            const next: ChecklistItem[] = (task.checklist || []).map((x) =>
                              x.id === item.id ? { ...x, done: checked === true } : x,
                            );
                            updateTask.mutate({ taskId: task.id, req: { checklist: next } });
                          }}
                        />
                        <span className={cn("min-w-0 flex-1 truncate text-sm", item.done ? "text-meta line-through" : "text-fg-2")}>
                          {item.text}
                        </span>
                        <button
                          type="button"
                          aria-label={`删除子任务 ${item.text}`}
                          onClick={() => {
                            const next = (task.checklist || []).filter((x) => x.id !== item.id);
                            updateTask.mutate({ taskId: task.id, req: { checklist: next } });
                          }}
                          className="rounded-sm p-1 text-meta transition-colors hover:text-danger"
                        >
                          <X size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                    {(task.checklist || []).length === 0 ? (
                      <p className="text-xs text-meta">还没有子任务，拆解一下更容易推进。</p>
                    ) : null}
                  </div>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = newItem.trim();
                      if (!text) return;
                      const next = [...(task.checklist || []), newChecklistItem(text)];
                      if (next.length > 50) {
                        toast.error("子任务最多 50 项");
                        return;
                      }
                      updateTask.mutate({ taskId: task.id, req: { checklist: next } });
                      setNewItem("");
                    }}
                  >
                    <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="添加子任务…" aria-label="新子任务内容" />
                    <Button type="submit" size="sm" variant="secondary" aria-label="添加子任务">
                      <Plus size={14} strokeWidth={1.5} />
                    </Button>
                  </form>
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

                {/* 活动记录（操作日志时间线） */}
                <div className="border-t border-border px-4 py-3" aria-label="活动记录">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-meta">
                    <History size={14} strokeWidth={1.5} /> 活动
                    {activityData && activityData.total > 0 ? (
                      <span className="ml-auto font-normal">共 {activityData.total} 条</span>
                    ) : null}
                  </p>
                  {activitiesLoading ? (
                    <p className="text-xs text-meta">加载中…</p>
                  ) : activities.length > 0 ? (
                    <>
                      <ol className="relative ml-1.5 space-y-3 border-l border-border pl-4">
                        {visibleActivities.map((a) => (
                          <li key={a.id} className="relative" data-testid="activity-row">
                            <span className="absolute -left-6 top-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-surface text-meta">
                              <ActivityGlyph kind={activityIcon(a.action)} />
                            </span>
                            <p className="text-xs leading-relaxed text-fg">
                              <span className="font-medium">{a.actor_name}</span>{" "}
                              <span className="text-fg-2">{formatActivity(a)}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-meta">{timeAgo(a.created_at)}</p>
                          </li>
                        ))}
                      </ol>
                      {activities.length > 5 && !showAllActivities ? (
                        <button
                          type="button"
                          onClick={() => setShowAllActivities(true)}
                          className="mt-3 text-xs text-primary-600 hover:underline"
                        >
                          显示全部 {activities.length} 条
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-meta">暂无活动记录，改动任务后会在这里留痕。</p>
                  )}
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
      </DialogContent>
    </Dialog>
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

function ActivityGlyph({ kind }: { kind: ActivityIcon }) {
  const props = { size: 10, strokeWidth: 1.75 } as const;
  if (kind === "plus") return <Plus {...props} />;
  if (kind === "edit") return <Pencil {...props} />;
  if (kind === "move") return <ArrowRight {...props} />;
  if (kind === "message") return <MessageSquare {...props} />;
  return <Circle {...props} />;
}

/* ============================================================
   activity-format.ts — 活动日志 → 时间线文案（纯函数，可单测）

   后端 old_value / new_value 已是可读的审计文本（status 中文 / 人名 / 列名），
   这里只负责拼句子、字段名翻译和长文本裁剪，不反查任何接口。
   ============================================================ */
import type { TaskActivity, TaskActivityAction } from "./api-types";

export const ACTIVITY_FIELD_LABELS: Record<string, string> = {
  title: "标题",
  description: "描述",
  status: "状态",
  priority: "优先级",
  assignee_id: "负责人",
  column_id: "所属列",
  column: "所属列",
  start_date: "开始日期",
  due_date: "截止日期",
  labels: "标签",
  checklist: "子任务",
  comment: "评论",
};

export type ActivityIcon = "plus" | "edit" | "move" | "message" | "dot";

export const ACTIVITY_ICONS: Record<TaskActivityAction, ActivityIcon> = {
  created: "plus",
  field_changed: "edit",
  moved: "move",
  comment_added: "message",
};

/** 长文本裁剪（时间线是单行摘要，不撑破布局） */
export function clipActivityValue(value: string | null | undefined, max = 60): string {
  const text = (value ?? "").trim();
  if (!text) return "空";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function activityIcon(action: TaskActivityAction): ActivityIcon {
  return ACTIVITY_ICONS[action] ?? "dot";
}

/** 返回「动作短语」，与 actor_name / 相对时间分开渲染 */
export function formatActivity(activity: TaskActivity): string {
  const oldValue = clipActivityValue(activity.old_value);
  const newValue = clipActivityValue(activity.new_value);

  switch (activity.action) {
    case "created":
      return `创建了任务「${newValue}」`;
    case "moved":
      return `把任务从「${oldValue}」移动到「${newValue}」`;
    case "comment_added":
      return "添加了评论";
    case "field_changed": {
      const label = ACTIVITY_FIELD_LABELS[activity.field ?? ""] || activity.field || "字段";
      return `把${label}从「${oldValue}」改为「${newValue}」`;
    }
    default:
      return "更新了任务";
  }
}

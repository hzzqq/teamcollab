/* ============================================================
   mock/data.ts — 前端 mock 数据源（后端未就绪时先行渲染验证）
   NEXT_PUBLIC_API_MODE=mock 时启用（默认）
   ============================================================ */
import type {
  Board,
  BoardColumn,
  BoardColumnWithTasks,
  Comment,
  Label,
  Member,
  NotificationItem,
  SavedView,
  Task,
  TaskActivity,
  Team,
  User,
} from "@/lib/api-types";

export interface MockDb {
  users: User[];
  teams: Team[];
  members: Record<string, Member[]>; // teamId -> members
  boards: Board[];
  columns: Record<string, BoardColumn[]>; // boardId -> columns
  tasks: Record<string, Task[]>; // columnId -> tasks
  comments: Record<string, Comment[]>; // taskId -> comments
  activities: Record<string, TaskActivity[]>; // taskId -> 活动日志（最新在前）
  labels: Record<string, Label[]>; // teamId -> labels（团队级）
  views: SavedView[]; // 团队级命名视图（按创建时间升序）
  notifications: NotificationItem[];
  session: { access: string; refresh: string; userId: string } | null;
}

const now = new Date().toISOString();
const today = new Date().toISOString().slice(0, 10);

function dayOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/* 真实感种子数据（避免 John Doe 类占位名） */
export const seedUsers: User[] = [
  { id: "u-pm", email: "pm@example.com", display_name: "沈知远", is_superuser: true, created_at: now },
  { id: "u-dev", email: "dev@example.com", display_name: "林晚晴", is_superuser: false, created_at: now },
  { id: "u-ds", email: "design@example.com", display_name: "顾南乔", is_superuser: false, created_at: now },
  { id: "u-op", email: "ops@example.com", display_name: "陆之遥", is_superuser: false, created_at: now },
];

export const seedTeam: Team = {
  id: "t-1",
  name: "岚图研发部",
  created_at: now,
};

export function seedDb(): MockDb {
  const board: Board = {
    id: "b-1",
    team_id: "t-1",
    name: "Q3 产品迭代",
    created_at: now,
    updated_at: now,
  };

  const cols: BoardColumn[] = [
    { id: "c-todo", board_id: "b-1", name: "待办", position: 0, created_at: now, updated_at: now },
    { id: "c-prog", board_id: "b-1", name: "进行中", position: 1, created_at: now, updated_at: now },
    { id: "c-done", board_id: "b-1", name: "已完成", position: 2, created_at: now, updated_at: now },
  ];

  const mk = (
    id: string,
    columnId: string,
    title: string,
    assigneeId: string | null,
    priority: Task["priority"],
    status: Task["status"],
    due: string | null,
    position: number,
    description: string | null = null,
  ): Task => ({
    id,
    board_id: "b-1",
    board_name: "Q3 产品迭代",
    column_id: columnId,
    title,
    description,
    assignee_id: assigneeId,
    assignee: assigneeId
      ? { id: assigneeId, display_name: seedUsers.find((u) => u.id === assigneeId)?.display_name || "" }
      : null,
    priority,
    status,
    position,
    due_date: due,
    start_date: null,
    created_by: "u-pm",
    created_at: now,
    updated_at: now,
    labels: [],
    checklist: [],
    parent_id: null,
    subtask_count: 0,
  });

  const tasks: Record<string, Task[]> = {
    "c-todo": [
      mk("tk-1", "c-todo", "梳理 Q3 版本需求并输出评审文档", "u-dev", "urgent", "todo", dayOffset(1), 0, "与运营对齐客户反馈，收敛高优需求清单。"),
      mk("tk-2", "c-todo", "看板拖拽性能优化（1000 卡流畅）", "u-dev", "high", "todo", dayOffset(4), 1, "虚拟滚动与稳定 id 方案评估。"),
      mk("tk-3", "c-todo", "新成员 onboarding 流程设计", "u-ds", "medium", "todo", dayOffset(6), 2, "覆盖注册、邀请、首次建板。"),
      mk("tk-4", "c-todo", "迁移历史数据到新表结构", null, "low", "todo", dayOffset(12), 3),
    ],
    "c-prog": [
      mk("tk-5", "c-prog", "通知中心 SSE 联调", "u-dev", "high", "in_progress", dayOffset(-1), 0, "断线重连与未读计数同步。"),
      mk("tk-6", "c-prog", "权限体系 RBAC 落地验证", "u-pm", "urgent", "in_progress", today, 1, "owner/admin/member/viewer 四角色矩阵验收。"),
      mk("tk-7", "c-prog", "设计 Token 双主题走查", "u-ds", "medium", "in_progress", dayOffset(2), 2, "深浅色对比度与层级逐页核对。"),
    ],
    "c-done": [
      mk("tk-8", "c-done", "注册登录流程打通", "u-dev", "high", "done", dayOffset(-5), 0),
      mk("tk-9", "c-done", "看板基础列与卡片渲染", "u-dev", "medium", "done", dayOffset(-7), 1),
    ],
  };

  const comments: Record<string, Comment[]> = {
    "tk-5": [
      {
        id: "cm-1",
        task_id: "tk-5",
        author: { id: "u-dev", display_name: "林晚晴" },
        content: "已确认是网关缓冲问题，改成 text/event-stream 直通即可。",
        mentions: ["u-pm"],
        created_at: now,
      },
    ],
  };

  // 活动流种子：与真实后端同构（审计文本已可读），数组最新在前
  const activities: Record<string, TaskActivity[]> = {
    "tk-1": [
      {
        id: "ac-3", task_id: "tk-1", actor_id: "u-dev", actor_name: "林晚晴",
        action: "comment_added", field: null, old_value: null,
        new_value: "需求池已同步，今天下午对齐优先级", created_at: minutesAgo(35),
      },
      {
        id: "ac-2", task_id: "tk-1", actor_id: "u-pm", actor_name: "沈知远",
        action: "field_changed", field: "priority", old_value: "中", new_value: "紧急",
        created_at: minutesAgo(180),
      },
      {
        id: "ac-1", task_id: "tk-1", actor_id: "u-pm", actor_name: "沈知远",
        action: "created", field: null, old_value: null,
        new_value: "梳理 Q3 版本需求并输出评审文档", created_at: minutesAgo(1440),
      },
    ],
    "tk-5": [
      {
        id: "ac-5", task_id: "tk-5", actor_id: "u-dev", actor_name: "林晚晴",
        action: "moved", field: "column", old_value: "待办", new_value: "进行中",
        created_at: minutesAgo(90),
      },
      {
        id: "ac-4", task_id: "tk-5", actor_id: "u-pm", actor_name: "沈知远",
        action: "created", field: null, old_value: null,
        new_value: "通知中心 SSE 联调", created_at: minutesAgo(2880),
      },
    ],
  };

  const notifications: NotificationItem[] = [
    {
      id: "n-1",
      team_id: "t-1",
      type: "task_assigned",
      payload: { task_id: "tk-1", task_title: "梳理 Q3 版本需求并输出评审文档", board_id: "b-1", actor_id: "u-pm" },
      is_read: false,
      created_at: now,
    },
    {
      id: "n-2",
      team_id: "t-1",
      type: "task_due_soon",
      payload: { task_id: "tk-6", task_title: "权限体系 RBAC 落地验证", due_date: today },
      is_read: false,
      created_at: now,
    },
  ];

  const labels: Record<string, Label[]> = {
    "t-1": [
      { id: "lb-bug", team_id: "t-1", name: "缺陷", color: "rose", created_at: now, updated_at: now },
      { id: "lb-feat", team_id: "t-1", name: "需求", color: "blue", created_at: now, updated_at: now },
      { id: "lb-design", team_id: "t-1", name: "设计", color: "amber", created_at: now, updated_at: now },
      { id: "lb-infra", team_id: "t-1", name: "基建", color: "green", created_at: now, updated_at: now },
    ],
  };

  return {
    users: [...seedUsers],
    teams: [{ ...seedTeam }],
    members: {
      "t-1": [
        { user: seedUsers[0], role: "owner", created_at: now },
        { user: seedUsers[1], role: "admin", created_at: now },
        { user: seedUsers[2], role: "member", created_at: now },
        { user: seedUsers[3], role: "viewer", created_at: now },
      ],
    },
    boards: [board],
    columns: { "b-1": cols },
    tasks,
    comments,
    activities,
    labels,
    views: [],
    notifications,
    session: null,
  };
}

/**
 * 取指定看板的列 + 任务（mock 模式）。
 *
 * 必须按 boardId 取列 —— 早期实现硬编码 db.columns["b-1"]，
 * 导致「新建看板」打开后仍显示 b-1 的三列（mock/real 行为漂移）。
 */
export function taskToColumns(db: MockDb, boardId: string): BoardColumnWithTasks[] {
  // 一次性统计每个顶层任务的直接子任务数，与真实后端 board_service 同口径
  const childCount: Record<string, number> = {};
  for (const colTasks of Object.values(db.tasks)) {
    for (const t of colTasks) {
      if (t.parent_id) childCount[t.parent_id] = (childCount[t.parent_id] || 0) + 1;
    }
  }
  return (db.columns[boardId] || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      ...c,
      tasks: (db.tasks[c.id] || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ ...t, subtask_count: childCount[t.id] || 0 })),
    }));
}

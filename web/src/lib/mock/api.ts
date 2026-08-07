/* ============================================================
   mock/api.ts — mock 后端实现（模拟 150ms 延迟 + 深拷贝）
   镜像 openapi-v2.yaml 端点形状，前端零改动切换真实后端
   ============================================================ */
import type {
  ApiEnvelope,
  AuthResponse,
  Board,
  BoardDetail,
  Comment,
  CreateCommentRequest,
  CreateTaskRequest,
  InviteMemberRequest,
  Member,
  MoveTaskRequest,
  NotificationItem,
  Paginated,
  RefreshResponse,
  RegisterRequest,
  Role,
  Task,
  Team,
  UpdateTaskRequest,
  User,
} from "@/lib/api-types";
import { seedDb, taskToColumns, type MockDb } from "./data";

const LATENCY = 150;
let db: MockDb = seedDb();
let tokenSeq = 0;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), LATENCY));
}

function ok<T>(data: T): ApiEnvelope<T> {
  return { code: 0, data, message: "" };
}

function err(code: number, message: string): ApiEnvelope<never> {
  return { code, data: null as never, message };
}

function currentUser(): User {
  const id = db.session?.userId || "u-pm";
  return db.users.find((u) => u.id === id) || db.users[0];
}

export const mockApi = {
  reset() {
    db = seedDb();
  },

  async register(req: RegisterRequest): Promise<ApiEnvelope<AuthResponse>> {
    const exists = db.users.some((u) => u.email === req.email);
    if (exists) return delay(err(40901, "该邮箱已被注册"));
    const user: User = {
      id: `u-${++tokenSeq}`,
      email: req.email,
      display_name: req.display_name,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    db.members["t-1"] = [
      { user, role: "owner", created_at: new Date().toISOString() },
      ...db.members["t-1"],
    ];
    db.session = {
      access: `mock-access-${++tokenSeq}`,
      refresh: `mock-refresh-${tokenSeq}`,
      userId: user.id,
    };
    return delay(ok({ user, team: db.teams[0], role: "owner", access_token: db.session.access, refresh_token: db.session.refresh, token_type: "bearer", expires_in: 900 }));
  },

  async login(username: string, password: string): Promise<ApiEnvelope<AuthResponse>> {
    const user = db.users.find((u) => u.email === username);
    if (!user || password.length < 4) return delay(err(40101, "邮箱或密码错误"));
    db.session = { access: `mock-access-${++tokenSeq}`, refresh: `mock-refresh-${tokenSeq}`, userId: user.id };
    const member = db.members["t-1"].find((m) => m.user.id === user.id);
    return delay(ok({ user, team: db.teams[0], role: member?.role || "member", access_token: db.session.access, refresh_token: db.session.refresh, token_type: "bearer", expires_in: 900 }));
  },

  async refresh(refresh_token: string): Promise<ApiEnvelope<RefreshResponse>> {
    if (!refresh_token) return delay(err(40101, "登录已过期，请重新登录"));
    return delay(ok({ access_token: `mock-access-${++tokenSeq}`, token_type: "bearer", expires_in: 900 }));
  },

  async me(): Promise<ApiEnvelope<{ user: User; team: Team; role: Role }>> {
    const user = currentUser();
    const member = db.members["t-1"].find((m) => m.user.id === user.id);
    return delay(ok({ user, team: db.teams[0], role: member?.role || "member" }));
  },

  async meTasks(params: { status?: string; q?: string; page?: number; limit?: number }): Promise<ApiEnvelope<Paginated<Task>>> {
    const user = currentUser();
    let items = Object.values(db.tasks)
      .flat()
      .filter((t) => t.assignee_id === user.id);
    if (params.status) items = items.filter((t) => t.status === params.status);
    if (params.q) {
      const q = params.q.toLowerCase();
      items = items.filter((t) => t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q));
    }
    const total = items.length;
    const page = params.page || 1;
    const limit = params.limit || 20;
    const sliced = items.slice((page - 1) * limit, page * limit);
    return delay(ok({ items: sliced, total, page, limit, hasMore: page * limit < total }));
  },

  async teamsBoards(teamId: string): Promise<ApiEnvelope<Board[]>> {
    return delay(ok(db.boards.filter((b) => b.team_id === teamId)));
  },

  async createBoard(teamId: string, name: string): Promise<ApiEnvelope<Board>> {
    const board: Board = {
      id: `b-${++tokenSeq}`,
      team_id: teamId,
      name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.boards.push(board);
    db.columns[board.id] = [
      { id: `c-${tokenSeq}-1`, board_id: board.id, name: "待办", position: 0, created_at: board.created_at, updated_at: board.created_at },
      { id: `c-${tokenSeq}-2`, board_id: board.id, name: "进行中", position: 1, created_at: board.created_at, updated_at: board.created_at },
      { id: `c-${tokenSeq}-3`, board_id: board.id, name: "已完成", position: 2, created_at: board.created_at, updated_at: board.created_at },
    ];
    db.tasks = { ...db.tasks, [`c-${tokenSeq}-1`]: [], [`c-${tokenSeq}-2`]: [], [`c-${tokenSeq}-3`]: [] };
    return delay(ok(board));
  },

  async boardDetail(boardId: string): Promise<ApiEnvelope<BoardDetail>> {
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return delay(err(40401, "看板不存在"));
    return delay(ok({ ...board, columns: taskToColumns(db).map((c) => ({ ...c, board_id: boardId })) }));
  },

  async createColumn(boardId: string, name: string): Promise<ApiEnvelope<BoardDetail["columns"][number]>> {
    const cols = db.columns[boardId] || [];
    const col = { id: `c-${++tokenSeq}`, board_id: boardId, name, position: cols.length, tasks: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.columns[boardId] = [...cols, col];
    db.tasks[col.id] = [];
    return delay(ok(col));
  },

  async createTask(boardId: string, req: CreateTaskRequest): Promise<ApiEnvelope<Task>> {
    const task: Task = {
      id: `tk-${++tokenSeq}`,
      board_id: boardId,
      board_name: db.boards.find((b) => b.id === boardId)?.name,
      column_id: req.column_id,
      title: req.title,
      description: req.description ?? null,
      assignee_id: req.assignee_id ?? null,
      assignee: req.assignee_id
        ? { id: req.assignee_id, display_name: db.users.find((u) => u.id === req.assignee_id)?.display_name || "" }
        : null,
      priority: req.priority || "medium",
      status: req.status || "todo",
      position: (db.tasks[req.column_id] || []).length,
      due_date: req.due_date ?? null,
      start_date: req.start_date ?? null,
      created_by: currentUser().id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.tasks[req.column_id] = [...(db.tasks[req.column_id] || []), task];
    return delay(ok(task));
  },

  async taskDetail(taskId: string): Promise<ApiEnvelope<Task>> {
    const task = Object.values(db.tasks).flat().find((t) => t.id === taskId);
    if (!task) return delay(err(40401, "任务不存在"));
    return delay(ok(task));
  },

  async updateTask(taskId: string, req: UpdateTaskRequest): Promise<ApiEnvelope<Task>> {
    const all = Object.values(db.tasks).flat();
    const idx = all.findIndex((t) => t.id === taskId);
    if (idx < 0) return delay(err(40401, "任务不存在"));
    const updated = { ...all[idx], ...req, updated_at: new Date().toISOString() };
    if (req.assignee_id !== undefined) {
      updated.assignee = req.assignee_id ? { id: req.assignee_id, display_name: db.users.find((u) => u.id === req.assignee_id)?.display_name || "" } : null;
    }
    for (const key of Object.keys(db.tasks)) {
      db.tasks[key] = db.tasks[key].map((t) => (t.id === taskId ? updated : t));
    }
    return delay(ok(updated));
  },

  async deleteTask(taskId: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    for (const key of Object.keys(db.tasks)) {
      db.tasks[key] = db.tasks[key].filter((t) => t.id !== taskId);
    }
    return delay(ok({ ok: true }));
  },

  async moveTask(boardId: string, columnId: string, taskId: string, req: MoveTaskRequest): Promise<ApiEnvelope<Task>> {
    let moved: Task | null = null;
    for (const key of Object.keys(db.tasks)) {
      const found = db.tasks[key].find((t) => t.id === taskId);
      if (found) {
        moved = found;
        db.tasks[key] = db.tasks[key].filter((t) => t.id !== taskId);
      }
    }
    if (!moved) return delay(err(40401, "任务不存在"));
    const target = db.tasks[req.target_column_id] || [];
    const pos = Math.max(0, Math.min(req.position, target.length));
    target.splice(pos, 0, { ...moved, column_id: req.target_column_id, position: pos, updated_at: new Date().toISOString() });
    db.tasks[req.target_column_id] = target;
    return delay(ok(target[pos]));
  },

  async comments(taskId: string): Promise<ApiEnvelope<Paginated<Comment>>> {
    const items = db.comments[taskId] || [];
    return delay(ok({ items, total: items.length, page: 1, limit: 20, hasMore: false }));
  },

  async createComment(taskId: string, req: CreateCommentRequest): Promise<ApiEnvelope<Comment>> {
    const comment: Comment = {
      id: `cm-${++tokenSeq}`,
      task_id: taskId,
      author: { id: currentUser().id, display_name: currentUser().display_name },
      content: req.content,
      mentions: [],
      created_at: new Date().toISOString(),
    };
    db.comments[taskId] = [...(db.comments[taskId] || []), comment];
    return delay(ok(comment));
  },

  async members(teamId: string): Promise<ApiEnvelope<Member[]>> {
    return delay(ok(db.members[teamId] || []));
  },

  async inviteMember(teamId: string, req: InviteMemberRequest): Promise<ApiEnvelope<Member>> {
    const existing = db.users.find((u) => u.email === req.email);
    if (!existing) return delay(err(40001, "该邮箱尚未注册平台"));
    if ((db.members[teamId] || []).some((m) => m.user.id === existing.id)) return delay(err(40901, "该成员已在团队中"));
    const member: Member = { user: existing, role: req.role, created_at: new Date().toISOString() };
    db.members[teamId] = [...(db.members[teamId] || []), member];
    return delay(ok(member));
  },

  async updateMemberRole(teamId: string, userId: string, role: Role): Promise<ApiEnvelope<Member>> {
    const list = db.members[teamId] || [];
    const idx = list.findIndex((m) => m.user.id === userId);
    if (idx < 0) return delay(err(40401, "成员不存在"));
    if (list[idx].role === "owner") return delay(err(40001, "owner 角色不可修改"));
    const updated = { ...list[idx], role };
    db.members[teamId] = list.map((m, i) => (i === idx ? updated : m));
    return delay(ok(updated));
  },

  async removeMember(teamId: string, userId: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    const list = db.members[teamId] || [];
    const target = list.find((m) => m.user.id === userId);
    if (!target) return delay(err(40401, "成员不存在"));
    if (target.role === "owner") return delay(err(40301, "owner 不可被移除"));
    db.members[teamId] = list.filter((m) => m.user.id !== userId);
    return delay(ok({ ok: true }));
  },

  async notifications(params: { page?: number; limit?: number }): Promise<ApiEnvelope<Paginated<NotificationItem>>> {
    const items = db.notifications;
    const page = params.page || 1;
    const limit = params.limit || 20;
    return delay(ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit, hasMore: page * limit < items.length }));
  },

  async markAllRead(): Promise<ApiEnvelope<{ ok: boolean; updated: number }>> {
    const updated = db.notifications.filter((n) => !n.is_read).length;
    db.notifications = db.notifications.map((n) => ({ ...n, is_read: true }));
    return delay(ok({ ok: true, updated }));
  },
};

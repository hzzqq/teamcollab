/* ============================================================
   mock/api.ts — mock 后端实现（模拟 150ms 延迟 + 深拷贝）
   镜像 openapi-v2.yaml 端点形状，前端零改动切换真实后端
   ============================================================ */
import type {
  AdminCreateUserRequest,
  AdminTeam,
  AdminUpdateUserRequest,
  AdminUser,
  ActivityList,
  ApiEnvelope,
  AuthResponse,
  Board,
  BoardDetail,
  Comment,
  CreateCommentRequest,
  CreateLabelRequest,
  CreateTaskRequest,
  InviteMemberRequest,
  Label,
  Member,
  MoveTaskRequest,
  Paginated,
  PaginatedNotifications,
  RefreshResponse,
  RegisterRequest,
  Role,
  SearchResult,
  Task,
  TaskActivity,
  TaskActivityAction,
  Team,
  UpdateLabelRequest,
  UpdateTaskRequest,
  User,
  UserTeam,
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

/* ---------------- 活动流埋点（与真实后端同构） ---------------- */

let activitySeq = 0;

type ActivityPatch = {
  action: TaskActivityAction;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
};

function logActivity(taskId: string, patch: ActivityPatch): void {
  const user = currentUser();
  const row: TaskActivity = {
    id: `ac-${++tokenSeq}`,
    task_id: taskId,
    actor_id: user.id,
    actor_name: user.display_name,
    action: patch.action,
    field: patch.field ?? null,
    old_value: patch.old_value ?? null,
    new_value: patch.new_value ?? null,
    // 同一次操作可能连写多条，毫秒递增保证倒序稳定
    created_at: new Date(Date.now() + ++activitySeq).toISOString(),
  };
  db.activities[taskId] = [row, ...(db.activities[taskId] || [])];
}

const MOCK_TRACKED_FIELDS = [
  "title", "description", "status", "priority", "assignee_id", "column_id",
  "start_date", "due_date", "labels", "checklist",
] as const;
const STATUS_TEXT: Record<string, string> = { todo: "待办", in_progress: "进行中", done: "已完成" };
const PRIORITY_TEXT: Record<string, string> = { low: "低", medium: "中", high: "高", urgent: "紧急" };

/** 把字段值转成审计文本（与后端 task_activity_service.describe 同口径） */
function readableValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "空";
  if (field === "status") return STATUS_TEXT[String(value)] ?? String(value);
  if (field === "priority") return PRIORITY_TEXT[String(value)] ?? String(value);
  if (field === "assignee_id") {
    return db.users.find((u) => u.id === value)?.display_name ?? "已移除的账号";
  }
  if (field === "column_id") {
    return Object.values(db.columns).flat().find((c) => c.id === value)?.name ?? "已删除的列";
  }
  const text = String(value).trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text || "空";
}

function checklistSummary(task: Task): string | null {
  const items = task.checklist || [];
  return items.length ? `${items.filter((i) => i.done).length}/${items.length} 已完成` : null;
}

function logTaskChanges(taskId: string, before: Task, after: Task): void {
  for (const field of MOCK_TRACKED_FIELDS) {
    let oldRaw: unknown;
    let newRaw: unknown;
    if (field === "labels") {
      oldRaw = (before.labels || []).map((l) => l.name).join("、") || null;
      newRaw = (after.labels || []).map((l) => l.name).join("、") || null;
    } else if (field === "checklist") {
      oldRaw = checklistSummary(before);
      newRaw = checklistSummary(after);
    } else {
      oldRaw = (before as unknown as Record<string, unknown>)[field];
      newRaw = (after as unknown as Record<string, unknown>)[field];
    }
    if (oldRaw === newRaw) continue;
    logActivity(taskId, {
      action: "field_changed",
      field,
      old_value: readableValue(field, oldRaw),
      new_value: readableValue(field, newRaw),
    });
  }
}

function columnName(columnId: string): string {
  return Object.values(db.columns).flat().find((c) => c.id === columnId)?.name ?? "已删除的列";
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
      is_superuser: false,
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

  async meTeams(): Promise<ApiEnvelope<UserTeam[]>> {
    const user = currentUser();
    const out: UserTeam[] = [];
    for (const [teamId, members] of Object.entries(db.members)) {
      const team = db.teams.find((t) => t.id === teamId);
      if (!team) continue;
      const m = members.find((x) => x.user.id === user.id);
      if (!m) continue;
      out.push({ team, role: m.role });
    }
    return delay(ok(out.length > 0 ? out : [{ team: db.teams[0], role: "member" }]));
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

  /** 与 /api/v1/search 契约一致：只返回当前用户所属团队的任务 / 看板 */
  async search(q: string, limit = 8): Promise<ApiEnvelope<SearchResult>> {
    const query = q.trim();
    if (!query) return delay(ok({ query, tasks: [], boards: [] }));

    const user = currentUser();
    const teamIds = Object.entries(db.members)
      .filter(([, members]) => members.some((m) => m.user.id === user.id))
      .map(([teamId]) => teamId);
    const boards = db.boards.filter((b) => teamIds.includes(b.team_id));
    const boardById = new Map(boards.map((b) => [b.id, b]));
    const teamById = new Map(db.teams.map((t) => [t.id, t]));
    const columnById = new Map<string, { name: string }>();
    for (const b of boards) {
      for (const c of db.columns[b.id] || []) columnById.set(c.id, c);
    }

    const needle = query.toLowerCase();
    const tasks = Object.values(db.tasks)
      .flat()
      .filter((t) => boardById.has(t.board_id))
      .filter(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          (t.description || "").toLowerCase().includes(needle),
      )
      .slice(0, limit)
      .map((t) => {
        const board = boardById.get(t.board_id)!;
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          board_id: t.board_id,
          board_name: board.name,
          team_id: board.team_id,
          team_name: teamById.get(board.team_id)?.name || "",
          column_id: t.column_id,
          column_name: columnById.get(t.column_id)?.name || "",
          priority: t.priority,
          status: t.status,
          due_date: t.due_date,
        };
      });
    const boardHits = boards
      .filter((b) => b.name.toLowerCase().includes(needle))
      .slice(0, limit)
      .map((b) => ({
        id: b.id,
        name: b.name,
        team_id: b.team_id,
        team_name: teamById.get(b.team_id)?.name || "",
      }));
    return delay(ok({ query, tasks, boards: boardHits }));
  },

  async teamsBoards(teamId: string): Promise<ApiEnvelope<Board[]>> {
    return delay(ok(db.boards.filter((b) => b.team_id === teamId)));
  },

  async createTeam(name: string): Promise<ApiEnvelope<Team>> {
    const team: Team = {
      id: `t-${++tokenSeq}`,
      name,
      created_at: new Date().toISOString(),
    };
    db.teams.push(team);
    // 创建者自动成为 owner（与后端 team_service.create 一致）
    const user = currentUser();
    db.members[team.id] = [{ user, role: "owner", created_at: team.created_at }];
    // 新团队带一组默认列，与建板时一致
    const board: Board = {
      id: `b-${++tokenSeq}`,
      team_id: team.id,
      name: "默认看板",
      created_at: team.created_at,
      updated_at: team.created_at,
    };
    db.boards.push(board);
    db.columns[board.id] = [
      { id: `c-${tokenSeq}-1`, board_id: board.id, name: "待办", position: 0, created_at: board.created_at, updated_at: board.created_at },
      { id: `c-${tokenSeq}-2`, board_id: board.id, name: "进行中", position: 1, created_at: board.created_at, updated_at: board.created_at },
      { id: `c-${tokenSeq}-3`, board_id: board.id, name: "已完成", position: 2, created_at: board.created_at, updated_at: board.created_at },
    ];
    db.tasks = {
      ...db.tasks,
      [`c-${tokenSeq}-1`]: [],
      [`c-${tokenSeq}-2`]: [],
      [`c-${tokenSeq}-3`]: [],
    };
    return delay(ok(team));
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

  async updateBoard(boardId: string, name: string): Promise<ApiEnvelope<Board>> {
    const idx = db.boards.findIndex((b) => b.id === boardId);
    if (idx < 0) return delay(err(40401, "看板不存在"));
    const updated = { ...db.boards[idx], name, updated_at: new Date().toISOString() };
    db.boards = db.boards.map((b, i) => (i === idx ? updated : b));
    return delay(ok(updated));
  },

  async deleteBoard(boardId: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    const target = db.boards.find((b) => b.id === boardId);
    if (!target) return delay(err(40401, "看板不存在"));
    // 级联移除列与任务（镜像后端 ON DELETE CASCADE）
    for (const col of db.columns[boardId] || []) {
      delete db.tasks[col.id];
    }
    delete db.columns[boardId];
    db.boards = db.boards.filter((b) => b.id !== boardId);
    return delay(ok({ ok: true }));
  },

  async boardDetail(boardId: string): Promise<ApiEnvelope<BoardDetail>> {
    const board = db.boards.find((b) => b.id === boardId);
    if (!board) return delay(err(40401, "看板不存在"));
    return delay(ok({ ...board, columns: taskToColumns(db, boardId) }));
  },

  async createColumn(boardId: string, name: string): Promise<ApiEnvelope<BoardDetail["columns"][number]>> {
    const cols = db.columns[boardId] || [];
    const col = { id: `c-${++tokenSeq}`, board_id: boardId, name, position: cols.length, tasks: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.columns[boardId] = [...cols, col];
    db.tasks[col.id] = [];
    return delay(ok(col));
  },

  async updateColumn(columnId: string, req: { name?: string; position?: number }): Promise<ApiEnvelope<BoardDetail["columns"][number]>> {
    for (const boardId of Object.keys(db.columns)) {
      const idx = db.columns[boardId].findIndex((c) => c.id === columnId);
      if (idx >= 0) {
        const updated = {
          ...db.columns[boardId][idx],
          ...(req.name !== undefined ? { name: req.name } : {}),
          ...(req.position !== undefined ? { position: req.position } : {}),
          tasks: (db.tasks[columnId] || []).slice(),
          updated_at: new Date().toISOString(),
        };
        db.columns[boardId] = db.columns[boardId].map((c, i) => (i === idx ? updated : c));
        return delay(ok(updated));
      }
    }
    return delay(err(40401, "列不存在"));
  },

  async deleteColumn(columnId: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    for (const boardId of Object.keys(db.columns)) {
      const col = db.columns[boardId].find((c) => c.id === columnId);
      if (col) {
        // 非空列（含任务）拒绝删除（镜像后端 409 保护）
        if ((db.tasks[columnId] || []).length > 0) {
          return delay(err(40901, "该列仍有任务，请先清空或移动任务后再删除"));
        }
        db.columns[boardId] = db.columns[boardId].filter((c) => c.id !== columnId);
        delete db.tasks[columnId];
        return delay(ok({ ok: true }));
      }
    }
    return delay(err(40401, "列不存在"));
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
      labels: [],
      checklist: req.checklist ?? [],
    };
    db.tasks[req.column_id] = [...(db.tasks[req.column_id] || []), task];
    logActivity(task.id, { action: "created", new_value: task.title });
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
    logTaskChanges(taskId, all[idx], updated);
    return delay(ok(updated));
  },

  /* ---------------- 标签（团队级） ---------------- */

  async labels(teamId: string): Promise<ApiEnvelope<Label[]>> {
    return delay(ok(db.labels[teamId] || []));
  },

  async createLabel(teamId: string, req: CreateLabelRequest): Promise<ApiEnvelope<Label>> {
    const label: Label = {
      id: `lb-${++tokenSeq}`,
      team_id: teamId,
      name: req.name,
      color: req.color || "blue",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.labels[teamId] = [...(db.labels[teamId] || []), label];
    return delay(ok(label));
  },

  async updateLabel(teamId: string, labelId: string, req: UpdateLabelRequest): Promise<ApiEnvelope<Label>> {
    const list = db.labels[teamId] || [];
    const idx = list.findIndex((l) => l.id === labelId);
    if (idx < 0) return delay(err(40401, "标签不存在"));
    const updated: Label = {
      ...list[idx],
      ...(req.name !== undefined ? { name: req.name } : {}),
      ...(req.color !== undefined ? { color: req.color } : {}),
      updated_at: new Date().toISOString(),
    };
    db.labels[teamId] = list.map((l, i) => (i === idx ? updated : l));
    return delay(ok(updated));
  },

  async deleteLabel(teamId: string, labelId: string): Promise<ApiEnvelope<Label>> {
    const list = db.labels[teamId] || [];
    const target = list.find((l) => l.id === labelId);
    if (!target) return delay(err(40401, "标签不存在"));
    db.labels[teamId] = list.filter((l) => l.id !== labelId);
    return delay(ok(target));
  },

  async assignTaskLabels(taskId: string, labelIds: string[]): Promise<ApiEnvelope<Label[]>> {
    const all = Object.values(db.tasks).flat();
    const task = all.find((t) => t.id === taskId);
    if (!task) return delay(err(40401, "任务不存在"));
    const teamId = db.boards.find((b) => b.id === task.board_id)?.team_id || "t-1";
    const teamLabels = db.labels[teamId] || [];
    const assigned = teamLabels.filter((l) => labelIds.includes(l.id));
    for (const key of Object.keys(db.tasks)) {
      db.tasks[key] = db.tasks[key].map((t) => (t.id === taskId ? { ...t, labels: assigned } : t));
    }
    logTaskChanges(taskId, task, { ...task, labels: assigned });
    return delay(ok(assigned));
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
    const fromColumnId = moved.column_id;
    const target = db.tasks[req.target_column_id] || [];
    const pos = Math.max(0, Math.min(req.position, target.length));
    target.splice(pos, 0, { ...moved, column_id: req.target_column_id, position: pos, updated_at: new Date().toISOString() });
    db.tasks[req.target_column_id] = target;
    // 与后端一致：只记跨列移动，同列排序不刷屏
    if (fromColumnId !== req.target_column_id) {
      logActivity(taskId, {
        action: "moved",
        field: "column",
        old_value: columnName(fromColumnId),
        new_value: columnName(req.target_column_id),
      });
    }
    return delay(ok(target[pos]));
  },

  /** 活动流时间线（最新在前，limit 截断但 total 保留全量） */
  async activities(taskId: string, limit = 50): Promise<ApiEnvelope<ActivityList>> {
    const rows = db.activities[taskId] || [];
    return delay(ok({ items: rows.slice(0, limit), total: rows.length }));
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
    logActivity(taskId, { action: "comment_added", new_value: req.content.slice(0, 80) });
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

  async notifications(params: { page?: number; limit?: number }): Promise<ApiEnvelope<PaginatedNotifications>> {
    const items = db.notifications;
    const page = params.page || 1;
    const limit = params.limit || 20;
    // unreadTotal 与后端契约一致：独立于分页的未读总数
    const unreadTotal = items.filter((n) => !n.is_read).length;
    return delay(ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit, hasMore: page * limit < items.length, unreadTotal }));
  },

  async markAllRead(): Promise<ApiEnvelope<{ ok: boolean; updated: number }>> {
    const updated = db.notifications.filter((n) => !n.is_read).length;
    db.notifications = db.notifications.map((n) => ({ ...n, is_read: true }));
    return delay(ok({ ok: true, updated }));
  },

  async markOneRead(notificationId: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    db.notifications = db.notifications.map((n) =>
      n.id === notificationId ? { ...n, is_read: true } : n
    );
    return delay(ok({ ok: true }));
  },

  /* ---------------- 管理员后台（mock 镜像 /admin） ---------------- */

  async adminUsers(): Promise<ApiEnvelope<AdminUser[]>> {
    return delay(ok(structuredClone(db.users)));
  },

  async adminTeams(): Promise<ApiEnvelope<AdminTeam[]>> {
    const out: AdminTeam[] = db.teams.map((t) => ({
      id: t.id,
      name: t.name,
      member_count: db.members[t.id]?.length || 0,
    }));
    return delay(ok(out));
  },

  async adminCreateUser(req: AdminCreateUserRequest): Promise<ApiEnvelope<AdminUser>> {
    if (db.users.some((u) => u.email === req.email)) return delay(err(40901, "该邮箱已注册"));
    const user: User = {
      id: `u-${++tokenSeq}`,
      email: req.email,
      display_name: req.display_name,
      is_superuser: req.is_superuser ?? false,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    return delay(ok(structuredClone(user)));
  },

  async adminUpdateUser(userId: string, req: AdminUpdateUserRequest): Promise<ApiEnvelope<AdminUser>> {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return delay(err(40401, "用户不存在"));
    if (req.is_superuser === false && user.is_superuser && db.users.filter((u) => u.is_superuser).length <= 1) {
      return delay(err(40001, "至少需保留一个超级管理员"));
    }
    if (req.display_name !== undefined) user.display_name = req.display_name;
    if (req.is_superuser !== undefined) user.is_superuser = req.is_superuser;
    return delay(ok(structuredClone(user)));
  },

  async adminResetPassword(userId: string, newPassword: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return delay(err(40401, "用户不存在"));
    // 镜像后端：密码至少 8 位
    if (newPassword.length < 8) return delay(err(40001, "密码至少 8 位"));
    return delay(ok({ ok: true }));
  },

  async adminDeleteUser(userId: string): Promise<ApiEnvelope<{ ok: boolean }>> {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return delay(err(40401, "用户不存在"));
    if (user.id === currentUser().id) return delay(err(40301, "不能删除自己的账号"));
    if (user.is_superuser && db.users.filter((u) => u.is_superuser).length <= 1) {
      return delay(err(40001, "至少需保留一个超级管理员，无法删除最后一个超级管理员"));
    }
    db.users = db.users.filter((u) => u.id !== userId);
    // 同步从各团队成员列表移除
    for (const teamId of Object.keys(db.members)) {
      db.members[teamId] = db.members[teamId].filter((m) => m.user.id !== userId);
    }
    return delay(ok({ ok: true }));
  },
};

/* ============================================================
   api.ts — 统一 API 客户端
   - 统一响应 { code, data, message } 解包：成功返回 data，失败抛 ApiError
   - 错误码映射 40001/40101/40301/40401/40901/42901/50000
   - token 管理：Bearer 附加、401 单飞刷新、刷新失败清 token 跳登录
   - 模式开关：NEXT_PUBLIC_API_MODE = real（默认）| mock
     mock 仅作离线演示 fallback；两者行为必须一致（mock/real 漂移曾是 P0 事故根因）
   ============================================================ */
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setTokens } from "./auth";
import { mockApi } from "./mock/api";
import type {
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  AdminTeam,
  AdminUpdateUserRequest,
  AdminUser,
  ActivityList,
  ApiEnvelope,
  BatchResult,
  BatchTaskRequest,
  AuthResponse,
  Board,
  BoardDetail,
  Comment,
  CreateCommentRequest,
  CreateLabelRequest,
  CreateSavedViewRequest,
  CreateTaskRequest,
  InviteMemberRequest,
  Label,
  Member,
  MoveTaskRequest,
  MoveToBoardRequest,
  Paginated,
  PaginatedNotifications,
  RefreshResponse,
  RegisterRequest,
  Role,
  SavedView,
  SavedViewListData,
  SearchResult,
  SubtaskCreateRequest,
  Task,
  Team,
  UpdateLabelRequest,
  UpdateSavedViewRequest,
  UpdateTaskRequest,
  UserTeam,
} from "./api-types";

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export const ERROR_MESSAGES: Record<number, string> = {
  40001: "请求参数有误",
  40101: "登录已过期，请重新登录",
  40301: "没有操作权限",
  40401: "资源不存在",
  40901: "资源冲突",
  42901: "操作过于频繁，请稍后再试",
  50000: "服务器开小差了，请稍后再试",
};

export const API_MODE: "mock" | "real" =
  (process.env.NEXT_PUBLIC_API_MODE as "mock" | "real" | undefined) || "real";

// API 基址：显式 NEXT_PUBLIC_API_BASE > NEXT_PUBLIC_API_SAME_ORIGIN=1（同源，Docker/nginx 部署用）> 本地直连
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (process.env.NEXT_PUBLIC_API_SAME_ORIGIN === "1" ? "" : "http://localhost:8000");

/* ---------------- 真实请求层 ---------------- */

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      const json = (await res.json()) as ApiEnvelope<RefreshResponse>;
      if (!res.ok || json.code !== 0 || !json.data) return false;
      setAccessToken(json.data.access_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function redirectToLogin(): void {
  clearTokens();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

async function rawRequest<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  opts: { body?: unknown; auth?: boolean; form?: boolean; retried?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = opts.auth !== false ? getAccessToken() : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const init: RequestInit = { method, headers, cache: "no-store" };
  if (opts.body !== undefined) {
    init.body = opts.form ? new URLSearchParams(opts.body as Record<string, string>) : JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "网络连接失败，请检查网络后重试");
  }

  // 401 且未重试过 → 单飞刷新后重试一次。
  // auth:false 的请求（登录/注册）不参与刷新：它们的 401 是「凭证错误」而非
  // 「token 过期」，若走刷新分支会把用户已有的有效会话也一并清掉。
  if (res.status === 401 && !opts.retried && opts.auth !== false) {
    const ok = await refreshAccessToken();
    if (ok) return rawRequest(path, method, { ...opts, retried: true });
    redirectToLogin();
    throw new ApiError(40101, ERROR_MESSAGES[40101]);
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // 非 JSON 响应
  }

  if (!res.ok || !json || json.code !== 0) {
    const code = json?.code || 50000;
    const message = json?.message || ERROR_MESSAGES[code] || "请求失败";
    if (code === 40101) redirectToLogin();
    throw new ApiError(code, message);
  }
  return json.data as T;
}

/* ---------------- 统一 API 门面（mock / real 双通道） ---------------- */

export const api = {
  async register(req: RegisterRequest): Promise<AuthResponse> {
    if (API_MODE === "mock") return unwrap(await mockApi.register(req));
    const data = await rawRequest<AuthResponse>("/api/v1/auth/register", "POST", { body: req, auth: false });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    if (API_MODE === "mock") return unwrap(await mockApi.login(username, password));
    const data = await rawRequest<AuthResponse>("/api/v1/auth/login", "POST", {
      form: true,
      body: { username, password },
      auth: false,
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async me(): Promise<{ user: import("./api-types").User; team: Team; role: Role }> {
    if (API_MODE === "mock") return unwrap(await mockApi.me());
    return rawRequest("/api/v1/me", "GET");
  },

  /** 当前用户所属的全部团队及角色（多团队切换用） */
  async meTeams(): Promise<UserTeam[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.meTeams());
    return rawRequest("/api/v1/me/teams", "GET");
  },

  async meTasks(params: { status?: string; q?: string; page?: number; limit?: number } = {}): Promise<Paginated<Task>> {
    if (API_MODE === "mock") return unwrap(await mockApi.meTasks(params));
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(params.page || 1));
    qs.set("limit", String(params.limit || 20));
    return rawRequest(`/api/v1/me/tasks?${qs}`, "GET");
  },

  /** 跨看板全局搜索（命令面板）；后端按当前用户所属团队做租户隔离 */
  async search(q: string, limit = 8): Promise<SearchResult> {
    if (API_MODE === "mock") return unwrap(await mockApi.search(q, limit));
    const qs = new URLSearchParams({ q, limit: String(limit) });
    return rawRequest(`/api/v1/search?${qs}`, "GET");
  },

  async teamsBoards(teamId: string): Promise<Board[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.teamsBoards(teamId));
    return rawRequest(`/api/v1/teams/${teamId}/boards`, "GET");
  },

  async createTeam(name: string): Promise<Team> {
    if (API_MODE === "mock") return unwrap(await mockApi.createTeam(name));
    return rawRequest("/api/v1/teams", "POST", { body: { name } });
  },

  async createBoard(teamId: string, name: string): Promise<Board> {
    if (API_MODE === "mock") return unwrap(await mockApi.createBoard(teamId, name));
    return rawRequest(`/api/v1/teams/${teamId}/boards`, "POST", { body: { name } });
  },

  /** 重命名看板（member+） */
  async updateBoard(boardId: string, name: string): Promise<Board> {
    if (API_MODE === "mock") return unwrap(await mockApi.updateBoard(boardId, name));
    return rawRequest(`/api/v1/boards/${boardId}`, "PATCH", { body: { name } });
  },

  /** 删除看板（admin+） */
  async deleteBoard(boardId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.deleteBoard(boardId));
    return rawRequest(`/api/v1/boards/${boardId}`, "DELETE");
  },

  async boardDetail(boardId: string): Promise<BoardDetail> {
    if (API_MODE === "mock") return unwrap(await mockApi.boardDetail(boardId));
    return rawRequest(`/api/v1/boards/${boardId}`, "GET");
  },

  async createColumn(boardId: string, name: string): Promise<BoardDetail["columns"][number]> {
    if (API_MODE === "mock") return unwrap(await mockApi.createColumn(boardId, name));
    return rawRequest(`/api/v1/boards/${boardId}/columns`, "POST", { body: { name } });
  },

  /** 重命名/移动列（member+） */
  async updateColumn(columnId: string, req: { name?: string; position?: number }): Promise<BoardDetail["columns"][number]> {
    if (API_MODE === "mock") return unwrap(await mockApi.updateColumn(columnId, req));
    return rawRequest(`/api/v1/columns/${columnId}`, "PATCH", { body: req });
  },

  /** 删除列（admin+，非空列被后端 409 拦截） */
  async deleteColumn(columnId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.deleteColumn(columnId));
    return rawRequest(`/api/v1/columns/${columnId}`, "DELETE");
  },

  async createTask(boardId: string, req: CreateTaskRequest): Promise<Task> {
    if (API_MODE === "mock") return unwrap(await mockApi.createTask(boardId, req));
    return rawRequest(`/api/v1/boards/${boardId}/tasks`, "POST", { body: req });
  },

  async taskDetail(taskId: string): Promise<Task> {
    if (API_MODE === "mock") return unwrap(await mockApi.taskDetail(taskId));
    return rawRequest(`/api/v1/tasks/${taskId}`, "GET");
  },

  async updateTask(taskId: string, req: UpdateTaskRequest): Promise<Task> {
    if (API_MODE === "mock") return unwrap(await mockApi.updateTask(taskId, req));
    return rawRequest(`/api/v1/tasks/${taskId}`, "PATCH", { body: req });
  },

  async deleteTask(taskId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.deleteTask(taskId));
    return rawRequest(`/api/v1/tasks/${taskId}`, "DELETE");
  },

  async moveTask(boardId: string, columnId: string, taskId: string, req: MoveTaskRequest): Promise<Task> {
    if (API_MODE === "mock") return unwrap(await mockApi.moveTask(boardId, columnId, taskId, req));
    return rawRequest(`/api/v1/boards/${boardId}/columns/${columnId}/tasks/${taskId}/position`, "PATCH", { body: req });
  },

  /** 把任务移动到同一团队的另一个看板（目标列必须属于目标看板） */
  async moveTaskToBoard(taskId: string, req: MoveToBoardRequest): Promise<Task> {
    if (API_MODE === "mock") return unwrap(await mockApi.moveTaskToBoard(taskId, req));
    return rawRequest(`/api/v1/tasks/${taskId}/move-to-board`, "POST", { body: req });
  },

  /** 批量改状态/优先级/负责人或删除（任一任务越权整批拒绝） */
  async batchTasks(req: BatchTaskRequest): Promise<BatchResult> {
    if (API_MODE === "mock") return unwrap(await mockApi.batchTasks(req));
    return rawRequest("/api/v1/tasks/batch", "POST", { body: req });
  },

  /** 任务操作日志时间线（viewer+，后端按 created_at 倒序） */
  async activities(taskId: string, limit = 50): Promise<ActivityList> {
    if (API_MODE === "mock") return unwrap(await mockApi.activities(taskId, limit));
    return rawRequest(`/api/v1/tasks/${taskId}/activities?limit=${limit}`, "GET");
  },

  async comments(taskId: string): Promise<Paginated<Comment>> {
    if (API_MODE === "mock") return unwrap(await mockApi.comments(taskId));
    return rawRequest(`/api/v1/tasks/${taskId}/comments`, "GET");
  },

  async createComment(taskId: string, req: CreateCommentRequest): Promise<Comment> {
    if (API_MODE === "mock") return unwrap(await mockApi.createComment(taskId, req));
    return rawRequest(`/api/v1/tasks/${taskId}/comments`, "POST", { body: req });
  },

  async members(teamId: string): Promise<Member[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.members(teamId));
    return rawRequest(`/api/v1/teams/${teamId}/members`, "GET");
  },

  async inviteMember(teamId: string, req: InviteMemberRequest): Promise<Member> {
    if (API_MODE === "mock") return unwrap(await mockApi.inviteMember(teamId, req));
    return rawRequest(`/api/v1/teams/${teamId}/members`, "POST", { body: req });
  },

  async updateMemberRole(teamId: string, userId: string, role: Role): Promise<Member> {
    if (API_MODE === "mock") return unwrap(await mockApi.updateMemberRole(teamId, userId, role));
    return rawRequest(`/api/v1/teams/${teamId}/members/${userId}/role`, "PATCH", { body: { role } });
  },

  async removeMember(teamId: string, userId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.removeMember(teamId, userId));
    return rawRequest(`/api/v1/teams/${teamId}/members/${userId}`, "DELETE");
  },

  async notifications(params: { page?: number; limit?: number } = {}): Promise<PaginatedNotifications> {
    if (API_MODE === "mock") return unwrap(await mockApi.notifications(params));
    const qs = new URLSearchParams({ page: String(params.page || 1), limit: String(params.limit || 20) });
    return rawRequest(`/api/v1/notifications?${qs}`, "GET");
  },

  async markAllRead(): Promise<{ ok: boolean; updated: number }> {
    if (API_MODE === "mock") return unwrap(await mockApi.markAllRead());
    return rawRequest("/api/v1/notifications/read-all", "POST");
  },

  /** 单条通知置已读（限定属主，后端校验） */
  async markOneRead(notificationId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.markOneRead(notificationId));
    return rawRequest(`/api/v1/notifications/${notificationId}/read`, "POST");
  },

  /** 团队标签列表（viewer+） */
  async labels(teamId: string): Promise<Label[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.labels(teamId));
    return rawRequest(`/api/v1/teams/${teamId}/labels`, "GET");
  },

  /** 创建标签（admin+） */
  async createLabel(teamId: string, req: CreateLabelRequest): Promise<Label> {
    if (API_MODE === "mock") return unwrap(await mockApi.createLabel(teamId, req));
    return rawRequest(`/api/v1/teams/${teamId}/labels`, "POST", { body: req });
  },

  /** 更新标签（admin+） */
  async updateLabel(teamId: string, labelId: string, req: UpdateLabelRequest): Promise<Label> {
    if (API_MODE === "mock") return unwrap(await mockApi.updateLabel(teamId, labelId, req));
    return rawRequest(`/api/v1/teams/${teamId}/labels/${labelId}`, "PUT", { body: req });
  },

  /** 删除标签（admin+） */
  async deleteLabel(teamId: string, labelId: string): Promise<Label> {
    if (API_MODE === "mock") return unwrap(await mockApi.deleteLabel(teamId, labelId));
    return rawRequest(`/api/v1/teams/${teamId}/labels/${labelId}`, "DELETE");
  },

  /** 赋值任务标签（整体覆盖，member+） */
  async assignTaskLabels(taskId: string, labelIds: string[]): Promise<Label[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.assignTaskLabels(taskId, labelIds));
    return rawRequest(`/api/v1/tasks/${taskId}/labels`, "PUT", { body: { label_ids: labelIds } });
  },

  /* ---------------- 子任务 / 多层级（方案 A parent_id 树状） ---------------- */

  /** 创建子任务：继承父任务的 board / column，position 追加到列尾（member+） */
  async createSubtask(parentId: string, req: SubtaskCreateRequest): Promise<Task> {
    if (API_MODE === "mock") return unwrap(await mockApi.createSubtask(parentId, req));
    return rawRequest(`/api/v1/tasks/${parentId}/subtasks`, "POST", { body: req });
  },

  /** 列出某任务的直接子任务（viewer+） */
  async listSubtasks(parentId: string): Promise<Task[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.listSubtasks(parentId));
    return rawRequest(`/api/v1/tasks/${parentId}/subtasks`, "GET");
  },

  /* ---------------- 保存视图（团队级命名筛选 + 排序） ---------------- */

  /** 团队全部命名视图（viewer+，按创建时间升序） */
  async listViews(teamId: string): Promise<SavedViewListData> {
    if (API_MODE === "mock") return unwrap(await mockApi.listViews(teamId));
    return rawRequest(`/api/v1/teams/${teamId}/views`, "GET");
  },

  /** 创建命名视图（member+） */
  async createView(teamId: string, req: CreateSavedViewRequest): Promise<SavedView> {
    if (API_MODE === "mock") return unwrap(await mockApi.createView(teamId, req));
    return rawRequest(`/api/v1/teams/${teamId}/views`, "POST", { body: req });
  },

  /** 更新命名视图（owner / 团队管理员） */
  async updateView(teamId: string, viewId: string, req: UpdateSavedViewRequest): Promise<SavedView> {
    if (API_MODE === "mock") return unwrap(await mockApi.updateView(teamId, viewId, req));
    return rawRequest(`/api/v1/teams/${teamId}/views/${viewId}`, "PUT", { body: req });
  },

  /** 删除命名视图（owner / 团队管理员） */
  async deleteView(teamId: string, viewId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.deleteView(teamId, viewId));
    return rawRequest(`/api/v1/teams/${teamId}/views/${viewId}`, "DELETE");
  },

  /** SSE 通知流 URL（EventSource 无法自定义 Header，走 query token） */
  notificationsStreamUrl(): string | null {
    const token = getAccessToken();
    if (!token) return null;
    return `${API_BASE}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`;
  },

  /* ---------------- 管理员后台（超级管理员专属，/admin） ---------------- */

  /** 全量用户列表 */
  async adminUsers(): Promise<AdminUser[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.adminUsers());
    return rawRequest("/api/v1/admin/users", "GET");
  },

  /** 全量团队列表（含成员数） */
  async adminTeams(): Promise<AdminTeam[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.adminTeams());
    return rawRequest("/api/v1/admin/teams", "GET");
  },

  /** 创建用户（可一并设为超级管理员） */
  async adminCreateUser(req: AdminCreateUserRequest): Promise<AdminUser> {
    if (API_MODE === "mock") return unwrap(await mockApi.adminCreateUser(req));
    return rawRequest("/api/v1/admin/users", "POST", { body: req });
  },

  /** 更新用户（改名 / 升降超级管理员） */
  async adminUpdateUser(userId: string, req: AdminUpdateUserRequest): Promise<AdminUser> {
    if (API_MODE === "mock") return unwrap(await mockApi.adminUpdateUser(userId, req));
    return rawRequest(`/api/v1/admin/users/${userId}`, "PATCH", { body: req });
  },

  /** 重置用户密码 */
  async adminResetPassword(userId: string, newPassword: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.adminResetPassword(userId, newPassword));
    const body: AdminResetPasswordRequest = { new_password: newPassword };
    return rawRequest(`/api/v1/admin/users/${userId}/reset-password`, "POST", { body });
  },

  /** 删除用户 */
  async adminDeleteUser(userId: string): Promise<{ ok: boolean }> {
    if (API_MODE === "mock") return unwrap(await mockApi.adminDeleteUser(userId));
    return rawRequest(`/api/v1/admin/users/${userId}`, "DELETE");
  },
};

function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message || ERROR_MESSAGES[envelope.code] || "请求失败");
  return envelope.data as T;
}

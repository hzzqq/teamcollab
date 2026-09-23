/* ============================================================
   api.ts — 统一 API 客户端
   - 统一响应 { code, data, message } 解包：成功返回 data，失败抛 ApiError
   - 错误码映射 40001/40101/40301/40401/40901/42901/50000
   - token 管理：Bearer 附加、401 单飞刷新、刷新失败清 token 跳登录
   - 模式开关：NEXT_PUBLIC_API_MODE = mock(默认) | real
   ============================================================ */
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setTokens } from "./auth";
import { mockApi } from "./mock/api";
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
  method: "GET" | "POST" | "PATCH" | "DELETE",
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

  // 401 且未重试过 → 单飞刷新后重试一次
  if (res.status === 401 && !opts.retried) {
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
  mode: API_MODE,

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

  async meTasks(params: { status?: string; q?: string; page?: number; limit?: number } = {}): Promise<Paginated<Task>> {
    if (API_MODE === "mock") return unwrap(await mockApi.meTasks(params));
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(params.page || 1));
    qs.set("limit", String(params.limit || 20));
    return rawRequest(`/api/v1/me/tasks?${qs}`, "GET");
  },

  async teamsBoards(teamId: string): Promise<Board[]> {
    if (API_MODE === "mock") return unwrap(await mockApi.teamsBoards(teamId));
    return rawRequest(`/api/v1/teams/${teamId}/boards`, "GET");
  },

  async createBoard(teamId: string, name: string): Promise<Board> {
    if (API_MODE === "mock") return unwrap(await mockApi.createBoard(teamId, name));
    return rawRequest(`/api/v1/teams/${teamId}/boards`, "POST", { body: { name } });
  },

  async boardDetail(boardId: string): Promise<BoardDetail> {
    if (API_MODE === "mock") return unwrap(await mockApi.boardDetail(boardId));
    return rawRequest(`/api/v1/boards/${boardId}`, "GET");
  },

  async createColumn(boardId: string, name: string): Promise<BoardDetail["columns"][number]> {
    if (API_MODE === "mock") return unwrap(await mockApi.createColumn(boardId, name));
    return rawRequest(`/api/v1/boards/${boardId}/columns`, "POST", { body: { name } });
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

  async notifications(params: { page?: number; limit?: number } = {}): Promise<Paginated<NotificationItem>> {
    if (API_MODE === "mock") return unwrap(await mockApi.notifications(params));
    const qs = new URLSearchParams({ page: String(params.page || 1), limit: String(params.limit || 20) });
    return rawRequest(`/api/v1/notifications?${qs}`, "GET");
  },

  async markAllRead(): Promise<{ ok: boolean; updated: number }> {
    if (API_MODE === "mock") return unwrap(await mockApi.markAllRead());
    return rawRequest("/api/v1/notifications/read-all", "POST");
  },

  /** SSE 通知流 URL（EventSource 无法自定义 Header，走 query token） */
  notificationsStreamUrl(): string | null {
    const token = getAccessToken();
    if (!token) return null;
    return `${API_BASE}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`;
  },
};

function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message || ERROR_MESSAGES[envelope.code] || "请求失败");
  return envelope.data as T;
}

/* ============================================================
   api-types.ts — 基于 docs/phase2/openapi-v2.yaml 生成的类型契约
   统一响应：{ code, data, message }，code=0 成功
   错误码：40001/40101/40301/40401/40901/42901/50000
   ============================================================ */

export type Role = "owner" | "admin" | "member" | "viewer";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done";
export type NotificationType =
  | "task_assigned"
  | "task_moved"
  | "comment_added"
  | "task_due_soon";

/** 统一响应包装 */
export interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

export interface ApiErrorBody {
  code: number;
  data: null;
  message: string;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  team: Team;
  role: Role;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MeResponse {
  user: User;
  team: Team;
  role: Role;
}

export interface Member {
  user: User;
  role: Role;
  created_at: string;
}

export interface Board {
  id: string;
  team_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface BoardColumnWithTasks {
  id: string;
  board_id: string;
  name: string;
  position: number;
  tasks: Task[];
}

export interface BoardDetail {
  id: string;
  team_id: string;
  name: string;
  columns: BoardColumnWithTasks[];
}

export interface Task {
  id: string;
  board_id: string;
  board_name?: string;
  column_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee: { id: string; display_name: string } | null;
  priority: Priority;
  status: TaskStatus;
  position: number;
  due_date: string | null;
  start_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface Comment {
  id: string;
  task_id: string;
  author: { id: string; display_name: string };
  content: string;
  mentions: string[];
  created_at: string;
}

export interface NotificationItem {
  id: string;
  team_id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

/* ---------------- 请求体 ---------------- */

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
  /** 邀请注册：邀请方团队 id，注册成功后自动入队 */
  invite_team_id?: string;
}

export interface LoginRequest {
  username: string; // email（OAuth2 form 字段名）
  password: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  column_id: string;
  assignee_id?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  column_id?: string;
  assignee_id?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
}

export interface MoveTaskRequest {
  target_column_id: string;
  position: number;
}

export interface CreateCommentRequest {
  content: string;
}

export interface UpdateMemberRoleRequest {
  role: Role;
}

export interface InviteMemberRequest {
  email: string;
  role: Role;
}

export interface CreateBoardRequest {
  name: string;
}

export interface CreateColumnRequest {
  name: string;
  position?: number;
}

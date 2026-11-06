/* ============================================================
   api-types.ts — 基于 docs/phase2/openapi-v2.yaml 生成的类型契约
   统一响应：{ code, data, message }，code=0 成功
   错误码：40001/40101/40301/40401/40901/42901/50000
   ============================================================ */

export type Role = "owner" | "admin" | "member" | "viewer";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done";
/** 标签调色板（与后端 VALID_LABEL_COLORS 严格一致；purple 不在允许列表内） */
export type LabelColor = "blue" | "green" | "amber" | "rose" | "slate";
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
  /** 平台级超级管理员标记（/admin 后台），与团队内 owner/admin 角色正交 */
  is_superuser: boolean;
  created_at: string;
}

/** 管理员后台用户条目（/admin/users） */
export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  is_superuser: boolean;
  created_at: string;
}

/** 管理员后台团队条目（/admin/teams，含成员数） */
export interface AdminTeam {
  id: string;
  name: string;
  member_count: number;
}

/* ---------------- 管理员后台请求体 ---------------- */

export interface AdminCreateUserRequest {
  email: string;
  password: string;
  display_name: string;
  is_superuser?: boolean;
}

export interface AdminUpdateUserRequest {
  display_name?: string;
  is_superuser?: boolean;
}

export interface AdminResetPasswordRequest {
  new_password: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

/** 当前用户所属的团队及其角色（/me/teams） */
export interface UserTeam {
  team: Team;
  role: Role;
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

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
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
  labels: Label[];
  checklist: ChecklistItem[];
  /** 上级任务（多层级方案 A：树状 parent_id，顶层为 null） */
  parent_id: string | null;
  /** 直接子任务数（看板详情批量统计，便于列表视图标注层级；其余接口默认 0） */
  subtask_count: number;
}

/** 团队级标签（team 资源，与 board 无关） */
export interface Label {
  id: string;
  team_id: string;
  name: string;
  color: LabelColor;
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

/** 通知分页响应（含未读总数，独立于分页 limit） */
export interface PaginatedNotifications extends Paginated<NotificationItem> {
  unreadTotal: number;
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
  label_ids?: string[];
  checklist?: ChecklistItem[];
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
  label_ids?: string[];
  checklist?: ChecklistItem[];
  /** 设为上级任务 id（多层级）；传 null 解除层级变为顶层 */
  parent_id?: string | null;
}

/** 创建子任务：继承父任务的 board / column，position 追加到列尾 */
export interface SubtaskCreateRequest {
  title: string;
  assignee_id?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
}

/* ---------------- 保存视图（团队级命名筛选 + 排序快照） ---------------- */

/** 视图筛选条件，与客户端 BoardFilter 一一对应 */
export interface ViewFilter {
  label_id?: string | null;
  priority?: Priority | null;
  assignee_id?: string | null;
}

export interface SavedView {
  id: string;
  team_id: string;
  owner_id: string;
  name: string;
  /** 视图类型：看板（board）或列表（list） */
  view: "board" | "list";
  /** 筛选快照，仅包含被设置的键 */
  filters: ViewFilter;
  sort_key?: string | null;
  sort_dir?: string | null;
  created_at: string;
}

export interface SavedViewListData {
  items: SavedView[];
  total: number;
}

export interface CreateSavedViewRequest {
  name: string;
  view: "board" | "list";
  filters?: ViewFilter;
  sort_key?: string | null;
  sort_dir?: string | null;
}

export interface UpdateSavedViewRequest {
  name?: string;
  view?: "board" | "list";
  filters?: ViewFilter;
  sort_key?: string | null;
  sort_dir?: string | null;
}

export interface CreateLabelRequest {
  name: string;
  color?: LabelColor;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: LabelColor;
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

/** 全局搜索（/api/v1/search）命中项 —— 与后端 schemas/search.py 一一对应 */
export interface SearchTaskHit {
  id: string;
  title: string;
  description: string | null;
  board_id: string;
  board_name: string;
  team_id: string;
  team_name: string;
  column_id: string;
  column_name: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
}

export interface SearchBoardHit {
  id: string;
  name: string;
  team_id: string;
  team_name: string;
}

export interface SearchResult {
  query: string;
  tasks: SearchTaskHit[];
  boards: SearchBoardHit[];
}

/* ---------------- 任务活动流（GET /tasks/{id}/activities） ---------------- */

export type TaskActivityAction = "created" | "field_changed" | "moved" | "comment_added";

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  /** 写入时的名字快照，账号变更/删除后历史仍可读 */
  actor_name: string;
  action: TaskActivityAction;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface ActivityList {
  /** 后端按 created_at 倒序返回 */
  items: TaskActivity[];
  total: number;
}

/* ---------------- 跨看板移动 / 批量操作 ---------------- */

export interface MoveToBoardRequest {
  board_id: string;
  column_id: string;
  position?: number;
}

export type BatchAction = "set_status" | "set_priority" | "set_assignee" | "delete";

export interface BatchTaskRequest {
  task_ids: string[];
  action: BatchAction;
  value?: string | null;
}

export interface BatchResult {
  updated: number;
}

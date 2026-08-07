# 页面设计提示词（Pages Prompts）— 团队协作工具 MVP

> 生成日期：2026-08-05 | 设计师：颜好看 | 基于：Spec v1.0 §7 页面清单 + DESIGN.md v1.0
> 前端实现时：先 import `design-tokens.css`，所有颜色/间距/圆角/动效走 Token，图标统一 lucide-react（16/20/24px，描边 1.5px，fill=none + stroke=currentColor），禁 emoji 作图标。
> 每页均覆盖 5 态：Loading / Empty / Error / Populated / Edge。

---

## 页面 1：登录 / 注册

- **路由**：`/login`、`/register`
- **对应 API**：POST /api/v1/auth/register、POST /api/v1/auth/login、POST /api/v1/auth/refresh
- **Token 主题**：浅色（独立简洁布局，不套应用外壳）
- **布局描述**：
  - 居中单栏卡片（`--surface`，宽 400px，`--radius-lg`，`--elev-ring`），左侧可选品牌区（logo + 产品名 + 一句价值主张，非空洞口号，如"给 20-100 人团队的任务协作工具"）
  - 登录/注册切换 Tab；表单字段：邮箱 / 密码 /（注册时）显示名
- **组件清单**：AuthForm（Input + PasswordInput + SubmitButton）、ErrorBanner、ThemeToggle（深色仍可切，但登录页默认浅色）
- **5 态**：
  - Loading：提交按钮内 16px `Loader2` spinner + 禁用
  - Empty：注册页首次为空表单；登录页"忘记密码"占位（MVP 无重置，禁用态 + 文案说明）
  - Error：`--danger` ErrorBanner 靠近表单（如"邮箱已被注册（40901）"/"邮箱或密码错误"），字段级 error 标红
  - Populated：正常提交成功 → 存 token → 跳 `/me/tasks`
  - Edge：密码显示/隐藏切换（`Eye`/`EyeOff` 图标）；移动端键盘适配（回车提交）
- **快捷键**：Enter 提交

## 页面 2：看板（核心页面）

- **路由**：`/boards/[boardId]`
- **对应 API**：GET/PATCH/DELETE boards/:id、POST boards/:id/columns、POST boards/:id/tasks、GET boards/:id/tasks、PATCH/DELETE tasks/:id、PATCH boards/:boardId/columns/:columnId/tasks/:taskId/position、GET/POST tasks/:id/comments、GET notifications/stream
- **Token 主题**：浅色 + 深色
- **布局描述**：
  - 应用外壳内：顶部视图栏（面包屑 board 名 + 视图切换[看板/列表-禁用占位] + 筛选[负责人/优先级] + 主操作"新建任务"C 键）
  - 主区：横向滚动看板，列宽 `--board-column-w`（272px），列 header = 列名 + 计数 + 菜单；列体 `--surface-warm` 底（浅）/ `--surface`（深），圆角 `--radius-lg`
  - 任务卡片：标题 14px（截断省略）+ 底部一行（状态点 + 负责人头像 + 截止日期，`--space-2` 间隔）
  - 点击卡片 → 右侧 Drawer 任务详情（480px，移动端全屏）
- **组件清单**：KanbanBoard（dnd-kit 横向排序 + 跨列）、ColumnHeader、TaskCard、TaskDrawer（标题/描述/负责人/优先级/截止/评论流/删除）、CreateTaskDialog、FilterBar、NewColumnButton
- **5 态**：
  - Loading：列骨架（3 列 × 4 卡片 `--surface-warm` 微光）
  - Empty：无看板 → "创建你的第一个看板" + CTA（`Plus` 图标 24px）；看板空列 → "暂无任务，点击 + 创建"
  - Error：看板加载失败 → "加载失败，点击重试"（`RefreshCw`）；SSE 断开 → 顶部细条提示"实时连接已断开"
  - Populated：拖拽跨列落位 → 乐观更新 + Toast"已移动到进行中"；评论@提及 → 通知被提及人
  - Edge：1000+ 卡片虚拟滚动；标题超长省略；截止 <24h `--warn` 色、逾期 `--danger` + `CalendarX2`；拖拽 placeholder 虚线框；viewer 角色拖拽禁用 + 菜单隐藏
- **拖拽规范**：PointerSensor `activationConstraint { distance: 8 }`；`onDragEnd` 兜底；键盘替代（选中卡片 → 方向键移动 → Enter 确认）；拖拽中卡片 `--elev-raised`
- **快捷键**：C 新建任务、Esc 关闭 Drawer、`←/→` 聚焦相邻列

## 页面 3：我的任务

- **路由**：`/me/tasks`
- **对应 API**：GET /api/v1/me/tasks（?status=&q=，跨项目聚合，逾期置顶）
- **Token 主题**：浅色 + 深色
- **布局描述**：
  - 应用外壳内：顶部视图栏（标题"我的任务" + 筛选[状态/优先级] + 搜索框[`Search` 图标前缀]）
  - 主区：TaskTable 表格（列：标题 / 状态 / 优先级 / 截止日期 / 项目 / 操作），逾期行截止日期标红置顶（AC-06）
  - 行点击 → 右侧 TaskDrawer（复用看板 Drawer）
- **组件清单**：TaskTable（可排序表头）、StatusBadge（色点 + 文字）、PriorityFlag（`Flag` 图标色编码）、Pagination、SearchInput、BulkActionBar
- **5 态**：
  - Loading：表格骨架（10 行 `--surface-warm` 微光）
  - Empty："你还没有被分配的任务" + CTA"去项目看板看看"（`ListChecks` 图标）
  - Error："加载失败，点击重试"
  - Populated：按状态分组或筛选；逾期组置顶标红
  - Edge：跨项目任务显示项目徽标；1000+ 虚拟滚动；批量操作（选中 ≥1 行出现批量栏）
- **角色**：viewer 只读，编辑入口禁用

## 页面 4：团队成员

- **路由**：`/teams/[teamId]/members`
- **对应 API**：GET teams/:teamId/members、POST teams/:teamId/members（邀请）、PATCH teams/:teamId/members/:userId/role、DELETE teams/:teamId/members/:userId
- **Token 主题**：浅色 + 深色
- **布局描述**：
  - 应用外壳内：顶部视图栏（标题"团队成员" + 主操作"邀请成员"按钮，admin+ 可见）
  - 主区：MemberTable（列：成员[头像+显示名+邮箱] / 角色[下拉] / 加入时间 / 操作[移除]）
  - 角色 Badge：owner `--color-primary-600` 底 / admin `--info` / member 中性 / viewer `--meta`（小圆角 `--radius-sm`）
- **组件清单**：MemberTable、RoleSelect（DropdownMenu）、InviteDialog（邮箱输入 + 角色选择）、Avatar（`--radius-pill`，首字母或 lucide `User`）、ConfirmDialog（移除成员二次确认）
- **5 态**：
  - Loading：表格骨架
  - Empty："还没有成员，邀请第一位成员开始协作" + CTA（`UserPlus` 图标）
  - Error：邀请失败（邮箱已存在 40901）→ 字段级错误；移除失败 → Toast
  - Populated：角色修改即时生效（接口实时查角色 AC-10）；owner 不可降级/移除（控件禁用 + tooltip 说明）
  - Edge：成员 ≤100（Spec §10）；移除自己需二次确认提示；viewer/admin 权限差异（非 admin 隐藏邀请/移除）
- **权限**：非 admin 无邀请/改角色/移除权限（UI 禁用 + 接口 40301）

## 页面 5：通知中心（全局组件）

- **位置**：应用外壳顶部栏右侧铃铛（全局可见）
- **对应 API**：GET /api/v1/notifications（?page=&limit=&unread=）、GET /api/v1/notifications/stream（SSE）
- **Token 主题**：浅色 + 深色
- **布局描述**：
  - 铃铛图标（`Bell` 20px），未读数 Badge（`--danger` 底，≤99+）
  - 点击展开下拉面板（320px，`--elev-raised`，`--z-dropdown`）：通知列表 + 底部"全部已读"按钮
  - 通知类型图标：task_assigned `UserPlus` / task_moved `ArrowRightLeft` / comment_added `MessageSquare` / task_due_soon `CalendarClock`
  - 点击通知 → 跳转对应任务 Drawer/看板
- **组件清单**：NotificationBell、NotificationList、NotificationItem（未读 `--color-primary-50` 底[浅]/`--surface-warm`[深]）、UnreadBadge、MarkAllReadButton
- **5 态**：
  - Loading：下拉面板骨架（3 条）
  - Empty："暂无通知" + 说明（`BellOff` 图标）
  - Error：SSE 断开提示 + 历史通知兜底加载
  - Populated：SSE 实时插入新通知，铃铛 150ms 微动一次（非装饰循环动画）
  - Edge：未读 >99 显示 99+；通知分页；`aria-live="polite"` 播报新通知

## 页面 6：应用外壳（全局布局）

- **路由**：全局包裹所有登录后页面
- **对应 API**：GET /api/v1/me（当前用户+团队+角色）、GET /api/v1/teams/:teamId/boards
- **Token 主题**：浅色 + 深色
- **布局描述**：
  - **桌面（≥768px）**：左侧 Sidebar 240px（`--sidebar-width`，可折叠至 64px 仅图标）
    - 顶部：logo + 团队名（`ChevronsLeftRight` 折叠按钮）
    - 导航项（lucide 图标 + 文字，24px 图标）：收件箱 `Inbox` / 我的任务 `ListChecks` / 项目 `FolderKanban` / 看板 `SquareKanban` / 成员 `Users` / 设置 `Settings`
    - 底部：当前用户（头像 + 显示名 + 角色 Badge）+ 主题切换按钮（`Sun`/`Moon`）
  - **顶部视图栏** 56px：面包屑（团队 / 项目 / 看板）+ 视图操作区 + 通知铃 + 用户菜单
  - **移动端（<768px）**：Sidebar 收为底部 TabBar（≤5 项：收件箱/我的任务/看板/成员/更多），顶部保留标题 + 通知铃；看板列单列堆叠
- **组件清单**：Sidebar、SidebarItem（active `--color-primary-50` 底[浅]/`--surface-warm`[深] + Primary 文字）、TopBar、Breadcrumb、NotificationBell、ThemeToggle、UserMenu（登出）
- **5 态**：
  - Loading：`/me` 加载中 → Sidebar 骨架（团队名 + 导航项占位）
  - Empty：用户无团队（注册默认已建团队，正常不出现）→ "创建你的团队"引导
  - Error：`/me` 40101 → 跳登录；其他错误 → 全局 ErrorBoundary + 重试
  - Populated：导航项高亮当前路由；角色决定可见项（viewer 隐藏设置/邀请入口）
  - Edge：长团队名截断；Sidebar 折叠时 tooltip 显示名称；TabBar 5 项上限
- **主题切换**：ThemeToggle 切换 `data-theme="dark"`，存 localStorage，默认浅色；切换动画 150ms（非循环）

---

## 页面提示词清单速览（回传摘要用）

| # | 页面 | 路由 | 核心组件 | 5 态要点 |
|---|---|---|---|---|
| 1 | 登录/注册 | /login, /register | AuthForm | 提交 loading / 错误 banner / 密码切换 |
| 2 | 看板 | /boards/[boardId] | KanbanBoard + TaskCard + TaskDrawer | 列骨架 / 空列引导 / 拖拽乐观更新 / 1000+ 虚拟滚动 |
| 3 | 我的任务 | /me/tasks | TaskTable + StatusBadge + Pagination | 表格骨架 / 空引导 / 逾期标红置顶 |
| 4 | 团队成员 | /teams/[teamId]/members | MemberTable + RoleSelect + InviteDialog | 邀请错误 / owner 保护 / 权限差异 |
| 5 | 通知中心 | 全局铃铛 | NotificationBell + 下拉面板 | SSE 实时 / 未读徽标 / 空态 |
| 6 | 应用外壳 | 全局 | Sidebar + TopBar + ThemeToggle | /me 骨架 / 401 跳登录 / 移动端 TabBar |

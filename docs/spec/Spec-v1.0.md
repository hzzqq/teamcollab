# Spec - 团队协作工具 MVP v1.0

> 生成日期：2026-08-05
> 基于：PRD v1.0 + 架构文档 v1.0 + UIUX 文档 v1.0（均已由用户确认）
> 状态：已确认（用户 2026-08-05 通过三文档）
> 编制：项目总监 大湾区靓仔（汇编三专家产出 + 5 处交叉验证修正）

---

## 1. 产品定义
- **一句话描述**：给 20-100 人中型团队的"刚刚好"任务协作工具——10 分钟上手、性能不崩、权限清晰、成本可预测。
- **目标用户**：26-40 岁 PM / 项目负责人（主）、32-48 岁部门主管（只读）、22-35 岁一线执行（次）。
- **核心问题**：重工具（Jira/Asana）配置复杂慢贵，轻工具（Trello/Linear）无依赖无跨项目视图，Notion/表格类数据一多就崩——中型团队缺一个"中间地带"选项。
- **项目性质**：练手/学习项目，重点探索技术栈与架构设计，不追求商业化。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | RICE |
|--------|------|-------------|------|
| P0 | 任务 CRUD + 看板视图（拖拽状态流转、负责人/截止日期/优先级） | 看板加载 <3s，拖拽落位持久化 | 5.00 |
| P0 | 我的任务视图（今日待办/逾期置顶标红/进行中） | 只看分配给自己的任务，跨项目聚合 | 6.75 |
| P0 | 成员协作：邀请、任务分配、评论、@提及、通知（被分配/被@/到期提醒） | 被分配/被@ 收到站内通知，可点击直达任务 | 4.50 |
| P0 | 权限体系：角色（owner/admin/member/viewer）+ 项目级成员管理 | 只读成员编辑被拒（UI 禁用 + 接口 403） | 2.56 |

**MVP 验收主线**：PM 注册组织 → 邀请 20 人 → 建项目 → 拆任务分配给 3 个成员 → 成员收到通知 → 成员更新状态 → PM 在我的任务/项目看板看到全局。10 分钟内完成全流程（不含注册）。

## 3. 明确不做（Out-of-Scope — 锁定）

> 每条必须带原因，防止范围蔓延。开发中如有人提出这些功能，直接拒绝。

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 文档协作/知识库 | 与 Notion/Confluence 正面竞争且重资产，MVP 聚焦任务闭环 | v2.0，预留"任务↔文档引用"字段即可 |
| 即时沟通/IM | 生态已被微信/飞书/钉钉占据，无差异化且成本极高；任务评论+@已覆盖围绕任务的沟通 | 不计划 |
| 日程/会议 | 日历是另一品类；任务截止日期可扩展为日历视图 | v2.0 日历视图 |
| 甘特图/时间线 | 依赖任务依赖功能支撑，实现成本高；数据模型已预留 start/due 字段 | Backlog F10 依赖完成且用户反馈后 |
| 任务多层级/依赖 | MVP 验证核心闭环优先；已预留字段扩展位 | 用户反馈后（RICE 3.20/1.80） |
| 列表/表格视图 | 看板 MVP 够用；表格默认视图在 Backlog | 用户反馈后 |
| 跨项目仪表盘 | 依赖数据积累与埋点验证 | 下个迭代 |
| 全局搜索（跨项目） | MVP 单看板 ILIKE 够用；接口预留 ?q= | 任务量破 10 万时 |
| 移动端原生 App | 20-100 人团队桌面办公为主；MVP Web 响应式即可 | P1 埋点观察留存 |
| 自动化/规则引擎 | 成本高收益低；预留事件总线/webhook 设计 | v2.0 |
| 报表/统计图表 | 先埋点积累数据 | 下个迭代 |
| 时间追踪 | 直接竞品普遍缺失或付费墙，MVP 避开 | 不计划 |
| 附件/文件存储 | 重资产（存储/病毒扫描/权限）；MVP 支持任务挂外链 URL | v2.0 |

## 4. 技术架构（锁定 — 含版本锚定）

> 版本锚定：以下版本为已核验的实际可用版本，开发时必须按此安装。禁止幻觉依赖（新增依赖必须存在性核验）。

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 前端框架 | Next.js（App Router） | next@15.5.9+（CVE-2025-66478 补丁线，禁止更低） | 生态最大、可学 SSR/App Router、shadcn 支持 |
| 前端 UI | React + Tailwind CSS + shadcn/ui + Radix | react@19.2.x / tailwindcss@4.1.x / shadcn CLI 生成 | 2026 主流 UI 栈，组件复制进代码库完全可控 |
| 图标库 | **lucide-react（P0 锁定，全项目唯一）** | lucide-react@1.24.0 | 纯 SVG、ISC 许可、tree-shakeable、React 19 兼容 |
| 前端数据层 | TanStack Query | @tanstack/react-query@5.100.x | 服务端状态缓存/乐观更新 |
| 看板拖拽 | dnd-kit | @dnd-kit/core + sortable + utilities 6.x | 活跃维护、React 19 兼容、WCAG 2.1 AA |
| 后端 | FastAPI | fastapi@0.140.x（原生 SSE） | 类型安全、自动 OpenAPI、Python 3.13 就绪 |
| ORM/迁移 | SQLAlchemy + Alembic | 2.0.x / 1.14.x | Python 生态标准，迁移可控 |
| 数据库 | PostgreSQL 17（Docker） | postgres:17 + pgvector/pgvector:pg17（含 pgvector 0.8.2） | 关系型+全文+向量+RLS 一引擎覆盖 |
| 认证 | OAuth2 Password + JWT | PyJWT@2.10.x + bcrypt@4.x（**禁 python-jose/passlib**） | 无状态、RBAC 配合 |
| 实时通知 | SSE（FastAPI 原生） | FastAPI 0.140.x 已含 | 单向推送够用、零额外基础设施；WebSocket 预留 |
| 搜索 | PostgreSQL ILIKE | — | 任务量 <1 万条够用；tsvector/Meilisearch 为扩展位 |
| 运行时 | Node / Python | node 22.22.2 / python 3.13.14（本机实测） | 已安装 |

## 5. API 端点清单（锁定——开发时以此为唯一依据）

> 契约文件：docs/phase1/openapi.yaml（Phase 2 由架构师更新为 v2，补以下标 + 的修正端点）
> 统一响应：`{ "code": 0, "data": {}, "message": "" }`；错误码 40001/40101/40301/40401/40901/42901/50000

| Method | Path | 功能 | 认证 | 请求体 | 响应体 |
|--------|------|------|------|--------|--------|
| POST | /api/v1/auth/register | 注册（创建用户+默认团队） | 公开 | email/password/display_name | user + tokens |
| POST | /api/v1/auth/login | 登录（OAuth2 Password） | 公开 | email/password | access + refresh |
| POST | /api/v1/auth/refresh | 刷新 access token | refresh | refresh_token | access |
| GET | /api/v1/me | 当前用户+团队+角色 | 登录 | - | user/team/role |
| + | GET | /api/v1/me/tasks | 我的任务聚合（跨项目） | 登录 | ?status=&q= | 分页任务 |
| POST | /api/v1/teams | 创建团队 | 登录 | name | team |
| GET | /api/v1/teams/:teamId/members | 成员列表 | member+ | - | members[] |
| POST | /api/v1/teams/:teamId/members | 邀请成员 | admin+ | email/role | member |
| PATCH | /api/v1/teams/:teamId/members/:userId/role | 改角色 | admin+ | role | member |
| DELETE | /api/v1/teams/:teamId/members/:userId | 移除成员 | admin+ | - | ok |
| GET | /api/v1/teams/:teamId/boards | 看板列表 | member+ | - | boards[] |
| POST | /api/v1/teams/:teamId/boards | 创建看板 | member+ | name | board |
| GET | /api/v1/boards/:boardId | 看板详情（列+任务） | member+ | - | board+columns+tasks |
| PATCH | /api/v1/boards/:boardId | 更新看板 | member+ | name | board |
| DELETE | /api/v1/boards/:boardId | 删除看板 | admin+ | - | ok |
| POST | /api/v1/boards/:boardId/columns | 创建列 | member+ | name/position | column |
| PATCH | /api/v1/columns/:columnId | 更新列 | member+ | name/position | column |
| POST | /api/v1/boards/:boardId/tasks | 创建任务 | member+ | title/description/assignee_id/priority/due_date/column_id | task |
| GET | /api/v1/boards/:boardId/tasks | 任务列表/搜索 | member+ | ?q=&assignee_id=&status=&page=&limit= | 分页 |
| GET | /api/v1/tasks/:taskId | 任务详情 | member+ | - | task |
| PATCH | /api/v1/tasks/:taskId | 更新任务 | member+ | 任意可改字段 | task |
| DELETE | /api/v1/tasks/:taskId | 删除任务 | member+ | - | ok |
| PATCH | /api/v1/boards/:boardId/columns/:columnId/tasks/:taskId/position | 拖拽落位 | member+ | target_column_id/position | task |
| + | GET | /api/v1/tasks/:taskId/comments | 评论列表 | member+ | - | 分页 comments |
| + | POST | /api/v1/tasks/:taskId/comments | 发评论（@提及检测） | member+ | content | comment |
| GET | /api/v1/notifications/stream | SSE 通知流 | 登录（query token） | - | event stream |
| GET | /api/v1/notifications | 历史通知 | 登录 | ?page=&limit=&unread= | 分页 |

## 6. 数据库表清单（锁定）

| 表名 | 核心字段 | 索引 | 关联 |
|------|----------|------|------|
| users | id UUID PK, email UNIQUE, password_hash, display_name | email 唯一 | - |
| teams | id UUID PK, name | - | - |
| team_members | team_id, user_id, role(owner/admin/member/viewer) | UNIQUE(team_id,user_id) | teams/users |
| boards | id, team_id, name | (team_id) | teams |
| board_columns | id, board_id, name, position | (board_id, position) | boards |
| tasks | id, board_id, column_id, title(≤200), description, assignee_id(可空), priority(low/medium/high/urgent), status(todo/in_progress/done), position, due_date, **start_date（修正#4，可空）**, created_by | (board_id,column_id,position), (assignee_id), (created_at) | boards/board_columns/users |
| task_comments（修正#1，新增） | id, task_id, author_id, content(≤2000), created_at | (task_id, created_at) | tasks/users |
| notifications | id, team_id, user_id, type(task_assigned/task_moved/comment_added/task_due_soon), payload JSONB, is_read | (user_id, is_read, created_at) | teams/users |

多租户：所有业务表含 team_id（或经 board→team 可达），查询层强制注入租户过滤。

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| 登录/注册 | /login, /register | 表单（AuthForm） | auth/register, auth/login | 浅色（独立简洁布局） |
| 看板 | /boards/[boardId] | KanbanBoard(dnd-kit)、TaskCard、ColumnHeader、TaskDrawer | boards/:id, tasks CRUD, position, comments, notifications/stream | 浅色+深色 |
| 我的任务 | /me/tasks | TaskTable（筛选栏+排序+分页）、逾期标红 | me/tasks | 浅色+深色 |
| 团队成员 | /teams/[teamId]/members | MemberTable + 角色下拉 | teams/:id/members CRUD | 浅色+深色 |
| 通知中心 | 全局组件（铃铛 + 下拉面板） | NotificationBell | notifications, notifications/stream | 浅色+深色 |
| 应用外壳 | 全局布局 | Sidebar(240px 可折叠) + 顶部视图栏 | me, teams/:id/boards | 浅色+深色 |

角色映射（修正#3）：owner=团队创建者（不可降级）/ admin=管理员 / member=成员 / viewer=只读。

## 8. 设计 Token（锁定）

> Phase 2 设计师产出 design-tokens.json + design-tokens.css，前端通过 import 引用，禁止硬编码颜色。

- **主色**：Primary-600 `#4F46E5`（品牌主色，纯色非渐变）、Primary-500 `#6366F1`（辅助强调）、Primary-700 `#4338CA`（hover）、Primary-50 `#EEF2FF`（浅底）
- **中性色（浅）**：bg `#F8FAFC` / surface `#FFFFFF` / fg `#1E293B` / border `#E2E8F0`
- **中性色（深）**：bg `#0D1117` / surface `#161B22` / fg `#F0F6FC` / border `#282A2F`
- **语义色**：success `#16A34A`(浅)/`#3FB950`(深)、warn `#D97706`/`#D29922`、danger `#DC2626`/`#F85149`、info `#2563EB`/`#58A6FF`
- **字体**：Inter + Noto Sans SC（正文 400/510/590 三级），JetBrains Mono（任务 ID/数字）；字号 12/14/16/18/20/24/32/40
- **图标库**：**lucide-react@1.24.0**，尺寸 16px 行内 / 20px 按钮 / 24px 独立，描边 1.5px，fill=none + stroke=currentColor
- **主题**：默认浅色 + 完整深色（data-theme="dark" 切换 CSS 变量，共用语义 Token）
- **圆角**：4/8/12/9999px，上限 16px；**阴影仅弹层**（--elev-raised）
- **密度**：4px 网格，看板列 272px，卡片紧凑一行（标题+状态点+负责人+截止）
- **动效**：≤300ms，基准 150ms；禁弹跳缓动、禁 >1s；支持 prefers-reduced-motion

## 9. 验收标准（锁定——QA 测试时以此为唯一依据）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 注册 | While 用户提交合法注册信息，系统必须创建账户+默认团队并返回 access/refresh token | P0 |
| AC-02 | 注册冲突 | If 邮箱已存在，系统必须返回 40901 且不泄露账户信息 | P0 |
| AC-03 | 登录 | While 用户凭正确凭证登录，系统必须返回新 token 对 | P0 |
| AC-04 | 创建任务 | While 项目成员在看板创建任务，系统必须将其放入指定列并返回完整任务 | P0 |
| AC-05 | 拖拽流转 | When 成员把任务拖到其他列，系统必须持久化列与顺序变更并推送 SSE 通知 | P0 |
| AC-06 | 我的任务 | While 用户打开我的任务视图，系统必须只返回分配给他本人的任务，逾期置顶 | P0 |
| AC-07 | 评论@提及 | When 评论中包含 @username，系统必须创建评论并通知被提及用户 | P0 |
| AC-08 | 到期提醒 | While 任务距截止 ≤24h 且未完成，系统必须生成 task_due_soon 通知 | P0 |
| AC-09 | 只读权限 | While viewer 角色用户尝试编辑任务，系统必须在 UI 禁用且接口返回 40301 | P0 |
| AC-10 | 角色修改 | When admin 修改成员角色，系统必须立即生效（接口实时查角色，不依赖过期 token claim） | P0 |
| AC-11 | 租户隔离 | While 用户请求其他团队资源，系统必须返回 40401（不泄露存在性） | P0 |
| AC-12 | 搜索 | When 用户按关键词搜索任务，系统必须返回标题/描述命中的任务 | P1 |
| AC-13 | Token 刷新 | When access token 过期，系统必须返回 40101 且 refresh 端点可恢复会话 | P0 |
| AC-14 | 乐观更新 | When 网络失败时保存任务，系统必须回滚 UI 并提示重试（不丢数据） | P1 |

## 10. 边界与约束
- 浏览器：Chrome/Safari/Firefox 最新 2 版；移动端微信内置浏览器可读；不支持 IE
- 响应式断点：<768px Sidebar 收为底部 TabBar、看板列单列堆叠
- 性能目标：首屏 <3s；API p95 <500ms；看板 1000 卡片滚动流畅（虚拟滚动预留）；>1000 任务启用虚拟滚动
- 并发：两人同时编辑同任务 → 最后写入胜出 + 活动流记录（MVP 不引入乐观锁）
- 离线：不做离线编辑；断网禁用写操作并提示，读缓存可看
- 输入限制：标题 ≤200 字、评论 ≤2000 字、项目成员 ≤100
- 安全：HTTPS + JWT + RBAC + 输入校验 + 速率限制 + bcrypt 密码；非项目成员访问 → 404 不泄露
- 多租户：MVP tenant_id 字段隔离，禁止无租户过滤的全表查询；RLS 为升级路径

## 11. 内嵌已知坑（从 Phase 1 调研 + 项目记忆拉取）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| Next.js RCE 漏洞 | next.js-15 | CVE-2025-66478（CVSS 10.0） | 锁 next@15.5.9+，禁止更低版本 |
| python-jose/passlib 弃用 | fastapi-auth | 均停维护且有 CVE/兼容问题 | 用 PyJWT + bcrypt，禁引入 |
| pgvector 缺失 | postgres-17 | 标准 postgres 镜像不含扩展 | 用 pgvector/pgvector:pg17 镜像 |
| dnd-kit 拖拽抖动 | dnd-kit | 卡片无稳定 id / 高度不定 / over=null 未处理 | 稳定 id、固定卡片高度、onDragEnd 兜底、触摸设 activationConstraint |
| SSE 被代理缓冲 | sse | 反向代理超时/缓冲导致连接不稳定 | 单机部署无影响；上云网关配 SSE 支持 |
| ILIKE 前缀通配走不了索引 | postgres-search | %q% 无法用 B-tree | 5000 条量级全表扫描无压力，不过早优化 |

## 12. 端到端验证步骤（Spec 锁定的最后一项）

```bash
# 1. 基础设施
docker compose up -d && docker compose ps   # PostgreSQL 17（pgvector 镜像）healthy

# 2. 后端
cd server && uv sync && alembic upgrade head && uvicorn app.main:app --reload
# 访问 http://localhost:8000/docs 确认 OpenAPI 生成

# 3. 前端
cd web && npm install && npm run dev        # http://localhost:3000

# 4. 核心成功流
curl -X POST http://localhost:8000/api/v1/auth/register -H "Content-Type: application/json" \
  -d '{"email":"pm@example.com","password":"pass1234","display_name":"PM"}'   # 断言 201 + token
curl -X POST http://localhost:8000/api/v1/teams -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Demo 团队"}'                                                    # 断言 team
curl -X POST http://localhost:8000/api/v1/teams/$TEAM/boards -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"产品迭代"}'                                                      # 断言 board

# 5. 关键错误流
curl -X POST http://localhost:8000/api/v1/auth/register -H "Content-Type: application/json" \
  -d '{"email":"pm@example.com","password":"pass1234","display_name":"PM"}'   # 断言 40901
# viewer 角色调用 PATCH task → 断言 40301；跨团队访问 board → 断言 40401

# 6. 双浏览器联调
# 浏览器 A：拖拽任务跨列 → 浏览器 B（另一成员）经 SSE 收到通知且看板状态一致
# 刷新 access token 场景：改短有效期 → 40101 → POST /auth/refresh 恢复
```

## 13. 变更记录
| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-08-05 | Spec v1.0 初版（含 5 处交叉验证修正：comments 端点、me/tasks 端点、角色映射、start_date、due 提醒） | 三文档交叉验证 | 全项目 |

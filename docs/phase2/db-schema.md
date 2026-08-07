# TeamCollab MVP — 数据库 Schema（Phase 2 契约）

> 版本：2.0
> 日期：2026-08-05
> 依据：Spec v1.0 §6（表清单锁定）+ §10（边界约束）+ 5 处交叉验证修正
> 用途：前后端 + 后端开发唯一数据契约。所有 DDL 与 Alembic 迁移必须与本文一致。

---

## 0. 约定

- 引擎：PostgreSQL 17（Docker 镜像 `pgvector/pgvector:pg17`，含 pgvector 0.8.2 扩展）。
- 所有表使用 `UUID` 主键，默认 `gen_random_uuid()`（PG 13+ 内置）。
- 所有表含 `created_at` / `updated_at`（`updated_at` 由应用层维护，MVP 不引入触发器）。
- 软删除：MVP 不启用 `deleted_at`（删除走物理删除 + 级联），避免复杂化。
- 多租户：所有业务表含 `team_id`（或经外键可达 `team`），应用层强制注入租户过滤，禁止无租户过滤的全表查询。RLS 为升级路径，MVP 不开启。
- 命名：表名蛇形复数；字段蛇形单数；外键字段 `*_id`；枚举用 PostgreSQL `CHECK` 约束（MVP 不建自定义 type，避免迁移复杂度）。
- 字符集：默认 UTF-8（PG 默认）。
- 索引：`UNIQUE` 约束自带索引；高频查询 + 外键 + 排序字段建 B-tree 索引；MVP 不建复合/模糊搜索索引（过早优化）。

---

## 1. ER 关系（文字描述）

```
users 1 ── N team_members N ── 1 teams
teams 1 ── N boards 1 ── N board_columns 1 ── N tasks
tasks 1 ── N task_comments
teams 1 ── N notifications（接收者为 team 内 user）
users 1 ── N tasks (assignee_id, created_by)
users 1 ── N task_comments (author_id)
```

- `users` 与 `teams`：多对多，经 `team_members` 关联（含角色）。
- `tasks.assignee_id` 指向 `users.id`（`ON DELETE SET NULL`，成员被移除后任务保留，负责人置空）。
- `tasks.created_by` 指向 `users.id`（`ON DELETE RESTRICT`，创建者被删则任务删除前禁止删用户；MVP 成员移除不等于删用户账号）。
- `tasks.board_id` 指向 `boards.id`（级联删除：删看板即删任务）。
- `tasks.column_id` 指向 `board_columns.id`（级联删除：删列即删该列任务）。

---

## 2. 完整 DDL（8 张表）

```sql
-- ============================================================
-- 1. users 用户表
-- ============================================================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,                    -- bcrypt
    display_name  VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 唯一约束（email 大小写不敏感：统一小写存储，应用层负责 lower）
CREATE UNIQUE INDEX uq_users_email ON users (LOWER(email));

-- 索引
CREATE INDEX idx_users_created_at ON users (created_at);

-- ============================================================
-- 2. teams 团队表（租户）
-- ============================================================
CREATE TABLE teams (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHECK：名称非空串（长度已由 VARCHAR 限制，防空白串）
ALTER TABLE teams
    ADD CONSTRAINT chk_teams_name_not_blank
    CHECK (LENGTH(TRIM(name)) > 0);

-- ============================================================
-- 3. team_members 团队成员表（RBAC 角色存储处）
-- ============================================================
CREATE TABLE team_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID NOT NULL,
    user_id    UUID NOT NULL,
    role       VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 外键
ALTER TABLE team_members
    ADD CONSTRAINT fk_team_members_team FOREIGN KEY (team_id)
    REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_members
    ADD CONSTRAINT fk_team_members_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE;

-- 唯一：同团队同用户唯一
CREATE UNIQUE INDEX uq_team_members_team_user ON team_members (team_id, user_id);

-- CHECK：角色枚举（owner/admin/member/viewer）
ALTER TABLE team_members
    ADD CONSTRAINT chk_team_members_role
    CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- 索引
CREATE INDEX idx_team_members_user ON team_members (user_id);
CREATE INDEX idx_team_members_team ON team_members (team_id);

-- ============================================================
-- 4. boards 看板表
-- ============================================================
CREATE TABLE boards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID NOT NULL,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE boards
    ADD CONSTRAINT fk_boards_team FOREIGN KEY (team_id)
    REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE boards
    ADD CONSTRAINT chk_boards_name_not_blank
    CHECK (LENGTH(TRIM(name)) > 0);

-- 索引（租户过滤主查询）
CREATE INDEX idx_boards_team ON boards (team_id);
CREATE INDEX idx_boards_created_at ON boards (created_at);

-- ============================================================
-- 5. board_columns 看板列表
-- ============================================================
CREATE TABLE board_columns (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id   UUID NOT NULL,
    name       VARCHAR(100) NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE board_columns
    ADD CONSTRAINT fk_board_columns_board FOREIGN KEY (board_id)
    REFERENCES boards(id) ON DELETE CASCADE;

ALTER TABLE board_columns
    ADD CONSTRAINT chk_board_columns_name_not_blank
    CHECK (LENGTH(TRIM(name)) > 0);

ALTER TABLE board_columns
    ADD CONSTRAINT chk_board_columns_position_nonneg
    CHECK (position >= 0);

-- 索引（看板加载主查询：按列顺序）
CREATE INDEX idx_board_columns_board_position ON board_columns (board_id, position);

-- ============================================================
-- 6. tasks 任务表
-- ============================================================
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL,
    column_id   UUID NOT NULL,
    title       VARCHAR(200) NOT NULL,                      -- 标题 ≤200
    description TEXT,                                       -- 可空，无长度 DB 约束（应用层 ≤5000）
    assignee_id UUID,                                       -- 可空（未分配）
    priority    VARCHAR(20) NOT NULL DEFAULT 'medium',
    status      VARCHAR(20) NOT NULL DEFAULT 'todo',
    position    INTEGER NOT NULL DEFAULT 0,
    due_date    DATE,                                       -- 可空
    start_date  DATE,                                       -- 修正#4：甘特扩展预留，MVP 仅存储不展示，可空
    created_by  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_board FOREIGN KEY (board_id)
    REFERENCES boards(id) ON DELETE CASCADE;
ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_column FOREIGN KEY (column_id)
    REFERENCES board_columns(id) ON DELETE CASCADE;
ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id)
    REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE RESTRICT;

-- CHECK：枚举 + 非空 + 顺序
ALTER TABLE tasks
    ADD CONSTRAINT chk_tasks_title_not_blank
    CHECK (LENGTH(TRIM(title)) > 0);
ALTER TABLE tasks
    ADD CONSTRAINT chk_tasks_priority
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE tasks
    ADD CONSTRAINT chk_tasks_status
    CHECK (status IN ('todo', 'in_progress', 'done'));
ALTER TABLE tasks
    ADD CONSTRAINT chk_tasks_position_nonneg
    CHECK (position >= 0);
ALTER TABLE tasks
    ADD CONSTRAINT chk_tasks_dates
    CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date);

-- 索引
CREATE INDEX idx_tasks_board_column_position ON tasks (board_id, column_id, position);  -- 看板加载
CREATE INDEX idx_tasks_assignee ON tasks (assignee_id);                                  -- 我的任务
CREATE INDEX idx_tasks_created_at ON tasks (created_at);                                 -- 排序
CREATE INDEX idx_tasks_due_date ON tasks (due_date);                                     -- 到期提醒/排序
CREATE INDEX idx_tasks_status ON tasks (status);                                         -- 状态筛选
-- 说明：ILIKE %q% 前缀通配无法走 B-tree，任务量 <1 万条全表扫描无压力，不过早优化（Spec §11）

-- ============================================================
-- 7. task_comments 任务评论表（修正#1：PRD F5 在 MVP 范围）
-- ============================================================
CREATE TABLE task_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL,
    author_id  UUID NOT NULL,
    content    VARCHAR(2000) NOT NULL,                      -- 内容 ≤2000
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE task_comments
    ADD CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_comments
    ADD CONSTRAINT fk_task_comments_author FOREIGN KEY (author_id)
    REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE task_comments
    ADD CONSTRAINT chk_task_comments_content_not_blank
    CHECK (LENGTH(TRIM(content)) > 0);

-- 索引（评论列表按时间升序分页）
CREATE INDEX idx_task_comments_task_created ON task_comments (task_id, created_at);

-- 说明：@提及不落库为独立表，MVP 在创建评论时解析 content 中 @display_name，
-- 命中成员即在 notifications 表生成 comment_added 通知；评论本身不存 mentions 列
-- （保持 schema 精简，避免与通知表双写不一致风险）。

-- ============================================================
-- 8. notifications 通知表
-- ============================================================
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID NOT NULL,
    user_id    UUID NOT NULL,                               -- 接收者
    type       VARCHAR(30) NOT NULL,
    payload    JSONB NOT NULL DEFAULT '{}',
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_team FOREIGN KEY (team_id)
    REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE;

-- CHECK：通知类型枚举（task_assigned/task_moved/comment_added/task_due_soon）
ALTER TABLE notifications
    ADD CONSTRAINT chk_notifications_type
    CHECK (type IN ('task_assigned', 'task_moved', 'comment_added', 'task_due_soon'));

-- 索引（通知列表：接收者 + 未读 + 时间倒序）
CREATE INDEX idx_notifications_user_unread_created ON notifications (user_id, is_read, created_at DESC);

-- 说明：task_due_soon 幂等去重由应用层保证（查询同 task_id + type + 未读是否存在，
-- 存在则不重复插入），不建 JSONB 唯一索引（复杂且收益低）。
```

---

## 3. 字段与索引清单（对照 Spec §6）

| 表 | Spec §6 核心字段 | 本 Schema 落实 | 差异说明 |
|---|---|---|---|
| users | id UUID PK, email UNIQUE, password_hash, display_name | 一致 + created_at/updated_at | email 唯一用 LOWER() 表达式索引，应用层统一小写 |
| teams | id UUID PK, name | 一致 + 时间戳 + 非空 CHECK | — |
| team_members | team_id, user_id, role(owner/admin/member/viewer) | 一致 + UNIQUE(team_id,user_id) + role CHECK | — |
| boards | id, team_id, name | 一致 + (team_id) 索引 | — |
| board_columns | id, board_id, name, position | 一致 + (board_id, position) 复合索引 | — |
| tasks | 核心字段 + **start_date（修正#4）** | 一致 + 全部 CHECK + 5 索引 | 新增 chk_tasks_dates 校验 start≤due |
| task_comments（修正#1） | id, task_id, author_id, content(≤2000), created_at | 一致 + (task_id, created_at) 索引 | content 用 VARCHAR(2000) 直接限长 |
| notifications | 核心字段 + type 含 **task_due_soon（修正#5）** | 一致 + (user_id, is_read, created_at DESC) 索引 | payload 为 JSONB |

---

## 4. 到期提醒触发方案（修正#5 落实）

**决策：MVP 采用「登录时惰性检查 + SSE 推送」为主，定时任务为扩展位。**

理由：
1. 定时任务（APScheduler/Celery beat）引入常驻进程与调度基础设施，违背练手项目"不引入超过学习目标的基础设施"原则。
2. 惰性检查覆盖核心场景：用户登录/打开应用时，扫描其负责的 `due_date ∈ [now, now+24h]` 且 `status != 'done'` 的任务，对每个命中任务按幂等规则生成 `task_due_soon` 通知并即时 SSE 推送。
3. 幂等规则：`SELECT 1 FROM notifications WHERE user_id=? AND type='task_due_soon' AND payload->>'task_id'=? AND is_read=false LIMIT 1`，存在则跳过。未读即代表"提醒尚未消费"，已读后若仍临近截止由登录检查再次生成（可接受）。

触发点（应用层统一封装 `DueSoonService.check(user_id)`）：
- 登录成功后调用一次。
- 前端 `GET /api/v1/me/tasks` 命中时不再重复检查（避免每次列表请求都扫描）。
- 任务 PATCH 更新 due_date 时，对受影响 assignee 增量检查一次（保证应用内用户实时收到）。

扩展位：v2.0 引入 APScheduler 定时全量扫描（如每小时），替代/补充惰性检查，接口与幂等规则不变。

---

## 5. 权限矩阵（RBAC，Spec §7 角色映射落实）

| 操作 | owner | admin | member | viewer |
|---|---|---|---|---|
| 查看看板/任务/评论/通知 | 可 | 可 | 可 | 可 |
| 创建/编辑/删除任务、评论、拖拽 | 可 | 可 | 可 | 否（40301） |
| 创建/编辑看板与列 | 可 | 可 | 可 | 否 |
| 邀请成员 / 改角色 / 移除成员 | 可 | 可 | 否 | 否 |
| 删除看板 | 可 | 可 | 否 | 否 |
| owner 特殊规则 | 不可被降级/移除 | — | — | — |

实现：JWT 只携带 `user_id`，角色每次从 `team_members` 实时查询（AC-10：不依赖过期 token claim）。

---

## 6. 多租户查询强制约束

- 所有业务查询必须带租户条件，经 `board_id` 定位到 `boards.team_id` 或直接 `team_id` 注入。
- 跨租户访问统一返回 40401（不泄露存在性，AC-11）。
- 服务层模式：Repository 方法签名强制带 `team_id` 参数；禁止"查出后内存过滤"。

---

## 7. 与 Spec §10 边界对照

| Spec 边界 | 落实 |
|---|---|
| 标题 ≤200 | tasks.title VARCHAR(200) + CHECK 非空 |
| 评论 ≤2000 | task_comments.content VARCHAR(2000) + CHECK 非空 |
| 项目成员 ≤100 | 应用层校验（DB 不设硬约束，避免迁移成本） |
| 密码 bcrypt | users.password_hash VARCHAR(255)，应用层 bcrypt 4.x |
| 并发最后写入胜出 | 无乐观锁，updated_at 覆盖（Spec §10） |

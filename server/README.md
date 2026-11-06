# TeamCollab MVP — 后端

团队协作工具 MVP 的 FastAPI 后端（看板 / 任务 / 成员 / 评论 / 标签 / 通知 + RBAC + 多租户 + 平台管理后台）。

技术栈（Spec §4 锁定）：FastAPI 0.140.x + SQLAlchemy 2.0 + Alembic 1.14.x + Pydantic 2.9+ + PyJWT 2.10 + bcrypt 4 + PostgreSQL 17（pgvector 镜像）。

## 目录结构

```
server/
├── app/
│   ├── main.py              # 入口：只装配（中间件 + 路由 + 异常处理器 + 调度器生命周期）
│   ├── core/                # config / db / security / errors / rate_limit / scheduler
│   ├── models/              # SQLAlchemy 模型（11 表）
│   ├── schemas/             # Pydantic 请求/响应模型（含 admin.py）
│   ├── repositories/        # 数据访问（租户过滤强制注入）
│   ├── services/            # 业务逻辑（事务编排，含 user_service / due_soon_service）
│   ├── realtime/            # SSE 发布/订阅桥（进程内 or Redis pub/sub）
│   └── api/
│       ├── deps.py          # 认证 / RBAC（实时查角色）/ 租户上下文 / require_superuser
│       ├── errors.py        # 全局异常处理器
│       └── v1/              # 路由（auth/me/teams/boards/tasks/comments/labels/notifications/admin/search）
├── alembic/                 # 迁移 0001~0006（头 0006_add_task_activities.py）
├── tests/                   # pytest + httpx TestClient（含 test_admin.py）
├── scripts/seed.py          # 开发种子数据
├── scripts/sync_openapi.py  # 导出运行时 OpenAPI 契约快照 + CI 漂移检查
├── scripts/multi_instance_verify.py  # 双进程多实例验证（SSE/限流/调度器）
├── requirements.txt         # 运行时依赖（版本锚定）
└── requirements-dev.txt     # 开发依赖
```

## 启动步骤

```bash
# 1. 基础设施（项目根目录）
docker compose up -d

# 2. 安装依赖（server/ 目录）
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt

# 3. 数据库迁移
.venv/Scripts/python -m alembic upgrade head

# 4. 启动服务
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
# 打开 http://localhost:8000/docs 查看 OpenAPI
```

## 配置（.env，可复制 .env.example）

| 变量 | 默认 | 说明 |
|------|------|------|
| DATABASE_URL | postgresql+psycopg://collab:collab@localhost:5432/collab | 连接串 |
| JWT_SECRET | dev-secret-change-me-in-production | 生产必须覆盖（ENVIRONMENT=production 时弱密钥启动即失败） |
| ACCESS_TOKEN_EXPIRE_MINUTES | 15 | access 有效期 |
| REFRESH_TOKEN_EXPIRE_DAYS | 7 | refresh 有效期 |
| CORS_ORIGINS | http://localhost:3000,... | 逗号分隔 |
| REDIS_URL | 空 | 非空则 SSE 广播 + 限流计数 + 调度器互斥走 Redis/PG 多实例模式；空为单进程（Redis 宕机限流 fail-open） |
| SCHEDULER_ENABLED | true | 后台到期提醒调度器总开关 |
| SCHEDULER_DUE_SOON_INTERVAL_SECONDS | 300 | 扫描周期（秒） |
| DUE_SOON_RESURFACE_HOURS | 12 | 同任务重提醒防骚扰窗口 |
| ENVIRONMENT | development | production 启用配置自检 |

## 核心契约

- **运行时 46 端点**（`v1/` 下 11 个路由模块）；完整契约见 `docs/openapi-runtime.json`（由 `app.openapi()` 自动生成，33 路径 / 46 方法，CI `--check` 守卫漂移）。`docs/phase2/openapi-v2.yaml` 是 phase2 的 **27 方法历史快照**，仅作追溯，勿据此联调；运行时 `/docs` 亦可查
- 全局搜索：`GET /api/v1/search?q=&limit=`，按 `team_members` 实时取 team_ids、经 `boards.team_id` 隔离（tasks 表无 team_id）；LIKE 通配符 `%` `_` 转义为字面量，结果含团队/看板/列面包屑供命令面板深链使用
- 子任务清单：`tasks.checklist` 为数组型 JSONB（`[{id,text,done}]`，迁移 0005，默认 `[]`），随任务 create/PATCH 整体读写；服务端校验最多 50 项、text 非空、id 不重复。`start_date` 早于 `due_date` 由 Pydantic 与 DB check 双重保证
- 跨看板移动：`POST /tasks/{id}/move-to-board`，目标看板必须同团队（跨租户 40401）、目标列必须属于目标看板（40001）；源/目标列 position 均压紧，同事务写 `moved` 活动并向新旧看板广播更新
- 批量操作：`POST /tasks/batch`（最多 50 项），`set_status / set_priority / set_assignee / delete`；先全量校验租户与 member+ 角色，**任一越权整批拒绝不做部分更新**；逐任务写活动日志，幂等不刷屏，删除经 FK 级联清理活动
- 活动流：`task_activities`（迁移 0006）记 `created / field_changed / moved / comment_added` 四类事件；`GET /tasks/{id}/activities?limit=` viewer+ 可读、按 `created_at` 倒序，租户经 `require_task_roles` 校验。日志与业务写在**同一事务**提交；值落人类可读审计文本（状态中文 / 人名 / 列名），`actor_name` 为名字快照。埋点覆盖 task create / PATCH 字段 diff / 跨列移动 / 评论 / `PUT /tasks/{id}/labels`；幂等 PATCH 与同列排序不产生日志。任务删除经 FK 级联清理
- 统一响应：`{ "code": 0, "data": {}, "message": "" }`
- 错误码：40001 / 40101 / 40301 / 40401 / 40901 / 42901 / 50000
- 认证：`Authorization: Bearer <access_token>`（SSE 走 `?token=`）
- RBAC：JWT 只带 user_id，团队角色每次从 `team_members` 实时查询（AC-10 立即生效）
- 多租户：跨团队访问统一 40401，不泄露存在性（AC-11）
- 平台超级管理员：`users.is_superuser` 与团队内 owner/admin 正交；`/api/v1/admin/*` 由 `require_superuser` 守卫，护栏保证至少保留一个 superuser、禁止自删
- 到期提醒：后台调度器每 5 分钟扫描（PG advisory lock 多实例互斥 + 12h 防重发）**+ 登录/改期惰性检查**双通道
- 拖拽契约：路径 `columnId` = 目标列，body `target_column_id` 必须一致，`position` = 目标列中先移除自身再插入的下标（详见根 README）

## 常用命令

```bash
# 迁移
.venv/Scripts/python -m alembic upgrade head      # 升级
.venv/Scripts/python -m alembic downgrade -1      # 回滚一步
.venv/Scripts/python -m alembic current           # 当前版本

# 测试（注意：tests/conftest.py 会 TRUNCATE 业务表，跑完须重跑 seed 恢复演示数据）
.venv/Scripts/python -m pytest tests/ -q

# 静态检查 + 契约快照（新增/修改端点后必须重新生成快照再提交）
.venv/Scripts/python -m ruff check app/ tests/ scripts/
.venv/Scripts/python scripts/sync_openapi.py            # 重新生成 docs/openapi-runtime.json
.venv/Scripts/python scripts/sync_openapi.py --check   # CI 漂移检查（不一致退出 1）

# 种子数据
.venv/Scripts/python -m scripts.seed

# 多实例验证（真双 uvicorn 进程 + 内置 mini-redis）
.venv/Scripts/python scripts/multi_instance_verify.py
```

## 种子账号

`pm@example.com` / `pass1234`：owner + **平台超级管理员**（`/admin` 后台入口），含示例团队/看板/任务。
`dev@example.com` / `pass1234`：普通成员。运行 `seed.py` 后可用。

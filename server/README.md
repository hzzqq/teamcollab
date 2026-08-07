# TeamCollab MVP — 后端

团队协作工具 MVP 的 FastAPI 后端（看板 / 任务 / 成员 / 评论 / 通知 + RBAC + 多租户）。

技术栈（Spec §4 锁定）：FastAPI 0.140.x + SQLAlchemy 2.0 + Alembic 1.14.x + Pydantic 2.9+ + PyJWT 2.10 + bcrypt 4 + PostgreSQL 17（pgvector 镜像）。

## 目录结构

```
server/
├── app/
│   ├── main.py              # 入口：只装配（中间件 + 路由 + 异常处理器）
│   ├── core/                # config / db / security / errors / rate_limit
│   ├── models/              # SQLAlchemy 模型（8 表）
│   ├── schemas/             # Pydantic 请求/响应模型
│   ├── repositories/        # 数据访问（租户过滤强制注入）
│   ├── services/            # 业务逻辑（事务编排）
│   ├── realtime/            # SSE 发布/订阅桥
│   └── api/
│       ├── deps.py          # 认证 / RBAC（实时查角色）/ 租户上下文
│       ├── errors.py        # 全局异常处理器
│       └── v1/              # 路由（auth/me/teams/boards/tasks/comments/notifications）
├── alembic/                 # 迁移（versions/0001_init_schema.py）
├── tests/                   # pytest + httpx TestClient 冒烟测试
├── scripts/seed.py          # 开发种子数据
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
| JWT_SECRET | dev-secret-change-me-in-production | 生产必须覆盖 |
| ACCESS_TOKEN_EXPIRE_MINUTES | 15 | access 有效期 |
| REFRESH_TOKEN_EXPIRE_DAYS | 7 | refresh 有效期 |
| CORS_ORIGINS | http://localhost:3000,http://localhost:5173 | 逗号分隔 |

## 核心契约（openapi-v2.yaml，27 端点）

- 统一响应：`{ "code": 0, "data": {}, "message": "" }`
- 错误码：40001 / 40101 / 40301 / 40401 / 40901 / 42901 / 50000
- 认证：`Authorization: Bearer <access_token>`（SSE 走 `?token=`）
- RBAC：JWT 只带 user_id，角色每次从 team_members 实时查询（AC-10 立即生效）
- 多租户：跨团队访问统一 40401，不泄露存在性（AC-11）
- 到期提醒：登录时惰性检查（AC-08），幂等去重

## 常用命令

```bash
# 迁移
.venv/Scripts/python -m alembic upgrade head      # 升级
.venv/Scripts/python -m alembic downgrade -1      # 回滚一步
.venv/Scripts/python -m alembic current           # 当前版本

# 测试
.venv/Scripts/python -m pytest tests/ -q

# 静态检查
.venv/Scripts/python -m ruff check app/ tests/ scripts/

# 种子数据
.venv/Scripts/python -m scripts.seed
```

## 种子账号

`pm@example.com` / `pass1234`（owner，含示例团队/看板/任务），运行 seed 后可用。

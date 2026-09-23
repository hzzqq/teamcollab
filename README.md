# TeamCollab — 团队协作工具 MVP

给 20-100 人中型团队的「刚刚好」任务协作工具：看板 + 任务 CRUD + 成员协作（评论 / @提及 / 通知）+ 权限（owner / admin / member / viewer）+ 多租户隔离。练手项目，架构为文档协作 / 即时沟通 / 日程**预留扩展位（当前阶段一律不做，详见 [PROJECT_BOUNDARY.md](./PROJECT_BOUNDARY.md)）**。

> **范围宪法**：本项目只做「团队协作 SaaS」这一个产品，不蔓延成多工具平台，不与 project3（调研/分析）重复造轮子。任何越界需求默认打回。

## 技术栈（Spec v1.0 锁定）

| 层 | 选型 |
|----|------|
| 前端 | Next.js 15.5.22 (App Router) + React 19.2 + Tailwind 4.1 + shadcn/ui + lucide-react（P0 唯一图标库）+ react-query + dnd-kit |
| 后端 | FastAPI 0.140 + SQLAlchemy 2.0 + Alembic + PyJWT/bcrypt（禁 python-jose/passlib） |
| 数据库 | PostgreSQL 17（本地环境使用 .pgtmp 独立实例；正式环境 docker-compose） |
| 实时 | SSE（EventSource），WebSocket 预留扩展位 |
| 测试 | 后端 pytest 56 用例全绿（含 RBAC/多租户/错误流）；前端 tsc + next build 全过 |

## 目录

```
docs/            # Phase 1 三文档 + Spec v1.0 + Phase 2 设计系统（契约）
web/             # Next.js 前端（8 路由）
server/          # FastAPI 后端（27 端点 / 8 表 / 迁移）
docker-compose.yml  # PostgreSQL 17（pgvector 镜像）
.pgtmp/          # 本地 PG 17.5 实例（本机无 Docker daemon 时的替代，含数据目录）
```

## 启动

```bash
# 1. 数据库（二选一）
docker compose up -d            # 有 Docker：官方路径（含 PostgreSQL + Redis）
.pgtmp/pgsql/bin/pg_ctl -D .pgtmp/data -l .pgtmp/pg.log start   # 无 Docker：本地实例

# 2. 后端（依赖 server/.venv，已建好）
cd server && .venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# 3. 前端
cd web && npm run build && npm run start   # 生产模式，默认 3000 端口
# 开发模式：npm run dev（rewrites 代理 /api/* -> localhost:8000）

# 4. 访问 http://localhost:3000 ，注册即用（注册自动建团队）
```

## 一键启动与可用性验证（推荐）

```bash
# 一键本地启动：自动检测/拉起 .pgtmp 自带 PostgreSQL + alembic 迁移 + 启动后端
python start_dev.py
# 仅准备数据库与迁移（不启后端，CI/验证用）：python start_dev.py --db-only

# 端到端可用性验证（需后端在 :8000）：自注册全新账号，覆盖注册/看板/任务/评论/拖拽/RBAC/SSE/CORS
cd server && .venv/Scripts/python.exe scripts/e2e_smoke.py

# 填充演示数据（pm@example.com / pass1234，团队“Demo 产品团队”），幂等可重复
cd server && .venv/Scripts/python.exe -m scripts.seed
```

> 注：`.pgtmp` 自带 PostgreSQL 17 实例，无需 Docker 也能完整跑通前后端。

## 部署形态（SSE 多实例）

- 单实例（默认）：无需 Redis，SSE 走进程内 broker；到期提醒由内置后台调度器每 5 分钟扫描（`SCHEDULER_ENABLED=false` 可关闭）。
- 多实例：`docker compose up -d redis`，后端配置 `REDIS_URL=redis://localhost:6379/0`，SSE 经 Redis pub/sub 跨实例广播（发布失败降级为日志，通知已落库不丢），限流计数同样经 Redis 全局共享（登录暴力破解防护不随实例数稀释；Redis 故障时 fail-open 放行），到期提醒扫描由 PG advisory lock 互斥。订阅断开自动重连。

## 验证状态（2026-08-06）

- 后端：56 pytest 全绿（auth/teams/tasks/rbac/boards/notifications）
- 前端：tsc 0 错误、next build 8 路由全生成、SWC 二进制已修复（重装 15.5.22）
- 联调：注册/登录/通知/SSE connected 实测通过
- P0 门禁：全代码 emoji 零容忍、无紫粉渐变、图标 lucide 唯一

## 已修复的关键缺陷（本次收尾）

1. `auth_service.register` / `team_service.create`：DB 侧生成主键（gen_random_uuid）未 flush 就取 id → 补 `db.flush()`
2. `Task.assignee` lazy='raise'：create 返回裸对象序列化崩溃 → commit 后重载关联
3. viewer 只读端点被 403：boards/tasks/comments 的 GET 从 member+ 放宽到 viewer+
4. position 空列基准：`scalar(...) or -1` 中 `0 or -1` 吞 0 → 显式 None 判断（tasks/columns 两处）
5. 测试基建：conftest 无数据清理导致固定邮箱用例重复跑冲突 → session 级 TRUNCATE
6. SSE 测试：TestClient 对长连接流读取挂起（端点实测正常）→ 改为 generator 契约验证

# TeamCollab MVP — Alembic 初版迁移计划

> 版本：2.0
> 日期：2026-08-05
> 依据：Spec v1.0 §4（alembic@1.14.x）+ db-schema.md（8 张表 DDL）
> 用途：后端开发从零初始化数据库的迁移执行计划。所有 schema 变更必须走 Alembic，禁止手改表结构。

---

## 1. 前置条件

- PostgreSQL 17 容器运行中（`docker compose up -d`，镜像 `pgvector/pgvector:pg17`）。
- 后端项目 `server/` 已初始化：`uv sync`（依赖：sqlalchemy 2.0.x、alembic 1.14.x、asyncpg 或 psycopg[binary]、pydantic-settings）。
- 数据库与连接串就绪：`postgresql+asyncpg://collab:collab@localhost:5432/collab`（开发默认，`.env` 可覆盖）。

---

## 2. 初始化命令（首次）

```bash
cd server

# 1. 安装依赖后初始化 alembic 目录
alembic init alembic

# 2. 配置 alembic.ini / env.py
#    - sqlalchemy.url 从环境变量读取（不要硬编码进 ini）
#    - env.py 引入 app.models 的 Base.metadata（autogenerate 数据源）
#    - 关闭 autogenerate 的 render_as_batch 警告（PG 不需要 batch 模式）

# 3. 生成初始迁移（8 张表全量）
alembic revision --autogenerate -m "init schema: users teams team_members boards board_columns tasks task_comments notifications"

# 4. 审查生成的迁移文件（autogenerate 必须人工复核，见 §4）

# 5. 执行迁移
alembic upgrade head

# 6. 验证
alembic current          # 应显示最新 revision
psql -U collab -d collab -c "\dt"   # 应列出 8 张表
```

---

## 3. 迁移文件清单（初始迁移 = 1 个）

| 文件 | Revision | 内容 | 说明 |
|---|---|---|---|
| `alembic/versions/<hash>_init_schema.py` | 初始（如 `0001_init`） | 8 张表全量：users / teams / team_members / boards / board_columns / tasks / task_comments / notifications + 全部索引 + CHECK 约束 | 与 db-schema.md §2 DDL 一一对应 |

命名规范（后续迭代）：
- 文件名：`<短hash>_<snake_case 描述>.py`，如 `abc12345_add_start_date_to_tasks.py`。
- revision id：用语义化前缀 `0001_`、`0002_`…（autogenerate 默认 hash，可在 revision 命令后手动改，或统一用 `--rev-id 0001` 生成：`alembic revision --autogenerate --rev-id 0002 -m "..."`）。
- 每个迁移文件必须包含 `upgrade()` 与 `downgrade()` 两个函数，互为逆操作。
- 禁止合并多个不相关变更进同一迁移；禁止修改已提交（已执行）的迁移文件——新变更一律新迁移。

---

## 4. autogenerate 复核清单（生成式代码防幻觉门禁）

autogenerate 生成的迁移**必须人工逐项复核**，重点核对：

1. **CHECK 约束**：autogenerate 默认不检测 CHECK 约束（PG 下 alembic 的 CHECK 支持依赖 `sqlalchemy.Enum` 或手动 op.create_check_constraint）。若模型用 `String + CheckConstraint`，autogenerate 可能漏检——初始迁移必须显式写全 7 个 CHECK（teams.name / team_members.role / boards.name / board_columns.name+position / tasks.title+priority+status+position+dates / task_comments.content / notifications.type）。
2. **表达式索引**：`uq_users_email ON users (LOWER(email))` 表达式索引 autogenerate 可能不识别，需手写 `op.create_index(..., postgresql_using='btree')` 或 `op.execute(...)`。
3. **JSONB 默认值**：`payload JSONB NOT NULL DEFAULT '{}'` 需确认为 `server_default=text("'{}'::jsonb")`。
4. **级联外键**：`ON DELETE CASCADE / SET NULL / RESTRICT` 逐外键核对。
5. **时间戳默认**：`server_default=func.now()` 与 `TIMESTAMPTZ` 类型核对。
6. **downgrade 完整性**：每张表/索引/约束都要有对应 drop，保证 `alembic downgrade base` 干净回滚。

---

## 5. 升级 / 回滚命令（日常）

```bash
# 升级到最新
alembic upgrade head

# 升级到指定版本
alembic upgrade 0002

# 回滚一步
alembic downgrade -1

# 回滚到指定版本
alembic downgrade 0001

# 回滚到空库（慎用，仅开发环境）
alembic downgrade base

# 查看历史
alembic history

# 查看当前
alembic current
```

---

## 6. 迭代变更流程（硬性规则）

1. 改 `app/models/*.py`（SQLAlchemy 模型），与 db-schema.md 保持同步（先改 schema 文档再改代码，Spec 即契约）。
2. `alembic revision --autogenerate --rev-id 000N -m "<描述>"`。
3. 按 §4 复核清单人工审查迁移文件。
4. 开发环境 `alembic upgrade head` 验证。
5. 通过后，迁移文件 + db-schema.md 变更一并提交，通知 team-lead 同步前端（如涉及字段变更）。

---

## 7. 种子数据（可选，仅开发）

- 不建议用迁移写种子数据（迁移应纯结构）。
- 开发种子走独立脚本 `server/scripts/seed.py`：创建 1 个 owner 用户 + 默认团队 + 示例看板/列/任务，便于端到端验证。

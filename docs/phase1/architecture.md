# 团队协作工具 MVP — Phase 1 架构文档

> 版本：1.0（Phase 1 调研结论）
> 编写：首席架构师 高见远
> 日期：2026-08-05
> 范围：技术选型与可行性验证。本文件是 Phase 2（Spec 与开发）的输入契约，版本锚定以本文件为准。

---

## 1. 项目概述

- 产品：从零构建的团队协作工具 MVP，练手/学习项目，重点探索技术栈与架构设计。
- 主场景：任务/项目管理（看板 + 任务 CRUD + 成员协作 + 权限 RBAC）。
- 目标团队规模：中型 20-100 人。
- 明确不做（out-of-scope）：文档协作、即时沟通、日程会议。架构预留扩展位（实时能力、多租户数据隔离）。
- 开发环境：Windows + Git Bash，Node 22.22.2 / Python 3.13.14 已就绪（本机实测版本）。

---

## 2. 选型决策摘要

| 层 | 决策 | 版本锚定 | 一句话理由 |
|---|---|---|---|
| 前端框架 | Next.js（App Router） | next@15.5.9（安全补丁线） | 生态最大、可学 SSR/App Router、shadcn 官方支持 |
| UI 组件 | shadcn/ui + Radix UI + Tailwind CSS | Tailwind 4.1.x / radix-ui（unified） | 2026 主流 UI 栈，组件复制进代码库、完全可控 |
| 图标库 | lucide-react | lucide-react@1.24.0（P0 锁定，全项目唯一） | 纯 SVG、ISC 许可、tree-shakeable、React 19 兼容 |
| 前端数据层 | TanStack Query | @tanstack/react-query@5.100.x | 服务端状态缓存/乐观更新，看板场景标配 |
| 看板拖拽 | dnd-kit | @dnd-kit/core + sortable + utilities（6.x） | 活跃维护、React 19 兼容、WCAG 2.1 AA |
| 后端框架 | FastAPI | fastapi@0.140.x | 类型安全、自动 OpenAPI、原生 SSE、Python 3.13 就绪 |
| ORM / 迁移 | SQLAlchemy + Alembic | SQLAlchemy 2.0.x / Alembic 1.14.x | Python 生态标准，迁移可控 |
| 数据库 | PostgreSQL | postgres:17（Docker）+ pgvector 0.8.2 | 关系型 + 全文检索 + 向量扩展 + RLS 多租户 |
| 认证 | OAuth2 Password + JWT（access+refresh） | PyJWT 2.10.x + bcrypt 4.x | 无状态、RBAC 配合；python-jose/passlib 已停维护，弃用 |
| 实时通知 | SSE（FastAPI 原生） | FastAPI 0.135+（本项目 0.140.x 已含） | 单向下行推送足够，零额外基础设施；WebSocket 预留扩展位 |
| 任务搜索 | PostgreSQL ILIKE + 索引 | — | 任务量 < 1 万条，ILIKE 够用；tsvector/搜索服务列为扩展位 |

---

## 3. 技术选型对比矩阵

评分维度：学习成本（练手项目权重高）、生态成熟度、看板适配度、部署成本、团队熟悉度。每项 1-5 分。

### 3.1 前端框架

| 方案 | 学习成本 | 生态 | 看板适配 | 可学价值 | 部署成本 | 加权分 | 结论 |
|---|---|---|---|---|---|---|---|
| Next.js 15 (React 19) | 4 | 5 | 5 | 5（SSR/App Router/Server Actions） | 5（Vercel 免费额度） | 4.7 | 选型 |
| Vite + React 19 SPA | 5 | 5 | 5 | 3（纯前端，缺 SSR） | 5 | 4.4 | 备选 |
| Vue 3 + Nuxt 3 | 4 | 4 | 4 | 4 | 5 | 4.1 | 备选 |
| SvelteKit | 3 | 3 | 4 | 4 | 4 | 3.5 | 不选（生态组件少，风险高） |

选型理由：练手项目核心诉求是"探索技术栈与架构"，Next.js App Router 是当前业界标准，学习价值最高；看板是强交互 SPA，但 Next.js 可整体采用 Client Components + RSC 混合，不牺牲交互体验；dnd-kit / shadcn / TanStack Query 均为 React 生态首选。

安全约束（硬性）：Next.js 15.x 存在 RSC 协议远程代码执行漏洞 CVE-2025-66478（CVSS 10.0），必须使用补丁线 next@15.5.9 或更高（15.0.5/15.1.9/15.2.6/15.3.6/15.4.8/15.5.7 为最低修复版，2026 年基线应为 15.5.9+）。禁用任何低于补丁线的版本。

### 3.2 后端框架

| 方案 | 学习成本 | 生态 | 类型/验证 | 实时能力 | 团队熟悉度 | 加权分 | 结论 |
|---|---|---|---|---|---|---|---|
| FastAPI 0.140.x | 4 | 5 | 5（Pydantic 类型即验证） | 5（原生 SSE） | 4（Python 3.13 就绪） | 4.6 | 选型 |
| NestJS 11 | 3 | 4 | 5（TypeScript） | 4（WebSocket 内置） | 4（Node 就绪） | 3.9 | 备选 |
| Express 5 | 5 | 5 | 3（结构靠自觉） | 3（需自拼） | 5 | 4.2 | 不选（太裸，权限/验证要手拼，练手易踩坑） |
| Go + Gin | 3 | 4 | 4 | 3 | 2 | 3.4 | 不选（偏离练手目标） |

选型理由：FastAPI 自动生成 OpenAPI 文档（Swagger），与"规格即契约"流程天然契合——前端可从 OpenAPI 生成 TS 类型；Pydantic 声明式校验显著减少手写校验代码；0.135+ 原生支持 SSE，满足 MVP 实时通知且零额外基础设施。

### 3.3 数据库

| 方案 | 功能完备 | 多租户 | 全文/向量 | 部署成本 | 学习价值 | 加权分 | 结论 |
|---|---|---|---|---|---|---|---|
| PostgreSQL 17 | 5 | 5（RLS） | 5（tsvector + pgvector） | 4（Docker 本地） | 5 | 4.9 | 选型 |
| MySQL 8 | 4 | 3（需自实现） | 3 | 4 | 4 | 3.8 | 不选（缺 RLS/pgvector 原生支持） |
| SQLite | 3 | 2 | 2 | 5 | 3 | 3.0 | 不选（并发写弱，仅单机原型） |
| MongoDB | 3 | 3 | 3 | 4 | 3 | 3.3 | 不选（任务/看板是关系型查询） |

选型理由：PostgreSQL 一个引擎同时覆盖关系型 + 全文检索 + 向量（pgvector，为未来 AI 语义搜索预留）+ RLS（多租户数据隔离），是协作工具类产品的行业标准，练手学习价值最高。

部署方式：Windows 环境用 Docker Desktop 运行 postgres:17 容器，本地开发零安装；pgvector 使用官方扩展镜像（pgvector/pgvector:pg17）。注意 pgvector 是独立扩展包，标准 postgres 镜像不含，必须用扩展镜像或容器内安装。

### 3.4 认证方案

| 方案 | 复杂度 | 吊销能力 | RBAC 配合 | 可扩展性 | 加权分 | 结论 |
|---|---|---|---|---|---|---|
| JWT（access 15min + refresh 7d） | 4 | 3（access 无状态，refresh 可吊销） | 5 | 5 | 4.4 | 选型 |
| Session + Cookie | 3 | 5 | 4 | 3（多实例需 Redis 共享） | 3.8 | 备选 |
| 第三方 OAuth（Google/GitHub） | 5 | 4 | 3 | 3 | 3.9 | 不选（国内访问问题 + 练手学习价值低） |

选型理由：MVP 采用标准 OAuth2 Password Flow（FastAPI 官方教程模式）+ JWT Bearer。access token 短期（15 分钟）降低泄露窗口，refresh token 长期（7 天）走独立刷新端点可服务端吊销。密码哈希用 bcrypt（直接使用 bcrypt 库，不通过已停维护的 passlib）。

弃用说明（内嵌已知坑）：python-jose 自 2023 年起不再积极维护且存在已知 CVE，passlib 自 2020 年起不再维护且与 bcrypt 4.x 存在兼容性问题。本项目一律使用 PyJWT + bcrypt，禁止引入 python-jose / passlib。

### 3.5 SVG 图标库（P0 锁定）

| 方案 | 许可证 | React 19 | 纯 SVG | 图标量 | 包体积 | 加权分 | 结论 |
|---|---|---|---|---|---|---|---|
| lucide-react 1.24.0 | ISC | 兼容 | 是 | 1500+ | tree-shakeable，按需加载 | 4.8 | 锁定 |
| Phosphor Icons | MIT | 兼容 | 是 | 9000+（含风格变体） | 良好 | 4.2 | 备选 |
| Heroicons | MIT | 兼容 | 是 | 300+ | 良好 | 3.8 | 不选（图标量少，风格单一） |
| Ant Design Icons | MIT | 兼容 | 是 | 3000+ | 良好 | 3.7 | 不选（绑定 antd 生态） |

锁定理由：
1. 纯 SVG 渲染（非字体/emoji），满足 P0 规则"禁止 emoji 作为功能图标"。
2. ISC 宽松许可，无版权风险。
3. tree-shakeable，仅打包实际使用的图标。
4. React 19 官方兼容，peerDependencies 覆盖 ^16.5.1 || ^17 || ^18 || ^19。
5. shadcn/ui 生态默认图标方案，集成零成本。
6. 全项目唯一图标来源：组件内一律 `import { X } from "lucide-react"`，禁止混用其他图标库、禁止内联 SVG 手绘、禁止 emoji 图标。

---

## 4. 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│ 表现层（Next.js 15 App Router，Client Components）             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐ │
│  │ 看板视图   │ │ 任务视图   │ │ 成员/权限  │ │ 通知横幅/铃   │ │
│  │ (dnd-kit) │ │ (CRUD)    │ │ (RBAC UI) │ │ (SSE 订阅)   │ │
│  └───────────┘ └───────────┘ └───────────┘ └──────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ TanStack Query（服务端状态缓存 + 乐观更新 + 失效重取）     │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ API 客户端（基于 OpenAPI 生成的 TS 类型 + fetch 封装）     │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 接口层（FastAPI REST API，/api/v1/*，OpenAPI 自动生成）        │
│  认证依赖注入 / 租户上下文 / RBAC 校验 / 路由处理器 / Schema   │
├─────────────────────────────────────────────────────────────┤
│ 业务层（FastAPI Service + Repository 模式）                    │
│  看板/任务/成员/通知 四大模块，单文件 ≤300 行，按资源分包        │
├─────────────────────────────────────────────────────────────┤
│ 数据层（SQLAlchemy 2.0 + Alembic 迁移）                       │
│  PostgreSQL 17（RLS 多租户预留 + tsvector 搜索 + pgvector 预留）│
└─────────────────────────────────────────────────────────────┘
```

数据流（看板拖拽示例）：
1. 用户拖动任务卡片，dnd-kit 捕获 onDragEnd，前端乐观更新本地 Query 缓存。
2. 前端调用 `PATCH /api/v1/boards/:boardId/columns/:columnId/tasks/:taskId/position`（含目标列 + 新顺序）。
3. 后端经认证/RBAC 校验后，事务更新任务列与顺序，返回新位置。
4. TanStack Query 使对应 query key 失效并重新拉取，若乐观更新与服务端不一致则回滚。
5. 若任务被指派给他人/移动，后端通过 SSE 向订阅成员推送通知事件。

---

## 5. 核心功能可行性验证

### 5.1 看板拖拽

结论：可行，选 dnd-kit。

- dnd-kit 是当前 React 拖拽生态活跃维护的首选（react-beautiful-dnd 已停更，@hello-pangea/dnd 为社区维护版且不支持网格/树形）。
- 看板场景：`DndContext` + `SortableContext`（垂直列表）+ 列间跨列拖拽，官方文档有完整 Kanban 示例。
- React 19 深度适配（并发模式），支持触摸设备（PointerSensor/TouchSensor）、键盘操作（WCAG 2.1 AA）。
- 性能：任务卡片用 React.memo + 稳定 props；大量卡片时可配合 TanStack Virtual（预留）。
- 已知坑（内嵌规格）：拖拽项必须使用稳定 id（不可用标题/索引）；卡片需固定高度避免拖拽 reflow；onDragEnd 需处理 over 为 null 的兜底；触摸设备需设置 activationConstraint 防误触。

### 5.2 RBAC 权限模型

结论：可行，采用"RBAC + 租户隔离"两层模型。

- 角色（参考多租户知识库）：`owner` / `admin` / `member` / `viewer`。
- 权限粒度：看板/项目级（owner/admin 可管理成员与配置；member 可增改任务；viewer 只读）。
- 实现：JWT 只携带 `user_id`（不信任长期 role claim），每次请求由后端从 `tenant_members` 表实时查询角色，经依赖注入到路由处理器，再由装饰器/依赖校验权限。
- 前端只做 UI 级展示（按角色隐藏按钮），权限强制在后端（避免越权）。
- 每张业务表含 `tenant_id`，查询层强制注入租户过滤（MVP 用中间件注入，生产级再开 RLS）。

### 5.3 任务搜索

结论：可行，MVP 用 PostgreSQL ILIKE。

- 任务量估算：100 人团队 × 每人活跃任务 50 = 5000 条，远低于 1 万条阈值。
- MVP：`WHERE tenant_id = ? AND (title ILIKE %q% OR description ILIKE %q%)` + 索引，够用且零额外服务。
- 已知坑：ILIKE 前缀通配 `%q%` 无法走普通 B-tree 索引，但 5000 条量级全表扫描无压力，不做 pg_trgm GIN 索引（过早优化）。
- 扩展位（不进 MVP）：中文分词用 tsvector 效果差，任务量破 10 万或需要中文语义搜索时，引入 Meilisearch 或 pgvector 向量检索，API 契约保持 `?q=` 参数不变，前端无感。

### 5.4 实时通知

结论：可行，MVP 用 SSE，WebSocket 预留扩展位。

- 场景：任务被指派、任务被移动、评论新增，做单向服务端到客户端推送，SSE 完全够用，且：
  - FastAPI 0.135+ 原生支持 SSE（本项目 0.140.x 已含），无需第三方库。
  - SSE 走普通 HTTP，无连接升级、无代理配置问题，Windows/内网部署友好。
  - 断线自动重连（EventSource 内置），比 WebSocket 重连实现简单得多。
- 架构预留：业务层设计为"事件总线"抽象（`NotificationService`），MVP 实现为 SSE 广播，未来文档协作/IM 需要双向实时时，替换为 WebSocket 而不动上层业务代码。
- 已知坑：SSE 与 HTTP/2 兼容性在部分代理下受限；EventSource 只能 GET、不能自定义 Header —— 认证走 query token 或 cookie；连接数随订阅用户数线性增长（100 人规模无压力）。

---

## 6. 多租户与扩展位设计

- 隔离级别（MVP）：共享数据库共享 Schema，`tenant_id` 字段隔离（参考 multi-tenant-saas.md 最小多租户方案）。
- 每张业务表必备 `tenant_id`，应用层查询强制注入过滤。
- 预留升级路径：共享 Schema，可升级到 RLS（行级安全策略，`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`），再升级到独立 Schema。
- 架构约束：所有 SQL 查询必须携带 `tenant_id` 条件；所有写入必须携带 `tenant_id`；管理类接口校验 owner/admin 角色。禁止出现不带租户过滤的全表查询。

---

## 7. 技术约束清单（P0 + 硬性）

### P0 规则（违反 = 退回重做）
1. 图标：全项目唯一 SVG 图标库 = lucide-react@1.24.0。禁止 emoji 图标、禁止混用其他图标库、禁止内联手绘 SVG。
2. 文档（本文件、API 文档、Spec）：禁止使用 emoji。
3. 视觉：禁止紫色到粉色渐变作为主视觉。主视觉建议以中性色（slate/gray）+ 单一强调色方案落地，具体色板由 designer 定稿，不在此硬编码。
4. 文案：禁止 AI 模板味空洞占位（"提升用户体验"类无数据支撑表述一律不写）。

### 版本锚定（硬性，写代码按此版本 API）
| 依赖 | 锁定版本 | 说明 |
|---|---|---|
| node | 22.22.2 | 已装 |
| python | 3.13.14 | 已装（本机实测，非 3.13.12） |
| next | 15.5.9+ | CVE-2025-66478 补丁线，禁止更低 |
| react / react-dom | 19.2.x | 与 Next 15 配套 |
| typescript | 5.9.x | — |
| tailwindcss | 4.1.x | CSS-first 配置，无 tailwind.config.js |
| lucide-react | 1.24.0 | P0 锁定 |
| @dnd-kit/core / sortable / utilities | 6.x | — |
| @tanstack/react-query | 5.100.x | — |
| shadcn/ui | latest（CLI 生成，无版本号） | 组件复制进代码库，new-york 风格 |
| fastapi | 0.140.x | — |
| uvicorn | 0.30+ | ASGI 服务器 |
| sqlalchemy | 2.0.x | — |
| alembic | 1.14.x | — |
| pydantic | 2.9+ | — |
| PyJWT | 2.10.x | 禁用 python-jose |
| bcrypt | 4.x | 禁用 passlib |
| postgres | 17（Docker: pgvector/pgvector:pg17） | 含 pgvector 0.8.2 |

### 工程约束
- 代码组织：单文件 ≤ 300 行；单一职责；入口只装配；按资源分包（详见代码组织规范）。
- API：统一响应格式 `{ code, data, message }`；所有端点带 `/api/v1/` 前缀；OpenAPI 为前后端唯一契约。
- 迁移：所有 schema 变更走 Alembic 迁移文件，禁止手改表结构。
- 依赖：新增依赖必须存在性核验（真实包名 + 可解析版本 + 构建即验证），禁止幻觉依赖。

---

## 8. API 草案（RESTful，v1）

统一响应格式：
```json
{ "code": 0, "data": {}, "message": "" }
```

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | /api/v1/auth/register | 注册（创建用户 + 默认团队） | 公开 |
| POST | /api/v1/auth/login | 登录（OAuth2 Password Flow，返回 access+refresh） | 公开 |
| POST | /api/v1/auth/refresh | 刷新 access token | refresh token |
| GET | /api/v1/me | 当前用户信息 + 所属团队 + 角色 | 登录 |
| POST | /api/v1/teams | 创建团队 | 登录 |
| GET | /api/v1/teams/:teamId/members | 团队成员列表 | member+ |
| POST | /api/v1/teams/:teamId/members | 邀请成员（设置角色） | admin+ |
| PATCH | /api/v1/teams/:teamId/members/:userId/role | 修改成员角色 | admin+ |
| DELETE | /api/v1/teams/:teamId/members/:userId | 移除成员 | admin+ |
| GET | /api/v1/teams/:teamId/boards | 看板列表 | member+ |
| POST | /api/v1/teams/:teamId/boards | 创建看板 | member+ |
| GET | /api/v1/boards/:boardId | 看板详情（含列 + 任务） | member+ |
| PATCH | /api/v1/boards/:boardId | 更新看板 | member+ |
| DELETE | /api/v1/boards/:boardId | 删除看板 | admin+ |
| POST | /api/v1/boards/:boardId/columns | 创建列 | member+ |
| PATCH | /api/v1/columns/:columnId | 更新列 | member+ |
| POST | /api/v1/boards/:boardId/tasks | 创建任务 | member+ |
| GET | /api/v1/boards/:boardId/tasks?q=&assignee_id=&status=&page=&limit= | 任务列表/搜索 | member+ |
| GET | /api/v1/tasks/:taskId | 任务详情 | member+ |
| PATCH | /api/v1/tasks/:taskId | 更新任务（标题/描述/指派人/标签/优先级/截止日） | member+ |
| DELETE | /api/v1/tasks/:taskId | 删除任务 | member+ |
| PATCH | /api/v1/boards/:boardId/columns/:columnId/tasks/:taskId/position | 拖拽落位（目标列 + 新顺序） | member+ |
| GET | /api/v1/notifications/stream | SSE 通知流（EventSource） | 登录（query token） |
| GET | /api/v1/notifications?page=&limit= | 历史通知列表 | 登录 |

分页响应统一格式：
```json
{ "code": 0, "data": { "items": [], "total": 100, "page": 1, "limit": 20, "hasMore": true } }
```

错误码约定：
| code | 含义 |
|---|---|
| 0 | 成功 |
| 40001 | 参数校验失败 |
| 40101 | 未认证 / token 过期 |
| 40301 | 无权限（RBAC 拒绝） |
| 40401 | 资源不存在 |
| 40901 | 资源冲突（如邮箱已注册） |
| 42901 | 频率限制 |
| 50000 | 服务器内部错误 |

完整 OpenAPI 契约见同目录 `openapi.yaml`（Phase 2 前后端联调唯一依据，变更必须更新 spec 并经 Team Lead 同步）。

---

## 9. 数据表草案

ER 关系（文字描述）：
- `users` 1—N `team_members` N—1 `teams`
- `teams` 1—N `boards` 1—N `board_columns` 1—N `tasks`
- `tasks` 1—N `task_comments`（预留）
- `teams` 1—N `notifications`（预留）

```sql
-- 用户
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,          -- bcrypt
    display_name  VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 团队（租户）
CREATE TABLE teams (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 团队成员（RBAC 角色存储处）
CREATE TABLE team_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL DEFAULT 'member',  -- owner/admin/member/viewer
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

-- 看板
CREATE TABLE boards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 看板列
CREATE TABLE board_columns (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 任务
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id   UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    priority    VARCHAR(20) NOT NULL DEFAULT 'medium',  -- low/medium/high/urgent
    status      VARCHAR(20) NOT NULL DEFAULT 'todo',    -- todo/in_progress/done
    position    INT NOT NULL DEFAULT 0,
    due_date    DATE,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 通知（预留，MVP 可先落库再走 SSE）
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,   -- task_assigned / task_moved / comment_added
    payload    JSONB NOT NULL DEFAULT '{}',
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

索引策略：
- `team_members(team_id, user_id)` 唯一约束（天然索引）
- `boards(team_id)`
- `board_columns(board_id, position)`
- `tasks(board_id, column_id, position)`（看板加载主查询）
- `tasks(assignee_id)`（我的任务筛选）
- `tasks(created_at)`（排序）
- MVP 不建复合/模糊搜索索引（过早优化），等查询慢再加

说明：MVP 阶段所有表含 `tenant_id`（即 `team_id`）实现租户隔离；生产级升级时对 `boards/tasks` 等表启用 RLS。

---

## 10. 建议项目目录结构

```
project4/
├── docs/
│   ├── phase1/
│   │   ├── architecture.md      # 本文件
│   │   ├── openapi.yaml         # API 契约（Phase 2 输入）
│   │   └── decisions/
│   │       └── ADR-001-nextjs-fastapi-postgres.md
├── web/                         # Next.js 前端
│   ├── app/                     # App Router（页面路由）
│   │   ├── (auth)/              # 登录/注册
│   │   ├── (app)/               # 看板/任务工作区（受保护）
│   │   └── api/                 # 仅用于 Next 内部代理（如需）
│   ├── components/
│   │   ├── ui/                  # shadcn 生成组件（勿手改）
│   │   ├── kanban/              # 看板（dnd-kit）
│   │   └── task/                # 任务 CRUD
│   ├── lib/
│   │   ├── api-client.ts        # OpenAPI 生成类型 + fetch 封装
│   │   └── utils.ts             # cn()
│   └── hooks/                   # TanStack Query hooks（useTasks 等）
├── server/                      # FastAPI 后端
│   ├── app/
│   │   ├── main.py              # 入口，只装配
│   │   ├── core/                # config / security / db
│   │   ├── models/              # SQLAlchemy 模型
│   │   ├── schemas/             # Pydantic Schema
│   │   ├── api/
│   │   │   ├── v1/              # 路由（auth/teams/boards/tasks/notifications）
│   │   │   ├── deps.py          # 认证/RBAC/租户依赖注入
│   │   │   └── errors.py        # 错误码
│   │   └── services/            # 业务层
│   ├── alembic/                 # 迁移
│   └── requirements.txt
└── docker-compose.yml           # PostgreSQL 17 + pgvector
```

---

## 11. 不可行 / 风险警告

1. （阻塞级，已规避）Next.js 15.x 存在 CVE-2025-66478 远程代码执行漏洞（CVSS 10.0）。必须锁 next@15.5.9+，任何低于补丁线的版本禁止使用。若团队坚持用 16.x，必须 16.0.10+ 且需重估 shadcn 兼容性。
2. （风险）dnd-kit 拖拽为纯前端交互，最终落库依赖 `position` 批量更新接口。并发拖拽（两人同时移动同一列）会互相覆盖，MVP 用"最后写入胜出"可接受，须在 API 文档注明，不引入版本号乐观锁（过度设计）。
3. （风险）SSE 在部分反向代理/负载均衡下连接不稳定（超时、缓冲）。MVP 单机部署无影响；若上云网关需配置 SSE 支持（禁用缓冲、调长超时）。
4. （风险）pgvector 依赖独立镜像 pgvector/pgvector:pg17，标准 postgres 镜像不含扩展。若忘记使用扩展镜像，未来 AI 语义搜索功能将无法启用（需重建容器）。
5. （提示）Python 本机实测版本为 3.13.14（需求文档写 3.13.12），以实测为准，无兼容性影响。
6. （范围护栏）文档协作/即时沟通/日程不在 MVP 范围；架构已预留 SSE/WebSocket 抽象与 notifications 表，但 Phase 2 不实现这些功能，防止镀金。

---

## 12. 端到端验证步骤（Phase 2 完成后执行）

1. `docker compose up -d` 启动 PostgreSQL 17（含 pgvector），`docker compose ps` 确认 healthy。
2. `cd server && uv sync && alembic upgrade head && uvicorn app.main:app --reload`，访问 `http://localhost:8000/docs` 确认 OpenAPI 生成。
3. `cd web && npm install && npm run dev`，访问 `http://localhost:3000`。
4. 注册账号，自动创建默认团队，创建看板，创建 3 列（待办/进行中/完成），创建任务并指派给成员。
5. 打开第二个浏览器（登录另一成员），拖动任务跨列，第一浏览器通过 SSE 收到通知且看板状态一致。
6. 用 viewer 角色登录，确认无编辑按钮、直接调 API 越权返回 40301。
7. 搜索：创建含关键词的任务，调用 `GET /api/v1/boards/:id/tasks?q=关键词` 返回命中。
8. 刷新 access token 过期场景：改短 token 有效期，确认 40101，再 `POST /auth/refresh` 恢复。

---

## 13. 决策记录（ADR 摘要）

- ADR-001：前端 Next.js 15 + 后端 FastAPI + PostgreSQL 17 全栈选型（详见 docs/phase1/decisions/ADR-001-*.md）。
- ADR-002（待补）：图标库锁定 lucide-react —— 本文件 3.5 节即决策正文，Phase 2 拆分为正式 ADR 文件。
- 决策留痕规则：后续任何技术选型变更（升级主版本、引入新依赖、替换组件）必须新增 ADR，禁止静默变更。

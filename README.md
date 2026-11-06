# TeamCollab — 团队协作工具 MVP

给 20-100 人中型团队的「刚刚好」任务协作工具：看板 + 任务 CRUD + 成员协作（评论 / @提及 / 通知）+ 权限（owner / admin / member / viewer）+ 多租户隔离。练手项目，架构为文档协作 / 即时沟通 / 日程**预留扩展位（当前阶段一律不做，详见 [PROJECT_BOUNDARY.md](./PROJECT_BOUNDARY.md)）**。

> **范围宪法**：本项目只做「团队协作 SaaS」这一个产品，不蔓延成多工具平台，不与 project3（调研/分析）重复造轮子。任何越界需求默认打回。

## 技术栈（Spec v1.0 锁定）

| 层 | 选型 |
|----|------|
| 前端 | Next.js 15.5.22 (App Router) + React 19.2 + Tailwind 4.1 + shadcn/ui + lucide-react（P0 唯一图标库）+ react-query + dnd-kit |
| 后端 | FastAPI 0.140 + SQLAlchemy 2.0 + Alembic + PyJWT/bcrypt（禁 python-jose/passlib） |
| 数据库 | PostgreSQL 17（本地环境使用 .pgtmp 独立实例；正式环境 docker-compose） |
| 缓存/多实例 | Redis 7（可选，REDIS_URL 配置后：SSE 广播 / 限流共享计数 / 调度器互斥三件套一键切换） |
| 实时 | SSE（EventSource），WebSocket 预留扩展位 |
| 测试 | 后端 pytest 162 全绿（129 基线 + 9 管理员 + 8 全局搜索 + 5 任务清单 + 11 活动流） + ruff 全绿 + OpenAPI 契约漂移门禁；前端 45 单测 + tsc + ESLint + `next build`；浏览器 E2E 六套（视觉 / 后台 / 主线 / 搜索 / 任务详情 / 活动流） |

## 目录

```
docs/            # Phase 1 三文档 + Spec v1.0 + Phase 2 设计系统（契约）
docs/v1.0-release.md  # v1.0 发布文档（功能清单 / 验收证据 / 已知限制 / 部署形态）
docs/openapi-runtime.json # 运行时 OpenAPI 契约（自动生成，31 路径 / 44 方法，CI 漂移门禁）
web/             # Next.js 前端（10 路由，含 /admin 后台）
server/          # FastAPI 后端（44 端点 / 11 表 / 6 个迁移，头 0006）
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

# 性能冒烟（需后端放开限流启动）：Spec §10 API p95 < 500ms 验收证据
cd server && .venv/Scripts/python.exe scripts/perf_smoke.py

# 填充演示数据（pm@example.com / pass1234，团队“Demo 产品团队”），幂等可重复
cd server && .venv/Scripts/python.exe -m scripts.seed
```

> 注：`.pgtmp` 自带 PostgreSQL 17 实例，无需 Docker 也能完整跑通前后端。

## 生产部署（Docker 全栈一键拉起）

```bash
JWT_SECRET=改成强随机值 docker compose -f docker-compose.prod.yml up -d --build
# 访问 http://localhost（nginx :80 → web + api 双实例）
```

- 拓扑：nginx → [web(Next standalone), api-1 + api-2(FastAPI)] → PostgreSQL(pgvector) + Redis；迁移由一次性 `migrate` 服务先行执行，api 依赖其成功后才启动
- api 双实例 + `REDIS_URL` 必配 → 多实例三件套真实生效（SSE 广播 / 限流共享计数 / 调度器 advisory lock 互斥）
- SSE 经 nginx `proxy_buffering off` + 3600s 读超时透传，长连接不断流
- 前端以 `NEXT_PUBLIC_API_SAME_ORIGIN=1` 构建：浏览器同源请求 `/api/*`，无跨域，`deploy/nginx.conf` 负责反代路由
- ⚠️ 开发环境无 Docker daemon：compose/Dockerfile 经静态校验，首次上机请核对运行时行为

## 部署形态（SSE 多实例）

- 单实例（默认）：无需 Redis，SSE 走进程内 broker；到期提醒由内置后台调度器每 5 分钟扫描（`SCHEDULER_ENABLED=false` 可关闭）。
- 多实例：`docker compose up -d redis`，后端配置 `REDIS_URL=redis://localhost:6379/0`，SSE 经 Redis pub/sub 跨实例广播（发布失败降级为日志，通知已落库不丢），限流计数同样经 Redis 全局共享（登录暴力破解防护不随实例数稀释；Redis 故障时 fail-open 放行），到期提醒扫描由 PG advisory lock 互斥。订阅断开自动重连。

## 验证状态（2026-11-05 历史快照）

> 本节保留当时的验收证据；**当前基线**见顶部「技术栈」表格（后端 162 / 前端 45 / E2E 六套 / 头 0006）。

- 后端：pytest **129 全绿**（auth/teams/tasks/rbac/boards/notifications/comments/scheduler/broker/rate_limit/**拖拽契约/到期时区/生产配置**/**标签+优先级**/**列删除非空保护**/**通知单条已读（含跨用户隔离 404）**）
- 前端：tsc 0 错误、ESLint 0 警告、**单元测试 25/25**（`npm test`，node:test + 原生 TS 类型剥离，零额外依赖）
- 拖拽契约：前后端共用同一套落位语义 —— 路径 `columnId` = **目标列**；`server/tests/test_drag_contract.py`（10 例）与 `web/tests/drag-position.test.mjs`（12 例）互为对照，任一方改动契约必红
- API e2e 冒烟（`server/scripts/e2e_smoke.py`，真实起服）：覆盖注册/登录/**me/me-teams/创建团队**/看板/任务/评论/**跨列拖拽 + 源列写法拒绝 + position 连续性**/我的任务/通知/RBAC/SSE/CORS/到期提醒 —— **26/26 全绿**
- **多实例三件套验证**（`server/scripts/multi_instance_verify.py`，跨进程真实验证）：SSE 广播跨实例 / 限流计数跨实例共享 / 超限跨实例生效 / 调度器 advisory lock 互斥 —— 全部通过
- **验收主线 E2E**（`web/e2e/mainline-e2e.js`，真实浏览器 Playwright）：Spec §2 注册→建板→邀请→成员入队→分配+SSE 实时通知→状态更新→全局视图。脚本已提升到受跟踪路径（原 `.pgtmp` 被 gitignore，CI 拉不到）；浏览器选择可移植——本地 Windows 用系统 Edge，CI 回退 Playwright 自带 chromium
- CI：GitHub Actions push/PR 自动回归（backend：PG+Redis 容器 + **ruff 全绿 + OpenAPI 契约漂移检查** + pytest + API e2e 冒烟 + 多实例验证；frontend：npm ci + tsc + lint + test + build；**e2e-browser**：构建前端 + 起前后端 + Playwright chromium 跑验收主线 E2E）
- P0 门禁：全代码 emoji 零容忍、无紫粉渐变、图标 lucide 唯一

## 多租户与多团队

| 项 | 说明 | 落地位置 |
|----|------|---------|
| 当前团队 | `/me` 的 team 固定取「加入最早的团队」，无法表达用户选择 → 团队与角色改由 `/me/teams` 解析 | `web/src/hooks/use-me.ts` |
| 团队切换 | 侧栏顶部团队名可切换；选择存 localStorage；已不在成员列表中自动回落第一个团队 | `web/src/lib/active-team.ts` + `components/shell/team-switcher.tsx` |
| 项目列表页 | Spec §2 的「项目」= 团队实体 → `/projects` 列出全部所属团队，可新建团队 | `web/src/app/(app)/projects/page.tsx` |
| 缓存隔离 | 切换团队后清理旧团队的看板/成员/详情缓存，避免切回时读到陈旧数据 | `use-me.ts`（`removeQueries`） |

> 「收件箱」仍不作为独立页面：Spec §7 把通知中心定义为「铃铛 + 下拉面板」全局组件（已实现）。
> 「设置」已落地为**团队设置页**（`/teams/{teamId}/settings`，仅 admin 可见入口），当前承载**标签管理**（团队级标签的增删改 + 改色，admin 专属资源），见下方专节。

## 多实例运行时验证（无 Docker 环境下的等价验证）

生产部署依赖 Docker 全栈（nginx + web + api×2 + pg + redis）。本机无 Docker daemon 时，
可用内置的**最小 Redis 协议服务端**做等价的**跨进程**验证：

```bash
cd server && .venv/Scripts/python.exe scripts/multi_instance_verify.py
```

- `scripts/mini_redis.py`：实现项目用到的 Redis 命令子集（INCR/EXPIRE/PUBLISH/PSUBSCRIBE/MULTI/EXEC…），
  与真实 `redis-py` 客户端完全互通
- `scripts/multi_instance_verify.py`：拉起 **2 个真实 uvicorn 进程** + mini-redis，验证
  ① SSE 广播跨实例（A 发布 → B 的订阅者收到）
  ② 限流计数跨实例共享（A 3 次 + B 3 次 = 全局 6）
  ③ 超限判定跨实例生效（A 占满 → B 立刻被拒）
  ④ 调度器 advisory lock 互斥
- 已接入 CI（ubuntu job），本地与 CI 行为一致

> 为什么需要它：compose 的多实例形态依赖 Redis 广播 + 共享计数，这两点在单实例内存实现下无法验证。
> 本机 Docker daemon 不可用（Docker Desktop 依赖 `wsl.exe`，被宿主安全策略拦截），
> 故用真实 TCP + 真实多进程 + 真实 redis-py 客户端替代 Docker 做等价验证。

## 拖拽落位契约（前后端唯一真相源）

| 项 | 约定 | 落地位置 |
|----|------|---------|
| HTTP 路径 | `PATCH /api/v1/boards/{boardId}/columns/{目标列 columnId}/tasks/{taskId}/position` | `web/src/lib/drag-position.ts` |
| 请求体 | `{ target_column_id: 目标列 columnId, position: N }`（与路径一致，冗余校验） | `server/app/services/task_service.py` |
| position 口径 | 目标列中「被悬停项」下标；先移除被拖项自身再插入（等同 dnd-kit `arrayMove`） | 两侧同口径 |
| 落空到列容器 | 追加到列尾 | 同上 |
| 不一致时 | 路径列 ≠ body 目标列 → 400 / 40001（不静默接受） | 同上 |
| 副作用 | 跨列后**源列 position 压紧**为 0..n-1，不留空洞 | `task_service.move_position` |

> 为什么要单列一节：历史上后端测试与前端实现各写各的（后端按「路径=目标列」测，前端传「源列」），
> 94 个测试全绿却漏掉 P0 —— 跨列拖拽在真实环境 100% 返回 400，mock 却正常。

## 标签与优先级（2026-11-05 批次）

看板首个 **多对多** 关系，纯协作 SaaS 范畴内迭代，未触碰边界禁区。

| 项 | 约定 | 落地位置 |
|----|------|---------|
| 标签归属 | 团队级资源（`labels.team_id`），与看板无关 | `server/app/models/label.py` |
| 色彩 | 固定调色板 `blue/green/amber/rose/slate`（避开紫粉渐变门禁） | `VALID_LABEL_COLORS` / `--tag-*` 令牌 |
| 标签 CRUD | `GET/POST/PUT/DELETE /teams/{teamId}/labels`，写操作限 **admin+** | `server/app/api/v1/labels.py` |
| 任务标签赋值 | `PUT /tasks/{taskId}/labels`（整体覆盖），限 **member+**；创建/更新/PATCH 任务均可带 `label_ids`，均做「标签须属本团队」校验 | `label_service.set_task_labels` / `task_service` |
| 列表过滤 | `GET /boards/{boardId}/tasks` 新增 `priority`、`label_id` 查询参数 | `task_repo.list_by_board` |
| 前端三通道 | `api-types / api / mock` 同步补齐类型与方法；抽屉内标签多选 + 卡片标签芯片 + 看板顶部「标签 + 优先级 + 负责人」筛选条（筛选态禁用拖拽以保护落位契约） | `web/src/{lib,hooks,components}` |

> 关键坑：`Task.labels` 用 `lazy="raise"`，列表查询须 `selectinload`（避免 joinedload 行膨胀 `.unique()` 报错）；提交后须 `db.refresh(task, ["labels"])` 刷新集合，否则 identity map 复用陈旧空集合导致返回空标签。

## 看板 / 列管理 + 标签设置页（2026-11-06 批次）

协作 SaaS 范畴内的看板管理能力补全：列删除（此前缺失）、列/看板重命名与删除的前端入口、
以及 admin 专属的**团队设置页（标签管理）**。均落在边界宪法允许范围内。

| 项 | 约定 | 落地位置 |
|----|------|---------|
| 删除列 | `DELETE /columns/{columnId}`，限 **admin+**；**非空列（含任务）被 409 拦截**——`tasks.column_id` 是 `ON DELETE CASCADE`，直接删会静默连删任务，属数据丢失，故先行保护 | `board_service.delete_column` + `require_column_roles(*ADMIN_PLUS)` |
| 列重命名 / 移动 | `PATCH /columns/{columnId}`（`name`/`position`），限 **member+**，前端列头内联编辑 | `KanbanBoard.tsx` 列头 |
| 看板重命名 | `PATCH /boards/{boardId}`（`name`），限 **member+**，前端看板头部内联编辑 | `board-view.tsx` 头部 |
| 删除看板 | `DELETE /boards/{boardId}`，限 **admin+**，删除后跳回 `/boards` | `board-view.tsx` 头部 |
| 标签设置页 | `/teams/{teamId}/settings`（侧栏仅 admin 可见入口），团队级标签的**新建 / 重命名 / 改色 / 删除**，admin 专属 | `teams/[teamId]/settings/page.tsx` + `use-labels.ts` 三个写 hook |
| 前端三通道 | `api / mock` 同步补齐 `updateColumn/deleteColumn/updateBoard/deleteBoard`，mock 层镜像后端非空保护（删非空列返回 40901） | `web/src/lib/{api,mock/api}.ts` |

> 关键设计：删除列**不级联删任务**，而是 409 引导用户先清空/移动任务——协作场景下任务数据比列结构更关键，
> 静默丢失不可接受。这与「删除看板级联删列与任务」（`ON DELETE CASCADE` 由 board→column→task 三段 FK 触发）形成明确分级：删看板是整体性销毁（确认后级联），删单列只动结构。

## 通知中心增强 + 收尾打磨（2026-11-06 批次）

协作 SaaS 范畴内的体验加固，未触碰边界禁区。

| 项 | 约定 | 落地位置 |
|----|------|---------|
| 单条通知已读 | `POST /notifications/{id}/read`，登录态，限定属主（跨用户 → 40401，不泄露存在性）；未读项点击即乐观标记已读、未读角标 -1 | `notification_repo.mark_one_read` + `require` + `useMarkOneRead` + `notification-bell.tsx` `handleOpen` |
| 后端测试 | +2 例：单条翻转只影响目标 / 跨用户隔离 404 + 未登录 401 | `server/tests/test_notifications.py` |
| 空态/错误态文案复核 | 全站 EmptyState / error.tsx / not-found.tsx 文案均含实际指导（符合 PRD §10），无占位/空泛文案，本轮无改动 | `web/src/app/**` |
| 大看板虚拟滚动 | **暂未实施**：Spec §9 仅 >1000 任务/看板触发；当前数据量远低于阈值，且 dnd-kit 虚拟化集成脆弱、易回归拖拽契约，属投机代码；待数据量真实逼近阈值时再按 `@tanstack/react-virtual` + 活跃拖拽项保序方案落地 | 决策记录 |

> 边界自检：本批次仅做通知中心既有页面的交互完善与文案复核，未引入任何 Backlog（F6–F12）功能，符合 `PROJECT_BOUNDARY.md` 锁定范围。

## 已修复的关键缺陷（2026-11-05 评审批次）

1. **跨列拖拽 real 模式必 400**：前端传「源列」进 URL 路径 → 改为传目标列，并抽出 `lib/drag-position.ts` 作为唯一真相源
2. **同列排序乐观更新让卡片消失**：`use-board.ts` 的 map 提前 return → 改为统一走 `applyOptimisticMove` 纯函数
3. **跨列后源列 position 留空洞**：`from_column_id` 计算后未使用 → 补源列重排
4. **到期提醒漏发（时区）**：窗口用 UTC 计算后取 `.date()`，UTC+8 下比本地少算一天 → 改按本地时区计算
5. **全局错误 toast 从未生效**：`makeQueryClient` 零引用 → `providers.tsx` 改用统一实例
6. **登出不清缓存串数据**：登出时补 `queryClient.clear()`
7. **SSE 重连用过期 token**：token 变更广播 → 重建 EventSource
8. **SSE 长连接独占 DB 连接**：依赖链去掉 `get_db` → 长连接期间 `pool.checkedout() == 0`
9. **Docker 下限流键全站塌缩**：compose 补 `FORWARDED_ALLOW_IPS`（否则 nginx 桥接 IP 不受信，client_ip 恒为 nginx）
10. **生产弱密钥兜底**：`JWT_SECRET` 去掉默认值兜底 + `ENVIRONMENT=production` 时启动自检（弱密钥/过短直接拒绝启动）
11. **通知点击无反应**：comment_added / task_due_soon 补 `board_id`；未读数改用服务端 `unreadTotal`（不受分页 limit 影响）
12. **实时看板不同步**：`board_update` 帧被消费 → invalidate 对应看板查询
13. **零错误边界**：补 `error.tsx` / `not-found.tsx` / `loading.tsx`
14. **导航死链**：「看板」误指 `/boards/{teamId}` → 改指看板列表；未实现的「收件箱/项目/设置」按边界宪法不建占位页，直接移除
15. **主题 FOUC + 多实例互相覆盖**：首屏内联脚本同步主题 + 全局单例 store
16. **今日到期误判逾期**：与后端同一时区语义 → 改为与当天结束时刻比较

## 历史已修复的关键缺陷（2026-09 批次）

1. `auth_service.register` / `team_service.create`：DB 侧生成主键（gen_random_uuid）未 flush 就取 id → 补 `db.flush()`
2. `Task.assignee` lazy='raise'：create 返回裸对象序列化崩溃 → commit 后重载关联
3. viewer 只读端点被 403：boards/tasks/comments 的 GET 从 member+ 放宽到 viewer+
4. position 空列基准：`scalar(...) or -1` 中 `0 or -1` 吞 0 → 显式 None 判断（tasks/columns 两处）
5. 测试基建：conftest 无数据清理导致固定邮箱用例重复跑冲突 → session 级 TRUNCATE
6. SSE 测试：TestClient 对长连接流读取挂起（端点实测正常）→ 改为 generator 契约验证

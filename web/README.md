# TeamCollab MVP — 前端

Next.js 15（App Router）任务协作工具前端。设计系统见 `../docs/phase2/`（design-tokens.css 已 import，深浅双主题）。

## 技术栈

Next.js 15.5.22 + React 19.2 + Tailwind 4.1 + shadcn/ui + lucide-react@1.24.0 + @tanstack/react-query + @dnd-kit

## 启动

```bash
npm run dev      # 开发（rewrites 代理 /api -> http://localhost:8000）
npm run build    # 生产构建
npm run start    # 生产服务（默认 3000）
```

API 基址：`NEXT_PUBLIC_API_BASE`（默认 `http://localhost:8000`，FastAPI 后端）。

## 路由

| 路由 | 页面 |
|------|------|
| / | 重定向到我的任务 |
| /login /register | 认证 |
| /boards | 团队看板列表 |
| /boards/[boardId] | 看板（dnd-kit 跨列/同列拖拽 + 任务详情 Drawer + 评论 @提及 + 活动流时间线） |
| /projects | 项目总览 |
| /me/tasks | 我的任务（逾期标红置顶） |
| /teams/[teamId]/members | 成员与角色 |
| /teams/[teamId]/settings | 团队设置（标签管理 / 邀请链接） |
| /admin | 平台管理后台（仅 is_superuser 可见：账号治理 + 团队总览） |
| 全局 | 侧栏 + 64px 顶栏 + 移动 TabBar、通知铃铛、SSE 实时订阅、深浅主题切换 |

## 结构

```
src/
├── app/              # 路由（pages + layouts）
├── components/       # 页面组件 + components/ui（shadcn）
├── hooks/            # react-query hooks（use-board/use-tasks/use-notifications/use-activities/use-admin-*...）
├── lib/              # api.ts（fetch 封装 + token 刷新 + real/mock 双通道）、api-types.ts、activity-format.ts、mock/
└── styles/           # globals.css（@theme inline 映射 + .card-surface/.page-container）、design-tokens.css
```

## 视觉规范（2026-11-06 对齐成熟 SaaS 样式）

- 主色 `#2563EB`、背景 `#F8FAFC`、卡片白 + 12px 圆角 + `0 1px 3px` 轻阴影
- `.page-container` 统一 1200px 居中容器（24px 内边距）；`.card-surface` 统一卡片，改样式只动 `globals.css` 一处
- 输入框 40px 高 / 6px 圆角，顶栏 64px，卡片间距 24px
- 全部 token 集中在 `src/styles/design-tokens.css`；页面禁止硬编码颜色。层级纪律见 `../docs/phase2/DESIGN.md`

## 全局搜索与快捷键

- `⌘K / Ctrl+K` 打开命令面板，跨看板搜任务与看板；后端 `/api/v1/search` 按当前用户所属团队做租户隔离（`tasks` 无 `team_id`，经 `boards.team_id` 兜底）
- `?` 打开快捷键帮助；`C` 在看板第一列快速新建任务；输入框聚焦或弹层打开时单键快捷键自动让位
- 命中任务跳 `/boards/{boardId}?task={taskId}` 深链，自动打开 TaskDrawer；↑↓ 选择、↵ 打开、Esc 关闭
- 搜索支持 real / mock 双通道；纯逻辑在 `src/lib/shortcuts.ts`，单测见 `tests/shortcuts.test.mjs`

## 任务详情

- Drawer 支持开始/截止日期（含前后端双重顺序校验）、状态/优先级/负责人/标签/描述即时保存
- 任务编号取 UUID 去连字符前 8 位（`#xxxxxxxx`），可一键复制；**不是自增序号**，不引入序列列
- 「复制任务」保留全部字段并给标题加「(副本)」，子任务清单会重新生成 id；复制后自动打开副本
- 子任务清单走 `PATCH /tasks/{id}` 整体覆盖，`src/lib/task-detail.ts` 为纯逻辑（编号/进度/复制请求）
- 多层级子任务（4C 新增）：任务可建子任务（`POST /tasks/{id}/subtasks`，继承父 board/列），`parent_id` 自引用，删父时子变顶层；Drawer「子任务（层级）」区块展示子任务并可勾选完成 / 进入 / 删除，看板列表视图「子任务」列显示 `subtask_count` 圆点数字

## 活动流（操作日志时间线）

- Drawer 底部「活动」区块展示任务变更历史：竖线时间轴 + 动作图标 + 操作人 + 相对时间；默认显示最新 5 条，超过 5 条出现「显示全部」
- `GET /api/v1/tasks/{id}/activities` 由 `useActivities` 消费；任务更新 / 新建 / 拖拽 / 发评论 / 改标签后相关 query 自动失效重取
- 文案拼装在纯函数 `src/lib/activity-format.ts`（字段名映射 + 长文本裁剪），单测见 `tests/activity-format.test.mjs`；后端已把值转成可读审计文本，前端不反查
- real / mock 双通道等价：`mock/data.ts` 带历史活动种子，`mock/api.ts` 在相同写操作上埋点，纯前端演示也能看到时间线增长

## 列表 / 表格视图与批量操作

- 看板头部提供「看板视图 / 列表视图」切换，`?view=list` 写进 URL；`label` / `priority` / `assignee` 筛选参数与视图参数共存，切换视图时增量改参不丢条件
- 看板头部「视图」选择器（`ViewSwitcher`）下拉已保存视图，应用即写回 URL 的 `view/filter/sort`；member+ 可「另存为当前筛选」，列表视图额外捕获排序键；筛选↔视图经 `src/lib/board-filter.ts` 的 `toViewFilter` / `fromViewFilter` 互转（往返一致，单测见 `tests/view-filter.test.mjs`）
- 表格复用 `useBoard()` 的 `columns` 做 flatten，纯函数 `src/lib/task-table.ts` 负责筛选 + 排序（状态/优先级按业务顺序而非字典序，无截止日期排末尾）；单测见 `tests/task-table.test.mjs`
- 勾选行后出现批量工具条：改状态 / 改优先级 / 改负责人 / 删除（二次确认）；批量请求走 `POST /tasks/batch`，成功后失效看板、我的任务、活动流与各任务详情缓存
- `viewer` 只读角色下复选框禁用、工具条不出现，与后端角色守卫一致
- Drawer「所属看板」下拉可把任务移到**同团队**其他看板（自动落到目标看板第一列），`useMoveTaskToBoard` 成功后跳到目标看板并保留 `?task=` 深链；real / mock 双通道等价
- 注意：Node 原生 TS 单测不走 bundler，`task-table.ts` 值导入要带 `.ts` 扩展名（`tsconfig.json` 已开 `allowImportingTsExtensions`）

## 验证

```bash
npx tsc --noEmit        # 类型检查
npx next lint           # ESLint
npm test                # node --test（原生 TS 剥离，零新依赖）
npm run build           # 生产构建（本机需 CODEBUDDY_SAFE_DELETE_ENABLED=0，见根 README）
```

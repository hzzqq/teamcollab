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
| /boards/[boardId] | 看板（dnd-kit 跨列/同列拖拽 + 任务详情 Drawer + 评论 @提及） |
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
├── hooks/            # react-query hooks（use-board/use-tasks/use-notifications/use-admin-*...）
├── lib/              # api.ts（fetch 封装 + token 刷新 + real/mock 双通道）、api-types.ts、mock/
└── styles/           # globals.css（@theme inline 映射 + .card-surface/.page-container）、design-tokens.css
```

## 视觉规范（2026-11-06 对齐成熟 SaaS 样式）

- 主色 `#2563EB`、背景 `#F8FAFC`、卡片白 + 12px 圆角 + `0 1px 3px` 轻阴影
- `.page-container` 统一 1200px 居中容器（24px 内边距）；`.card-surface` 统一卡片，改样式只动 `globals.css` 一处
- 输入框 40px 高 / 6px 圆角，顶栏 64px，卡片间距 24px
- 全部 token 集中在 `src/styles/design-tokens.css`；页面禁止硬编码颜色。层级纪律见 `../docs/phase2/DESIGN.md`

## 验证

```bash
npx tsc --noEmit        # 类型检查
npx next lint           # ESLint
npm test                # node --test（原生 TS 剥离，零新依赖）
npm run build           # 生产构建（本机需 CODEBUDDY_SAFE_DELETE_ENABLED=0，见根 README）
```

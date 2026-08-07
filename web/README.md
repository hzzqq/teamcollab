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
| /boards/[boardId] | 看板（dnd-kit 拖拽 + 任务详情 Drawer） |
| /me/tasks | 我的任务（逾期标红置顶） |
| /teams/[teamId]/members | 成员与角色 |
| 全局 | 通知铃铛 + SSE 实时订阅 + 深浅主题切换 |

## 结构

```
src/
├── app/              # 路由（pages + layouts）
├── components/       # 页面组件 + components/ui（shadcn）
├── hooks/            # react-query hooks（use-board/use-tasks/use-notifications...）
├── lib/              # api.ts（fetch 封装 + token 刷新）、api-types.ts、mock/
└── styles/           # globals.css（import design-tokens.css 变量）
```

# ADR-001: 团队协作工具 MVP 技术栈选型

## Status: Accepted (2026-08-05)

## Background

从零构建团队协作工具 MVP（练手/学习项目），主场景为看板 + 任务 CRUD + 成员协作 + RBAC，目标团队规模 20-100 人。开发环境 Windows + Git Bash，Node 22.22.2 / Python 3.13.14 已就绪。需求明确文档协作/即时沟通/日程不在 MVP 范围，但需预留实时能力与多租户隔离扩展位。

决策约束：技术选型可适度前沿但必须可控（练手项目）；必须锁定唯一 SVG 图标库；禁止紫色到粉色渐变主视觉。

## Decision

| 层 | 选择 | 版本 | 备选（落选） |
|---|---|---|---|
| 前端框架 | Next.js（App Router） | next@15.5.9+ | Vite+React SPA / Nuxt 3 / SvelteKit |
| UI 组件 | shadcn/ui + Radix UI + Tailwind CSS | Tailwind 4.1.x | Ant Design / MUI |
| 图标库 | lucide-react | 1.24.0 | Phosphor / Heroicons / antd icons |
| 前端数据层 | TanStack Query | @tanstack/react-query@5.100.x | SWR / 手写 fetch |
| 看板拖拽 | dnd-kit | @dnd-kit/core+sortable+utilities 6.x | @hello-pangea/dnd / 原生 DnD |
| 后端框架 | FastAPI | fastapi@0.140.x | NestJS / Express 5 / Gin |
| ORM/迁移 | SQLAlchemy + Alembic | 2.0.x / 1.14.x | Prisma（需 Node 后端） |
| 数据库 | PostgreSQL | postgres:17 + pgvector 0.8.2 | MySQL / SQLite / MongoDB |
| 认证 | OAuth2 Password + JWT | PyJWT 2.10.x + bcrypt 4.x | Session+Cookie / 第三方 OAuth |
| 实时通知 | SSE | FastAPI 0.135+ 原生 | WebSocket（预留扩展位） |
| 搜索 | PostgreSQL ILIKE | — | tsvector / Meilisearch（扩展位） |

选择理由：
1. Next.js App Router 是业界标准，练手学习价值最高（SSR/App Router/Server Actions），看板交互用 Client Components 不牺牲体验，且与 dnd-kit / shadcn / TanStack Query 生态无缝。
2. FastAPI 自动生成 OpenAPI 文档，与"规格即契约"流程天然契合；Pydantic 类型即验证；0.135+ 原生 SSE 满足实时通知且零额外基础设施；Python 3.13 已就绪。
3. PostgreSQL 单引擎覆盖关系型 + 全文检索 + 向量（pgvector）+ RLS 多租户，是协作类产品行业标准。
4. lucide-react：纯 SVG、ISC 许可、tree-shakeable、React 19 兼容、shadcn 生态默认图标，满足 P0 图标锁定要求。
5. dnd-kit 是当前唯一活跃维护且 React 19 深度适配的拖拽库（react-beautiful-dnd 已停更）。
6. 认证弃用 python-jose/passlib（均停止维护且有 CVE/兼容性问题），采用 PyJWT + bcrypt。

## Consequences

正面：
- 全栈类型安全：OpenAPI（后端）驱动前端生成 TS 类型，联调契约唯一化。
- 练手价值高：覆盖主流前端框架、Python 后端、关系型数据库、认证、实时推送、多租户模式。
- 部署成本低：Vercel（前端）+ Docker（后端+DB）即可，MVP 阶段免费额度覆盖。

负面：
- 双语言栈（TS + Python）学习/维护成本高于纯 TS（NestJS）方案。
- dnd-kit 落库依赖 position 批量更新，并发拖拽最后写入胜出（MVP 可接受）。
- SSE 在部分代理/负载均衡下连接不稳定，上云网关需配置。

## Related ADRs

- ADR-002（待补）：图标库锁定 lucide-react —— 决策正文见 architecture.md §3.5。

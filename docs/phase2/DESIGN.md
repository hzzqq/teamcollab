# 团队协作工具 MVP DESIGN.md

> 生成日期：2026-08-05 | 设计师：颜好看 | 基于：Spec v1.0（§7 页面清单 + §8 Design Token）+ UIUX v1.0
> 三轴刻度：Variance=6 / Motion=3 / Density=7
> 寄存器：Product（设计服务产品，标杆 = 赢得熟悉感）
> 设计源：`docs/phase2/design-tokens.json` + `design-tokens.css`（前端 import，禁止硬编码）

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）

- **视觉主题关键词**：克制、精准、高密度、专业、快速
- **氛围描述**：默认浅色（Asana/Notion 的清爽分层 + Linear 的克制严谨），深色为完整主题（Linear 式近黑底 + 亮度递进层级）。状态用色点而非色块，层级用 1px 边框而非阴影，信息密度向 Linear 看齐——"工具感"优先于"装饰感"。
- **对标品牌**：Linear（主，深色克制/键盘效率/高密度）、Asana（次，浅色分层/任务信息组织）
- **反 AI 模板**：无紫色渐变、无发光边框、无装饰性毛玻璃、无千篇一律 Hero——首屏即真实产品内容（看板）。

## 2. Color Palette & Roles（色彩与角色）

> 完整值见 `design-tokens.json`。以下为摘要，全部经 Token 引用，禁止硬编码（唯一例外 #fff/#000）。

- **A1-identity**：
  - 品牌：`--color-primary-600 #4F46E5`（主色，纯色非渐变）/ `500 #6366F1`（辅助）/ `700 #4338CA`（hover）/ `800 #3730A3`（active）/ `50 #EEF2FF`（浅底）
  - 中性（浅，默认）：`--bg #F8FAFC` / `--surface #FFFFFF` / `--fg #1E293B` / `--muted #64748B` / `--border #E2E8F0`
  - 中性（深）：`--bg #0D1117` / `--surface #161B22` / `--fg #F0F6FC` / `--muted #8A8F98` / `--border #282A2F`
- **A2-semantic**：success `#16A34A`(浅)/`#3FB950`(深)、warn `#D97706`/`#D29922`、danger `#DC2626`/`#F85149`、info `#2563EB`/`#58A6FF`（通用语义，不套 A 股红涨绿跌）
- **B-slot 别名**：`--fg-2`、`--surface-warm`、`--meta`、`--border-soft`、`--focus-ring`、`--elev-raised`
- **C-extension**：状态标签色板 `--tag-blue/green/amber/purple/rose`（仅用于状态点/优先级/标签，小面积）
- **色彩纪律**：每屏 Primary 可见使用 ≤ 2 处（CTA 按钮 + 选中态）；中性色 70-90%，强调色 5-10%，语义色 ≤ 5%，效果色 < 1%；深色层级用亮度递进（`#0D1117 → #161B22 → #21262D`），不用阴影堆叠；禁 `#000`/`#808080` 直用。
- **配色来源**：color-palettes.md 第 1 套（SaaS 通用信任蓝）+ Linear 色板收敛。

## 3. Typography（排版）

- **字体栈**：`--font-display/body: Inter, 'Noto Sans SC', -apple-system, sans-serif`；`--font-mono: 'JetBrains Mono', 'Fira Code', monospace`
- **Google Fonts @import**：
  ```css
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;510;590&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&display=swap');
  ```
- **字号阶梯（8 级）**：12 / 14 / 16 / 18 / 20 / 24 / 32 / 40px（`--text-xs` ~ `--text-4xl`）
  - 表格/列表正文 14px、辅助 12px、看板卡片标题 14px、页面标题 20-24px、大标题 32px（Hero 场景极少，工具页不设巨型标题）
- **字重**：400（正文）/ 510（按钮、表头、小标题）/ 590（大标题、强调）
- **行高**：正文 1.5 / 标题 1.25
- **字距**：ALL CAPS ≥ 0.06em；大标题 -0.02em；正文 0
- **配对来源**：typography-pairings.md Inter 系（SaaS 标准）。

## 4. Components（组件规范）

> 所有组件 5 态覆盖（Loading/Empty/Error/Populated/Edge），全部状态经 Token 引用。

### 4.1 按钮
| 变体 | 背景 | 文字 | 边框 | hover | active | disabled |
|---|---|---|---|---|---|---|
| Primary | `--color-primary-600` | `#fff` | 无 | `--color-primary-700` | `--color-primary-800` | opacity .5 |
| Secondary | `--surface` | `--fg` | `--border` | `--surface-warm` | border→`--fg-2` | opacity .5 |
| Ghost | 透明 | `--fg-2` | 无 | `--surface-warm` | `--border-soft` | opacity .5 |
| Destructive | `--danger` | `#fff` | 无 | danger 加深 8% | 加深 14% | opacity .5 |

- 尺寸：高度 32px（紧凑工具）/ 36px（表单主操作），内边距 10px 16px，圆角 `--radius-md`
- 图标按钮：20px 图标，44×44px 触摸目标（移动端），`aria-label` 必填
- Loading：按钮内 16px spinner（lucide `Loader2` + `animate-spin`）+ 禁用

### 4.2 输入框 / 表单
- 结构：label（14px，`--font-medium`）在上，input 在下，helper/error 文本在 input 下方
- 状态：default（border `--border`）/ focus（`--focus-ring` + border `--color-primary-500`）/ error（border `--danger` + 错误文案 `--danger`）/ disabled（bg `--surface-warm` + 文字 `--meta`）
- 高度 36px，圆角 `--radius-md`，内边距 8px 12px，字号 14px
- 禁用仅 placeholder 当 label；错误文案靠近字段（不只在顶部）
- 表单按钮：主操作 Primary + 次操作 Ghost，loading 态覆盖提交中

### 4.3 表格（TaskTable / MemberTable）
- 表头：`--text-xs`（12px）`--font-medium` `--meta` 色，可排序列带 `ArrowUpDown`/`ChevronUp`/`ChevronDown` 图标
- 行：14px，行高 40px，hover 背景 `--surface-warm`，行分隔 `--border-soft`
- 选中行：左侧 2px 或背景 `--color-primary-50`（浅）/ `--surface-warm`（深）+ Primary 文字强调
- 批量操作栏：选中 ≥1 行出现，含批量改状态/优先级/删除
- 分页：底部，上一页/下一页 + 页码 + 总数；1000+ 行启用虚拟滚动

### 4.4 看板（KanbanBoard + TaskCard + ColumnHeader）
- 列：宽 `--board-column-w`（272px），header = 列名 + 任务计数 + 操作（菜单/加任务），列背景 `--surface-warm`（浅）/ `--surface`（深）
- 卡片：标题 14px（≤200 字截断省略）+ 底部一行（状态点 + 负责人头像 + 截止日期），圆角 `--radius-md`，边框 `--border`
  - Default：白底 + `--border`
  - Hover：border → `--color-primary-500`（浅）/ `--color-primary-500`（深）
  - Active（拖拽中）：`--elev-raised` + 轻微 scale(1.02)，`z-index` 提升
  - Loading（拖拽 placeholder）：虚线框 + 原卡片透明度 0.3
  - Edge：标题超长 `text-overflow: ellipsis`；截止 <24h 显示 `--warn` 色，逾期显示 `--danger` 色 + `CalendarX2` 图标
- 拖拽：dnd-kit，`useSensor(PointerSensor, { activationConstraint: { distance: 8 } })`（防误触），`onDragEnd` 兜底落位；键盘可达（方向键 + Enter 落位，不依赖鼠标）
- 空列：列内显示"暂无任务，点击 + 创建"

### 4.5 通知铃（NotificationBell）
- 铃铛图标 20px（lucide `Bell`），未读数 Badge（`--danger` 底 12px 圆点或数字），点击展开下拉面板（`--elev-raised` + `--z-dropdown`）
- 面板：通知列表（类型图标 + 文案 + 相对时间），未读加 `--color-primary-50` 底（浅）/ `--surface-warm`（深），"全部已读"按钮；SSE 实时推送时铃铛图标微动（150ms 缩放一次，无装饰性动画）
- 空态：Bell 图标 24px + "暂无通知" + 说明

### 4.6 空状态 / 错误 / 加载（三态全局规范）
- **Empty**：Lucide 24px 图标 + 一句话说明（具体、可行动）+ 主 CTA。禁空洞文案（禁 "Welcome to" / "暂无数据" 裸文案）
- **Error**：`--danger` 或 `--meta` 图标 + 具体错误信息 + "重试"按钮；网络错误降级提示
- **Loading**：骨架屏（`--surface-warm` 微光 1200ms 循环）或 16px spinner + 文案；首屏看板用列骨架

### 4.7 导航（应用外壳）
- Sidebar 240px（`--sidebar-width`），可折叠至 64px（仅图标）；顶部 logo + 团队名；导航项：收件箱/我的任务/项目/看板/成员/设置
- 顶部视图栏 56px（`--header-height`）：面包屑 + 视图切换 + 筛选 + 主操作（新建任务 C）
- 移动端（<768px）：Sidebar 收为底部 TabBar（≤5 项，图标 24px + 文字 12px），看板列单列堆叠，Drawer 全屏

### 4.8 模态框 / Drawer / Toast
- Drawer：右滑出 480px（`--drawer-width`），250ms `--ease-standard`，遮罩 `--z-drawer`；移动端全屏
- Modal：居中，`--radius-lg`，`--elev-raised`，300ms，`--z-modal`；删除操作二次确认
- Toast：右下角，`--elev-raised`，150-200ms 进入，300ms 退场，`--z-toast`；操作成功/失败反馈

## 5. Layout & Spacing（布局与间距）

- **间距基准**：4px 网格（`--space-1`=4 … `--space-16`=64），禁止 5/7/13/15px 等非标值
- **圆角阶梯**：4 / 8 / 12 / 9999px（上限 16px）
- **容器**：`--container-max` 1280px；内容区默认 padding `--space-6`（24px）
- **响应式断点**：sm 640 / md 768 / lg 1024 / xl 1280；<768px 布局降级（TabBar + 单列）
- **网格**：内容区 12 列（桌面）/ 8 列（平板）/ 4 列（手机），gap 24px
- **节区节奏**：桌面 80px / 平板 48px / 手机 32px（工具页节区间距统一 `--space-8`/`--space-10`）
- **密度**：Density=7——列表/表格用 `divide-y` + `--border-soft` 分隔，看板卡片紧凑一行，禁止通用大圆角卡片堆叠

## 6. Depth & Elevation（深度与阴影）

- **三级层级**：flat（无阴影，默认）/ ring（`0 0 0 1px var(--border)`，层级表达）/ raised（`--elev-raised`，仅弹层、下拉、拖拽中卡片）
- **z-index**：base 0 / dropdown 1000 / sticky 1100 / drawer 1200 / modal 1300 / toast 1400
- **深色模式**：亮度递进代替阴影（bg → surface → surface-warm），弹层阴影更含蓄
- **禁止**：幽灵卡片（1px 边框 + blur≥16px 阴影同体）、装饰性毛玻璃、渐变文字、侧条纹边框

## 7. Do's & Don'ts（设计守则）

### 应该做
1. 所有颜色/间距/圆角/动效经 Token 引用
2. 状态用色点/小徽标表达，不用大面积色块
3. 层级用 1px 边框与亮度递进，不用阴影堆叠
4. 键盘优先：Cmd/Ctrl+K 搜索、C 新建任务、Enter 编辑、Esc 关闭 Drawer
5. 空状态给具体引导 + CTA；错误给信息 + 重试
6. 图标统一 lucide-react（16/20/24px，描边 1.5px，fill=none + stroke=currentColor）
7. 深色主题完整支持（data-theme 切换），组件不写死两套样式
8. 删除操作二次确认；批量操作有批量栏

### 不应该做
1. 任何 emoji 作功能图标（全项目唯一 lucide-react）
2. 紫→粉渐变、发光边框、装饰性毛玻璃（P0）
3. 硬编码颜色（唯一例外 #fff/#000）；"Welcome to"/"Lorem ipsum" 空洞占位
4. 圆角 ≥24px 的过度圆滑卡片
5. 装饰性/弹跳动画（禁 cubic-bezier 弹跳，动效 ≤300ms）
6. 同一屏幕 3+ 高饱和色；Primary 每屏 >2 处
7. 只读（viewer）成员看到可编辑控件——UI 禁用 + 接口 403 双保险
8. 移除 focus ring / 无 aria-label 的图标按钮（可访问性红线）

## 8. Responsive & Accessibility（响应式与无障碍）

- **响应式**：mobile-first；<768px Sidebar → 底部 TabBar、看板列单列堆叠、Drawer 全屏、触摸目标 ≥44×44px
- **对比度**：正文 ≥ 4.5:1（浅色 `--muted #64748B` 对 `#F8FAFC` 达标；深色 `--muted #8A8F98` 对 `#0D1117` 达标）；大字 ≥ 3:1
- **键盘导航**：全部交互键盘可达，`:focus-visible` 显示 `--focus-ring`；拖拽提供非拖拽替代（方向键/菜单操作）
- **屏幕阅读器**：图标按钮 `aria-label`；表单 label 关联；状态变更 `aria-live="polite"`
- **prefers-reduced-motion**：全局降级（见 design-tokens.css 尾部）
- **5 态覆盖**：Loading（骨架/spinner）/ Empty（引导+CTA）/ Error（信息+重试）/ Populated（正常）/ Edge（截断/超长/零结果/1000+ 虚拟滚动）
- **离线**：断网禁用写操作并提示，读缓存可看

## 9. Agent Implementation Guide（实现指南）

### 9.1 Tailwind 配置建议（Tailwind CSS 4.x）
```js
// tailwind.config.js（tokens 与 design-tokens.css 一一对应）
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "var(--color-primary-50)",
          500: "var(--color-primary-500)",
          600: "var(--color-primary-600)",
          700: "var(--color-primary-700)",
          800: "var(--color-primary-800)",
        },
        bg: "var(--bg)", surface: "var(--surface)",
        "surface-warm": "var(--surface-warm)",
        fg: "var(--fg)", "fg-2": "var(--fg-2)",
        muted: "var(--muted)", meta: "var(--meta)",
        border: "var(--border)", "border-soft": "var(--border-soft)",
        success: "var(--success)", warn: "var(--warn)",
        danger: "var(--danger)", info: "var(--info)",
        tag: { blue: "var(--tag-blue)", green: "var(--tag-green)",
               amber: "var(--tag-amber)", purple: "var(--tag-purple)", rose: "var(--tag-rose)" },
      },
      fontFamily: { display: "var(--font-display)", body: "var(--font-body)", mono: "var(--font-mono)" },
      fontSize: { xs: "var(--text-xs)", sm: "var(--text-sm)", base: "var(--text-base)",
                  lg: "var(--text-lg)", xl: "var(--text-xl)", "2xl": "var(--text-2xl)",
                  "3xl": "var(--text-3xl)", "4xl": "var(--text-4xl)" },
      spacing: { 1: "var(--space-1)", 2: "var(--space-2)", 3: "var(--space-3)", 4: "var(--space-4)",
                 5: "var(--space-5)", 6: "var(--space-6)", 8: "var(--space-8)", 10: "var(--space-10)",
                 12: "var(--space-12)", 16: "var(--space-16)" },
      borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)", pill: "var(--radius-pill)" },
      boxShadow: { flat: "var(--elev-flat)", ring: "var(--elev-ring)", raised: "var(--elev-raised)" },
      transitionDuration: { fast: "var(--motion-fast)", base: "var(--motion-base)", slow: "var(--motion-slow)" },
    },
  },
}
```

### 9.2 主题切换
```tsx
// ThemeProvider 简例：html 上切换 data-theme
document.documentElement.setAttribute("data-theme", "dark");
// 默认浅色；深色值存 localStorage("theme")；监听 prefers-color-scheme 可选
```

### 9.3 图标使用（lucide-react 唯一）
```tsx
import { Plus, Bell, CalendarDays, Flag, Circle } from "lucide-react";
// 统一 size + strokeWidth + fill=none + stroke=currentColor
<Plus size={20} strokeWidth={1.5} className="shrink-0" aria-hidden />
```
- 尺寸：16 行内 / 20 按钮 / 24 独立；颜色继承文本色（`text-muted`/`text-fg-2` 等），禁硬编码 stroke

### 9.4 已知坑提醒（Spec §11 关联设计侧）
- dnd-kit 拖拽抖动：卡片用稳定 id（task.id UUID）、固定卡片高度、`onDragEnd` 兜底、触摸设 `activationConstraint`
- 虚拟滚动：>1000 任务启用，列/表头保持 sticky
- 乐观更新：TanStack Query 乐观更新 + 失败回滚 + Toast 提示重试（AC-14）
- viewer 角色：UI 层禁用编辑控件（disabled + 隐藏操作按钮），接口层 403 双保险（AC-09）

### 9.5 变更记录
| 日期 | 变更 | 原因 | 影响 |
|---|---|---|---|
| 2026-08-05 | DESIGN.md v1.0 初版（与 Spec §8 对齐） | Phase 2 设计系统产出 | 全项目 |

/* ============================================================
   drag-position.ts — 拖拽落位纯函数（前后端契约的唯一真相源）

   契约（与 server/app/services/task_service.py::move_position 对齐）：
   1. HTTP 路径 columnId = 【目标列】（openapi-v2 position 接口定义），
      body.target_column_id 与路径一致做冗余校验。传源列会被后端 400 拒绝。
   2. position = 目标列中「被悬停项」的下标，口径与 dnd-kit arrayMove 一致：
      「先从列表移除被拖项，再把被拖项插入到该下标」。
      落空到列容器（over 不是任务）时 → 追加到列尾。

   这两个函数是纯函数（无 React 依赖），可被 node:test 直接单测，
   防止「前后端各测各的、契约从未在同一处对齐」的回归。
   ============================================================ */

export interface DragTask {
  id: string;
}

export interface DragColumn<T extends DragTask = DragTask> {
  id: string;
  tasks: T[];
}

export interface MoveTarget {
  /** 目标列 id —— 同时用作 HTTP 路径的 columnId 与 body.target_column_id */
  columnId: string;
  /** 目标列内新下标 */
  position: number;
}

/** 找到某个任务所在的列 */
export function findColumnOfTask<T extends DragTask>(
  columns: DragColumn<T>[],
  taskId: string,
): DragColumn<T> | undefined {
  return columns.find((c) => c.tasks.some((t) => t.id === taskId));
}

/**
 * 由拖拽事件（activeId / overId）解析出后端契约所需的落位参数。
 * overId 既可能是任务 id（落到某张卡片上），也可能是列 id（落到列容器空白处）。
 * 无法解析时返回 null（调用方应放弃本次拖拽）。
 */
export function computeMoveTarget<T extends DragTask>(
  columns: DragColumn<T>[],
  activeId: string,
  overId: string,
): MoveTarget | null {
  const sourceCol = findColumnOfTask(columns, activeId);
  if (!sourceCol) return null;

  const targetCol =
    columns.find((c) => c.id === overId) ?? findColumnOfTask(columns, overId);
  if (!targetCol) return null;

  // 落空到列容器 → 追加到列尾；落到具体卡片 → 取该卡片在目标列中的下标
  const overIndex = targetCol.tasks.findIndex((t) => t.id === overId);
  const position = overIndex >= 0 ? overIndex : targetCol.tasks.length;

  return { columnId: targetCol.id, position };
}

/**
 * 乐观更新：把被拖任务移动到目标列的指定下标。
 *
 * 关键点（历史缺陷）：源列与目标列相同时，早期实现用「map 内提前 return」
 * 先移除任务，导致后续的插入分支永不执行 —— 卡片会从看板上凭空消失。
 * 本实现先算出目标列的最终列表，再统一回填，两种场景走同一条路径。
 *
 * 落位口径与后端一致：先从目标列移除被拖项（排除自身），
 * 再把被拖项插入到 position 下标。
 */
export function applyOptimisticMove<T extends DragTask, C extends DragColumn<T>>(
  columns: C[],
  taskId: string,
  targetColumnId: string,
  position: number,
): C[] {
  const sourceCol = findColumnOfTask(columns, taskId);
  const task = sourceCol?.tasks.find((t) => t.id === taskId);
  const targetCol = columns.find((c) => c.id === targetColumnId);
  if (!sourceCol || !task || !targetCol) return columns;

  // 目标列最终列表：排除被拖项自身后按 position 插入（与后端 tasks_in_target 同口径）
  const withoutSelf = targetCol.tasks.filter((t) => t.id !== taskId);
  const pos = Math.max(0, Math.min(position, withoutSelf.length));
  const targetTasks = [
    ...withoutSelf.slice(0, pos),
    { ...task, column_id: targetColumnId } as T,
    ...withoutSelf.slice(pos),
  ];

  return columns.map((col) => {
    // 同列：直接用目标列的最终列表（移除 + 插入一次完成）
    if (col.id === targetColumnId) return { ...col, tasks: targetTasks };
    // 跨列：源列只需移除被拖项
    if (col.id === sourceCol.id) {
      return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
    }
    return col;
  });
}

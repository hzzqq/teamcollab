"""任务数据访问（所有查询携带租户/归属过滤，禁全表扫描）。"""

import uuid
from datetime import date, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.board import Board
from app.models.label import task_labels
from app.models.task import Task

# labels 是集合关系，用 selectinload（独立二次查询）避免 joinedload 在列表查询中
# 造成行膨胀并要求 .unique()；assignee/board 是单值，保留 joinedload。
_TASK_LOADS = (
    joinedload(Task.assignee),
    joinedload(Task.board),
    selectinload(Task.labels),
)


def _base_task_query() -> select:
    return select(Task).options(*_TASK_LOADS)


class TaskRepo:
    def get_by_id(self, db: Session, task_id: uuid.UUID) -> Task | None:
        return db.scalar(_base_task_query().where(Task.id == task_id))

    def create(
        self,
        db: Session,
        board_id: uuid.UUID,
        column_id: uuid.UUID,
        title: str,
        created_by: uuid.UUID,
        description: str | None = None,
        assignee_id: uuid.UUID | None = None,
        priority: str = "medium",
        status: str = "todo",
        position: int = 0,
        due_date: date | None = None,
        start_date: date | None = None,
        checklist: list[dict] | None = None,
    ) -> Task:
        task = Task(
            board_id=board_id,
            column_id=column_id,
            title=title,
            description=description,
            assignee_id=assignee_id,
            priority=priority,
            status=status,
            position=position,
            due_date=due_date,
            start_date=start_date,
            created_by=created_by,
            checklist=checklist or [],
        )
        db.add(task)
        return task

    def max_position_in_column(self, db: Session, column_id: uuid.UUID) -> int:
        """列内最大 position；空列返回 -1（使下一个新任务 position=0）。

        注意：不能写成 `scalar(...) or -1`——max 返回 0 时 0 是 falsy 会被吞掉。
        """
        max_pos = db.scalar(
            select(func.max(Task.position)).where(Task.column_id == column_id)
        )
        return -1 if max_pos is None else max_pos

    def list_by_column(self, db: Session, column_id: uuid.UUID) -> list[Task]:
        return list(
            db.scalars(
                _base_task_query()
                .where(Task.column_id == column_id)
                .order_by(Task.position.asc(), Task.created_at.asc())
            )
        )

    def count_by_column(self, db: Session, column_id: uuid.UUID) -> int:
        """列内任务数（删除列前的非空保护用，避免 ON DELETE CASCADE 静默删任务）。"""
        return db.scalar(select(func.count()).select_from(Task).where(Task.column_id == column_id)) or 0

    def list_by_columns(self, db: Session, column_ids: list[uuid.UUID]) -> list[Task]:
        """看板详情批量加载（避免 N+1），按列 + position 排序。

        只返回顶层任务（parent_id is null）——多层级子任务由 Drawer 的子任务区块单独加载，
        保持看板主视图干净，避免子任务污染列卡片。
        """
        if not column_ids:
            return []
        return list(
            db.scalars(
                _base_task_query()
                .where(Task.column_id.in_(column_ids), Task.parent_id.is_(None))
                .order_by(Task.column_id.asc(), Task.position.asc(), Task.created_at.asc())
            )
        )

    def list_subtasks(self, db: Session, parent_id: uuid.UUID) -> list[Task]:
        """直接子任务（一层），按创建时间排序。"""
        return list(
            db.scalars(
                _base_task_query()
                .where(Task.parent_id == parent_id)
                .order_by(Task.created_at.asc())
            )
        )

    def count_subtasks(self, db: Session, parent_id: uuid.UUID) -> int:
        return (
            db.scalar(
                select(func.count())
                .select_from(Task)
                .where(Task.parent_id == parent_id)
            )
            or 0
        )

    def count_subtasks_batch(self, db: Session, parent_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """批量统计直接子任务数，一次查询，供看板/列表批量标注层级用。"""
        if not parent_ids:
            return {}
        rows = db.execute(
            select(Task.parent_id, func.count())
            .where(Task.parent_id.in_(parent_ids))
            .group_by(Task.parent_id)
        ).all()
        return {pid: cnt for pid, cnt in rows}

    def list_by_board(
        self,
        db: Session,
        board_id: uuid.UUID,
        *,
        q: str | None = None,
        assignee_id: uuid.UUID | None = None,
        status: str | None = None,
        priority: str | None = None,
        label_id: uuid.UUID | None = None,
        column_id: uuid.UUID | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Task], int]:
        conds = [Task.board_id == board_id]
        if q:
            pattern = f"%{q.strip()}%"
            conds.append(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))
        if assignee_id:
            conds.append(Task.assignee_id == assignee_id)
        if status:
            conds.append(Task.status == status)
        if priority:
            conds.append(Task.priority == priority)
        if label_id:
            conds.append(
                Task.id.in_(
                    select(task_labels.c.task_id).where(task_labels.c.label_id == label_id)
                )
            )
        if column_id:
            conds.append(Task.column_id == column_id)

        base = select(Task).where(*conds)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = list(
            db.scalars(
                base.options(*_TASK_LOADS)
                .order_by(Task.position.asc(), Task.created_at.asc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        return items, total

    def list_by_assignee(
        self,
        db: Session,
        user_id: uuid.UUID,
        team_ids: list[uuid.UUID],
        *,
        q: str | None = None,
        status: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Task], int]:
        today = date.today()
        conds = [
            Task.assignee_id == user_id,
            Task.board_id.in_(select(Board.id).where(Board.team_id.in_(team_ids))),
        ]
        if q:
            pattern = f"%{q.strip()}%"
            conds.append(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))
        if status:
            conds.append(Task.status == status)

        overdue = case(
            (
                (Task.due_date.is_not(None))
                & (Task.due_date < today)
                & (Task.status != "done"),
                0,
            ),
            else_=1,
        )
        order = (
            overdue.asc(),
            Task.due_date.asc().nulls_last(),
            Task.created_at.desc(),
        )

        base = select(Task).where(*conds)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = list(
            db.scalars(
                base.options(*_TASK_LOADS)
                .order_by(*order)
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        return items, total

    def list_due_soon(
        self,
        db: Session,
        user_id: uuid.UUID,
        start: datetime,
        end: datetime,
    ) -> list[Task]:
        """assignee=user、due_date∈[start,end]、未完成。"""
        return list(
            db.scalars(
                _base_task_query().where(
                    Task.assignee_id == user_id,
                    Task.due_date.is_not(None),
                    Task.due_date >= start.date(),
                    Task.due_date <= end.date(),
                    Task.status != "done",
                )
            )
        )

    def list_due_soon_assignees(
        self, db: Session, start: datetime, end: datetime
    ) -> list[uuid.UUID]:
        """调度器用：窗口内有临近到期任务的全部 assignee（去重）。"""
        return list(
            db.scalars(
                select(Task.assignee_id)
                .where(
                    Task.assignee_id.is_not(None),
                    Task.due_date.is_not(None),
                    Task.due_date >= start.date(),
                    Task.due_date <= end.date(),
                    Task.status != "done",
                )
                .distinct()
            )
        )


task_repo = TaskRepo()

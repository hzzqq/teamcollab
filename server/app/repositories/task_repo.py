"""任务数据访问（所有查询携带租户/归属过滤，禁全表扫描）。"""

import uuid
from datetime import date, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.board import Board
from app.models.task import Task

_TASK_LOADS = (joinedload(Task.assignee), joinedload(Task.board))


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

    def list_by_columns(self, db: Session, column_ids: list[uuid.UUID]) -> list[Task]:
        """看板详情批量加载（避免 N+1），按列 + position 排序。"""
        if not column_ids:
            return []
        return list(
            db.scalars(
                _base_task_query()
                .where(Task.column_id.in_(column_ids))
                .order_by(Task.column_id.asc(), Task.position.asc(), Task.created_at.asc())
            )
        )

    def list_by_board(
        self,
        db: Session,
        board_id: uuid.UUID,
        *,
        q: str | None = None,
        assignee_id: uuid.UUID | None = None,
        status: str | None = None,
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


task_repo = TaskRepo()

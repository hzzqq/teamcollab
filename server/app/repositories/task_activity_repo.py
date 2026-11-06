"""任务活动日志数据访问（仅按 task_id 查询，禁止跨任务全表扫描）。"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.task_activity import TaskActivity


class TaskActivityRepo:
    def add(
        self,
        db: Session,
        *,
        task_id: uuid.UUID,
        team_id: uuid.UUID,
        actor_id: uuid.UUID | None,
        actor_name: str,
        action: str,
        field: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        created_at: datetime | None = None,
    ) -> TaskActivity:
        row = TaskActivity(
            task_id=task_id,
            team_id=team_id,
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            field=field,
            old_value=old_value,
            new_value=new_value,
        )
        # PG 的 now() 是「事务开始时间」：同一请求内多条日志会拿到完全相同的时间戳，
        # 时间线无法稳定排序。显式传入毫秒递增的 UTC 时间，保证同批日志有序。
        if created_at is not None:
            row.created_at = created_at
        db.add(row)
        return row

    def list_by_task(self, db: Session, task_id: uuid.UUID, limit: int) -> list[TaskActivity]:
        return list(
            db.scalars(
                select(TaskActivity)
                .where(TaskActivity.task_id == task_id)
                .order_by(TaskActivity.created_at.desc(), TaskActivity.id.desc())
                .limit(limit)
            )
        )

    def count_by_task(self, db: Session, task_id: uuid.UUID) -> int:
        return int(
            db.scalar(
                select(func.count())
                .select_from(TaskActivity)
                .where(TaskActivity.task_id == task_id)
            )
            or 0
        )


task_activity_repo = TaskActivityRepo()

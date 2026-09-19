"""通知数据访问。"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification


class NotificationRepo:
    def create(
        self,
        db: Session,
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        type: str,
        payload: dict[str, Any],
    ) -> Notification:
        notification = Notification(team_id=team_id, user_id=user_id, type=type, payload=payload)
        db.add(notification)
        return notification

    def list_by_user(
        self,
        db: Session,
        user_id: uuid.UUID,
        *,
        page: int = 1,
        limit: int = 20,
        unread_only: bool = False,
    ) -> tuple[list[Notification], int]:
        conds = [Notification.user_id == user_id]
        if unread_only:
            conds.append(Notification.is_read.is_(False))
        base = select(Notification).where(*conds)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = list(
            db.scalars(
                base.order_by(Notification.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        return items, total

    def mark_all_read(self, db: Session, user_id: uuid.UUID) -> int:
        """把该用户全部未读通知置为已读，返回更新行数。"""
        result = db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
        )
        return result.rowcount or 0

    def exists_unread_due_soon(self, db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> bool:
        """幂等去重：同 task + task_due_soon + 未读 已存在则跳过。"""
        row = db.scalar(
            select(Notification.id)
            .where(
                Notification.user_id == user_id,
                Notification.type == "task_due_soon",
                Notification.is_read.is_(False),
                Notification.payload["task_id"].astext == str(task_id),
            )
            .limit(1)
        )
        return row is not None

    def exists_recent_due_soon(
        self, db: Session, user_id: uuid.UUID, task_id: uuid.UUID, since: datetime
    ) -> bool:
        """调度器去重：窗口内已提醒过（无论已读未读）则跳过，防止已读后每轮重发。"""
        row = db.scalar(
            select(Notification.id)
            .where(
                Notification.user_id == user_id,
                Notification.type == "task_due_soon",
                Notification.created_at >= since,
                Notification.payload["task_id"].astext == str(task_id),
            )
            .limit(1)
        )
        return row is not None


notification_repo = NotificationRepo()

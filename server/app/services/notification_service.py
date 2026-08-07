"""通知服务：落库 + SSE 发布 + 看板实时事件。"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.realtime.broker import broker
from app.repositories.notification_repo import notification_repo
from app.repositories.team_repo import team_repo


class NotificationService:
    @staticmethod
    def serialize(n: Notification) -> dict[str, Any]:
        return {
            "id": str(n.id),
            "team_id": str(n.team_id),
            "type": n.type,
            "payload": n.payload,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }

    def create(
        self,
        db: Session,
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        ntype: str,
        payload: dict[str, Any],
    ) -> Notification:
        return notification_repo.create(db, team_id, user_id, ntype, payload)

    def publish(self, notification: Notification) -> None:
        broker.publish(str(notification.user_id), self.serialize(notification))

    def publish_board_update(self, db: Session, team_id: uuid.UUID, payload: dict[str, Any]) -> None:
        """看板实时同步事件（不落库，仅 SSE 推给团队全体成员）。"""
        members = team_repo.list_members(db, team_id)
        broker.publish_to_users([str(m.user_id) for m in members], {"type": "board_update", "payload": payload})

    def list_notifications(
        self,
        db: Session,
        user_id: uuid.UUID,
        *,
        page: int = 1,
        limit: int = 20,
        unread_only: bool = False,
    ) -> tuple[list[Notification], int]:
        return notification_repo.list_by_user(db, user_id, page=page, limit=limit, unread_only=unread_only)

    def mark_all_read(self, db: Session, user_id: uuid.UUID) -> int:
        """全部未读置已读，返回更新条数。"""
        updated = notification_repo.mark_all_read(db, user_id)
        db.commit()
        return updated


notification_service = NotificationService()

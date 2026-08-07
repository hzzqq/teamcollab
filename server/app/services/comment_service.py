"""评论服务：创建 + @提及检测（通知被提及成员）。"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models.task_comment import TaskComment
from app.models.user import User
from app.repositories.comment_repo import comment_repo
from app.repositories.task_repo import task_repo
from app.repositories.team_repo import team_repo
from app.services.notification_service import notification_service

# @ 后跟 display_name 或邮箱前缀（支持中文/字母/数字/._+-）
_MENTION_RE = re.compile(r"@([\w\u4e00-\u9fff][\w\u4e00-\u9fff.+-]*)")


class CommentService:
    def list_comments(
        self, db: Session, task_id: uuid.UUID, team_id: uuid.UUID, *, page: int = 1, limit: int = 20
    ) -> tuple[list[TaskComment], int]:
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board.team_id != team_id:
            raise not_found("任务不存在")
        return comment_repo.list_by_task(db, task_id, page=page, limit=limit)

    def create(
        self, db: Session, task_id: uuid.UUID, team_id: uuid.UUID, content: str, actor: User
    ) -> dict[str, Any]:
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board.team_id != team_id:
            raise not_found("任务不存在")
        comment = comment_repo.create(db, task_id, actor.id, content)
        db.flush()

        mentions = self._detect_mentions(db, team_id, content, exclude_id=actor.id)
        notifications: list = []
        for uid in mentions:
            notifications.append(
                notification_service.create(
                    db,
                    team_id,
                    uid,
                    "comment_added",
                    {
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "comment_id": str(comment.id),
                        "comment_snippet": content[:80],
                        "actor_id": str(actor.id),
                    },
                )
            )
        db.commit()

        for n in notifications:
            notification_service.publish(n)
        notification_service.publish_board_update(
            db,
            team_id,
            {
                "event": "comment_added",
                "task_id": str(task.id),
                "board_id": str(task.board_id),
                "comment_id": str(comment.id),
            },
        )
        return {
            "id": comment.id,
            "task_id": comment.task_id,
            "author": {"id": actor.id, "display_name": actor.display_name},
            "content": comment.content,
            "mentions": mentions,
            "created_at": comment.created_at,
        }

    @staticmethod
    def _detect_mentions(
        db: Session, team_id: uuid.UUID, content: str, exclude_id: uuid.UUID
    ) -> list[uuid.UUID]:
        tokens = set(_MENTION_RE.findall(content))
        if not tokens:
            return []
        members = team_repo.list_members(db, team_id)
        matched: list[uuid.UUID] = []
        for member in members:
            if member.user_id == exclude_id:
                continue
            user = member.user  # selectinload 已加载
            hit = user.display_name in tokens or any(
                user.email.lower().startswith(tok.lower()) for tok in tokens
            )
            if hit:
                matched.append(member.user_id)
        return matched


comment_service = CommentService()

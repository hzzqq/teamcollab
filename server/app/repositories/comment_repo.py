"""评论数据访问。"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.task_comment import TaskComment


class CommentRepo:
    def get_by_id(self, db: Session, comment_id: uuid.UUID) -> TaskComment | None:
        return db.get(TaskComment, comment_id)

    def list_by_task(
        self, db: Session, task_id: uuid.UUID, page: int = 1, limit: int = 20
    ) -> tuple[list[TaskComment], int]:
        base = select(TaskComment).where(TaskComment.task_id == task_id)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = list(
            db.scalars(
                base.options(joinedload(TaskComment.author))
                .order_by(TaskComment.created_at.asc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        return items, total

    def create(self, db: Session, task_id: uuid.UUID, author_id: uuid.UUID, content: str) -> TaskComment:
        comment = TaskComment(task_id=task_id, author_id=author_id, content=content)
        db.add(comment)
        return comment


comment_repo = CommentRepo()

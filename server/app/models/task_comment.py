"""task_comments 表。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import UUIDPkMixin

if TYPE_CHECKING:
    from app.models.user import User


class TaskComment(UUIDPkMixin, Base):
    __tablename__ = "task_comments"
    __table_args__ = (
        Index("idx_task_comments_task_created", "task_id", "created_at"),
        CheckConstraint(
            "LENGTH(TRIM(content)) > 0", name="chk_task_comments_content_not_blank"
        ),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(String(2000), nullable=False)
    # 被 @ 提及的用户 id 列表（创建时检测落库；列表接口直接读此字段）
    mentions: Mapped[list[uuid.UUID]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    author: Mapped["User"] = relationship("User", lazy="raise")

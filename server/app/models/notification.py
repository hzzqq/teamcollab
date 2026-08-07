"""notifications 表。"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
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
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import UUIDPkMixin

VALID_NOTIFICATION_TYPES = (
    "task_assigned",
    "task_moved",
    "comment_added",
    "task_due_soon",
)


class Notification(UUIDPkMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "idx_notifications_user_unread_created",
            "user_id",
            "is_read",
            text("created_at DESC"),
        ),
        CheckConstraint(
            "type IN ('task_assigned', 'task_moved', 'comment_added', 'task_due_soon')",
            name="chk_notifications_type",
        ),
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

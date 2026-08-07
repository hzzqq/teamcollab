"""tasks 表。"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.user import User

VALID_PRIORITIES = ("low", "medium", "high", "urgent")
VALID_STATUSES = ("todo", "in_progress", "done")


class Task(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("idx_tasks_board_column_position", "board_id", "column_id", "position"),
        Index("idx_tasks_assignee", "assignee_id"),
        Index("idx_tasks_created_at", "created_at"),
        Index("idx_tasks_due_date", "due_date"),
        Index("idx_tasks_status", "status"),
        CheckConstraint("LENGTH(TRIM(title)) > 0", name="chk_tasks_title_not_blank"),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')", name="chk_tasks_priority"
        ),
        CheckConstraint(
            "status IN ('todo', 'in_progress', 'done')", name="chk_tasks_status"
        ),
        CheckConstraint("position >= 0", name="chk_tasks_position_nonneg"),
        CheckConstraint(
            "start_date IS NULL OR due_date IS NULL OR start_date <= due_date",
            name="chk_tasks_dates",
        ),
    )

    board_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False
    )
    column_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("board_columns.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo")
    position: Mapped[int] = mapped_column(nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    assignee: Mapped["User | None"] = relationship("User", foreign_keys=[assignee_id], lazy="raise")
    board: Mapped["Board"] = relationship("Board", lazy="raise")

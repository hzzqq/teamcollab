"""boards 表。"""

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin


class Board(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "boards"
    __table_args__ = (
        Index("idx_boards_team", "team_id"),
        Index("idx_boards_created_at", "created_at"),
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_boards_name_not_blank"),
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

"""board_columns 表。"""

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin


class BoardColumn(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "board_columns"
    __table_args__ = (
        Index("idx_board_columns_board_position", "board_id", "position"),
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_board_columns_name_not_blank"),
        CheckConstraint("position >= 0", name="chk_board_columns_position_nonneg"),
    )

    board_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    position: Mapped[int] = mapped_column(nullable=False, default=0)

"""teams 表（租户）。"""

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin


class Team(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "teams"
    __table_args__ = (
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_teams_name_not_blank"),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

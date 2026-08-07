"""team_members 表（RBAC 角色实时存储处）。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import UUIDPkMixin

if TYPE_CHECKING:
    from app.models.user import User

VALID_ROLES = ("owner", "admin", "member", "viewer")


class TeamMember(UUIDPkMixin, Base):
    __tablename__ = "team_members"
    __table_args__ = (
        Index("uq_team_members_team_user", "team_id", "user_id", unique=True),
        Index("idx_team_members_user", "user_id"),
        Index("idx_team_members_team", "team_id"),
        CheckConstraint(
            "role IN ('owner', 'admin', 'member', 'viewer')", name="chk_team_members_role"
        ),
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", lazy="raise")

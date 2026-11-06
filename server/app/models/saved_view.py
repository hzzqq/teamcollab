"""saved_views 表：团队级命名视图（筛选 + 排序 + 视图类型快照）。"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin


class SavedView(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "saved_views"

    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 视图类型：看板或列表
    view: Mapped[str] = mapped_column(String(10), nullable=False, default="board")
    # 筛选快照：{ label_id?, priority?, assignee_id? }
    filters: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb"), default=dict
    )
    # 排序（列表视图用）：key + dir(asc/desc)
    sort_key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_dir: Mapped[str | None] = mapped_column(String(4), nullable=True)

"""task_activities 表：任务操作日志（Drawer 活动时间线的数据源）。

设计取舍：
- 一条日志 = 一个可展示的事件，值以「人类可读字符串」落库（审计文本），
  前端不需要为了渲染时间线再反查用户/列/标签。
- actor_name 是写入时的名字快照：账号被删或改名后，历史日志依然可读。
- task_id / team_id 均级联删除，任务或团队消失不残留孤儿日志。
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import UUIDPkMixin

VALID_ACTIVITY_ACTIONS = ("created", "field_changed", "moved", "comment_added")


class TaskActivity(UUIDPkMixin, Base):
    __tablename__ = "task_activities"
    __table_args__ = (
        Index("idx_task_activities_task_created", "task_id", text("created_at DESC")),
        CheckConstraint(
            "action IN ('created', 'field_changed', 'moved', 'comment_added')",
            name="chk_task_activities_action",
        ),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    field: Mapped[str | None] = mapped_column(String(40), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

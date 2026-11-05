"""标签模型 + 任务-标签关联表。

标签是团队级资源（team_id），与 board 无关；通过 task_labels 关联表与任务建立
多对多。这是本项目第一个 m2m 关系，遵循现有 UUIDPkMixin + TimestampMixin +
ondelete CASCADE 风格。color 限定为固定调色板（与前端 tag-* 令牌对齐，避开紫粉
渐变门禁）。
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Table,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin

# 与前端共享的标签调色板（design-tokens.css 的 --tag-* 子集，避开 purple/rose 偏粉）
VALID_LABEL_COLORS = ("blue", "green", "amber", "rose", "slate")

# 任务-标签关联表（显式定义，便于级联删除与唯一约束）
task_labels = Table(
    "task_labels",
    Base.metadata,
    Column("task_id", Uuid, nullable=False),
    Column("label_id", Uuid, nullable=False),
    ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
    ForeignKeyConstraint(["label_id"], ["labels.id"], ondelete="CASCADE"),
    Index("uq_task_labels_task_label", "task_id", "label_id", unique=True),
)


class Label(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "labels"
    __table_args__ = (
        Index("idx_labels_team", "team_id"),
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_labels_name_not_blank"),
        CheckConstraint(
            "color IN ('blue', 'green', 'amber', 'rose', 'slate')",
            name="chk_labels_color",
        ),
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # 仅 app 级默认值（与 tasks.priority 同范式，迁移不加 server_default，避免与
    # alembic check 漂移）；插入一律走 ORM，保证默认值生效。
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="blue")

    tasks: Mapped[list["Task"]] = relationship(  # noqa: F821
        "Task", secondary=task_labels, back_populates="labels", lazy="raise"
    )

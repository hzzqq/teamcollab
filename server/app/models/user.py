"""users 表。"""

from sqlalchemy import Boolean, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPkMixin


class User(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # email 大小写不敏感唯一（应用层统一小写存储）
        Index("uq_users_email", text("lower(email)"), unique=True),
        Index("idx_users_created_at", "created_at"),
    )

    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 全局超级管理员（跨团队协作 SaaS 的平台级管理账号），与团队内 owner/admin 角色正交
    is_superuser: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

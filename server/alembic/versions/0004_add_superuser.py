"""用户表增加 is_superuser（全局超级管理员标记）

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-06

平台级管理账号：与团队内 owner/admin 角色正交，用于 /admin 后台管理全量用户与团队。
默认 false；数据迁移把演示账号 pm@example.com 提升为超级管理员。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # 演示账号提升为超级管理员（幂等：缺省 false，已存在则跳过影响 0 行）
    op.execute("UPDATE users SET is_superuser = true WHERE email = 'pm@example.com'")


def downgrade() -> None:
    op.drop_column("users", "is_superuser")

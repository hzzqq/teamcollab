"""tasks 表增加 checklist（子任务清单 JSONB）

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-06

清单是任务内嵌属性，结构为 [{id, text, done}]，用数组型 JSONB 存储，
避免为「勾选一项」引入独立表与额外端点；旧任务默认空数组。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column(
            "checklist",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "checklist")

"""task_comments 增加 mentions JSONB 列（@提及用户 id 落库）

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-19

修复已知限制：评论列表接口 mentions 此前写死空数组（DB 未落库）。
存量评论经 server_default '[]'::jsonb 回填为空列表，语义正确（创建时未记录）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "task_comments",
        sa.Column(
            "mentions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("task_comments", "mentions")

"""批次 4C：tasks.parent_id（多层级树状自引用）+ saved_views（命名视图）

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. tasks.parent_id：树状父任务，删除父时子任务置空为顶层（保留数据，不级联误删）
    op.add_column("tasks", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_parent_id", "tasks", "tasks", ["parent_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("idx_tasks_parent_id", "tasks", ["parent_id"])

    # 2. saved_views：团队级命名视图（筛选 + 排序 + 视图类型快照）
    op.create_table(
        "saved_views",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("view", sa.String(10), nullable=False, server_default="board"),
        sa.Column(
            "filters",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("sort_key", sa.String(20), nullable=True),
        sa.Column("sort_dir", sa.String(4), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_foreign_key(
        "fk_saved_views_team_id",
        "saved_views",
        "teams",
        ["team_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_saved_views_owner_id",
        "saved_views",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_saved_views_team", "saved_views", ["team_id"])


def downgrade() -> None:
    op.drop_index("idx_saved_views_team", table_name="saved_views")
    op.drop_table("saved_views")
    op.drop_index("idx_tasks_parent_id", table_name="tasks")
    op.drop_constraint("fk_tasks_parent_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "parent_id")
